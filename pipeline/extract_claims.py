"""
Extracción de claims atómicos por noticia usando Claude Opus 4.7.

Por cada noticia en `prensa.noticias` que aún no tenga claims, llama a la API
de Anthropic con un system prompt cacheado y un schema Pydantic de salida
estricto, e inserta los claims resultantes en `prensa.claims`.

Idempotente: re-ejecutar solo procesa noticias sin claims (LEFT JOIN). Si el
ingester recoge nuevas noticias, una segunda corrida extrae solo las nuevas.

Uso:
    python -m pipeline.extract_claims                 # todas las pendientes
    python -m pipeline.extract_claims --limit 20      # solo las 20 más recientes
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import anthropic
from pydantic import BaseModel, Field

from pipeline.db import connect


# Modelo de extracción. Por instrucción del usuario ("sin escatimar"),
# usamos Opus 4.7. Si el coste por corrida pesa más que la calidad de
# extracción (que es upstream del juez), bajar a "claude-sonnet-4-6"
# es seguro: la unidad sensible al modelo es el juez de contradicciones,
# no el extractor.
EXTRACTOR_MODEL = "claude-opus-4-7"


SYSTEM_PROMPT = """Eres un extractor experto de afirmaciones (claims) factuales en noticias de prensa española. Tu trabajo es leer una noticia y extraer **2 a 5 claims atómicos**, idealmente verificables y mutuamente independientes.

## Definición de claim

Un claim es una afirmación atómica del tipo (sujeto, predicado, objeto):
- "Pedro Sánchez anunció una subida del SMI del 5%."
- "El Tribunal Constitucional admitió a trámite el recurso del PP."
- "El Banco de España revisó al alza la previsión de PIB hasta el 2,7%."

Atómica = una sola idea, no varias unidas por "y", "porque" o "mientras que".

## Qué priorizar

1. **Datos cuantitativos**: cifras, porcentajes, fechas, plazos. Son los que más se contradicen entre medios.
2. **Eventos atribuidos**: quién hizo / dijo / decidió qué.
3. **Citas literales del actor** (no del medio). Útiles cuando reescribir cambia el sentido.
4. **Decisiones / acciones formales**: aprobaciones, rechazos, votaciones, sentencias.

## Qué NO extraer

- **Framing del medio**: "el gobierno saca pecho con los datos", "el opositor arremete contra…". Si el periodista interpreta, no es un claim factual.
- **Opinión declarada**: "es preocupante que…", "muestra debilidad de…". Si la extraes, márcala `factual=false` y baja `confianza_extr`.
- **Generalidades sin números ni nombres**: "los expertos dicen que…", "fuentes anónimas señalan…". Demasiado vago para ser verificable.

## Casos límite

- Si la noticia tiene **menos de 2 claims sólidos**, devuelve los que haya (incluso 1 o 0). No inventes para llenar el cupo.
- Si una afirmación tiene una **condición implícita** ("PIB crece un 2% **interanual**"), captúrala dentro de `objeto`. No la pierdas.
- Si la cita es paráfrasis indirecta del actor reportada por el medio, `cita` puede ser la frase del medio que la contiene; baja `confianza_extr` a ~0.6.

## Calibración de confianza

- 0.95–1.0: cita textual entre comillas en el cuerpo o titular.
- 0.75–0.95: paráfrasis fiel sin ambigüedad.
- 0.5–0.75: paráfrasis con leve interpretación.
- 0.25–0.5: inferencia tuya. Probablemente no merece extraerse.

**Prefiere precisión sobre cantidad. Mejor 2 claims muy fieles que 5 con uno inventado.**

## Ejemplo

Noticia:
> "El Consejo de Ministros aprobó hoy la subida del SMI al 5% para 2026, que se aplicará desde febrero. La vicepresidenta primera, Yolanda Díaz, declaró: «Es un avance histórico para los trabajadores»."

Salida esperada (3 claims):

1. sujeto: "Consejo de Ministros" / predicado: "aprobó" / objeto: "la subida del SMI al 5% para 2026" / cita: "El Consejo de Ministros aprobó hoy la subida del SMI al 5%" / tema: "economía" / factual: true / confianza_extr: 0.95
2. sujeto: "subida del SMI" / predicado: "se aplicará desde" / objeto: "febrero" / cita: "se aplicará desde febrero" / tema: "economía" / factual: true / confianza_extr: 0.95
3. sujeto: "Yolanda Díaz" / predicado: "declaró" / objeto: "que la subida es 'un avance histórico para los trabajadores'" / cita: "Es un avance histórico para los trabajadores" / tema: "economía" / factual: true / confianza_extr: 1.0

razonamiento: "Tres elementos verificables: el evento (aprobación + cifra), la fecha de aplicación, y la cita literal de Díaz. Extraigo cada uno por separado para que sean atómicos y comparables claim-a-claim con otras coberturas del mismo evento."
"""


class Claim(BaseModel):
    sujeto: str = Field(description="Entidad o agente principal del claim")
    predicado: str = Field(
        description="Verbo o relación; mantén el tiempo verbal del original"
    )
    objeto: str = Field(description="Lo que se predica del sujeto")
    cita: str | None = Field(
        default=None,
        description=(
            "Cita literal del cuerpo o titular que respalda el claim. "
            "null si es paráfrasis del periodista."
        ),
    )
    tema: str | None = Field(
        default=None,
        description=(
            "Etiqueta temática breve, p. ej. 'economía', 'cataluña', "
            "'inmigración', 'sanidad'. null si dudas."
        ),
    )
    factual: bool = Field(
        description=(
            "True si es afirmación sobre el mundo (datos, eventos, "
            "declaraciones literales). False si es opinión o framing del medio."
        ),
    )
    confianza_extr: float = Field(
        ge=0,
        le=1,
        description="Confianza [0,1] en la fidelidad al texto original.",
    )


class ClaimsExtraction(BaseModel):
    razonamiento: str = Field(
        description=(
            "1-3 frases explicando por qué elegiste estos claims y no otros. "
            "Sirve como auditoría humana del extractor."
        )
    )
    claims: list[Claim] = Field(
        description=(
            "Entre 0 y 5 claims atómicos extraídos de la noticia "
            "(2-5 es lo habitual; 0 si no hay nada factual sólido)."
        )
    )


SELECT_PENDING_SQL = """
SELECT n.id, n.titular, n.descripcion, n.cuerpo, f.nombre AS fuente
FROM prensa.noticias n
JOIN prensa.fuentes f ON f.id = n.fuente_id
WHERE NOT EXISTS (
    SELECT 1 FROM prensa.claims c WHERE c.noticia_id = n.id
)
ORDER BY n.publicada_en DESC
"""

INSERT_CLAIM_SQL = """
INSERT INTO prensa.claims
    (noticia_id, sujeto, predicado, objeto, cita, tema, factual,
     confianza_extr, extractor, metadata)
VALUES
    (%(noticia_id)s, %(sujeto)s, %(predicado)s, %(objeto)s, %(cita)s,
     %(tema)s, %(factual)s, %(confianza_extr)s, %(extractor)s, %(metadata)s);
"""


def fetch_pending(cur, limit: int | None) -> list[dict[str, Any]]:
    if limit is None:
        cur.execute(SELECT_PENDING_SQL)
    else:
        cur.execute(SELECT_PENDING_SQL + "\nLIMIT %s", (limit,))
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_user_message(n: dict[str, Any]) -> str:
    parts = [f"Fuente: {n['fuente']}", f"Titular: {n['titular']}"]
    if n.get("descripcion"):
        parts.append(f"Descripción: {n['descripcion']}")
    if n.get("cuerpo"):
        parts.append(f"\nCuerpo:\n{n['cuerpo']}")
    return "\n".join(parts)


def extract(client: anthropic.Anthropic, n: dict[str, Any]):
    response = client.messages.parse(
        model=EXTRACTOR_MODEL,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": build_user_message(n)}],
        output_format=ClaimsExtraction,
    )
    return response.parsed_output, response.usage


def main(limit: int | None = None) -> None:
    client = anthropic.Anthropic()
    conn = connect()
    try:
        with conn.cursor() as cur:
            noticias = fetch_pending(cur, limit)

        if not noticias:
            print("No hay noticias pendientes.")
            return

        total_claims = 0
        for i, n in enumerate(noticias, 1):
            try:
                extraction, usage = extract(client, n)
            except anthropic.APIError as e:
                print(
                    f"  ! [{i}/{len(noticias)}] {n['id']}: API error — {e}",
                    file=sys.stderr,
                )
                continue
            except Exception as e:
                print(
                    f"  ! [{i}/{len(noticias)}] {n['id']}: {e}",
                    file=sys.stderr,
                )
                continue

            try:
                with conn.cursor() as cur:
                    for claim in extraction.claims:
                        cur.execute(
                            INSERT_CLAIM_SQL,
                            {
                                "noticia_id": n["id"],
                                "sujeto": claim.sujeto,
                                "predicado": claim.predicado,
                                "objeto": claim.objeto,
                                "cita": claim.cita,
                                "tema": claim.tema,
                                "factual": claim.factual,
                                "confianza_extr": claim.confianza_extr,
                                "extractor": EXTRACTOR_MODEL,
                                "metadata": json.dumps(
                                    {"razonamiento": extraction.razonamiento}
                                ),
                            },
                        )
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(
                    f"  ! Insertando claims para {n['id']}: {e}",
                    file=sys.stderr,
                )
                continue

            total_claims += len(extraction.claims)
            cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
            print(
                f"  [{i:3d}/{len(noticias)}] "
                f"{(n['titular'] or '')[:60]:60} "
                f"+{len(extraction.claims)} claims  cache:{cache_read}"
            )

        print(
            f"\nTotal: {total_claims} claims insertados sobre "
            f"{len(noticias)} noticias procesadas."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesa como mucho N noticias (las más recientes pendientes).",
    )
    args = parser.parse_args()
    main(limit=args.limit)

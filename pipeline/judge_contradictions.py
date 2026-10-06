"""
Juez automático de contradicciones entre claims, usando Gemini Flash (el
modelo exacto vive en pipeline/gemini.py — no lo dupliques aquí, cambia
según lo que Google mantenga en el tier gratuito).

Para cada claim con embedding, busca candidatos por similitud coseno
(sobremuestreo HNSW top-50, filtrado en Python: distinta noticia, par no
evaluado aún), y hace UNA llamada al juez por claim-fuente que evalúa todos
sus candidatos a la vez. Escribe todo veredicto en `prensa.pares_evaluados`
(memoria para no re-evaluar) y, si el label es `contradiccion`, además en
`prensa.contradicciones`, recalculando `noticias.intensidad_contradiccion`/
`eje_z` de las dos noticias implicadas.

Idempotente y acumulativo: procesa TODOS los claims con embedding en cada
corrida (no solo los nuevos), porque un claim antiguo puede tener un
candidato nuevo que no existía la vez anterior. El coste real está acotado
por `pares_evaluados`: si ya se evaluó un par, no se vuelve a mandar al LLM
(y con el Gemini Flash del tier gratuito el coste es, de todos modos, cero
mientras no se cambie a un modelo de pago — ver RULES-COSTS.md).

Uso:
    python -m pipeline.judge_contradictions                 # todos los claims
    python -m pipeline.judge_contradictions --limit 50      # solo 50 claims fuente
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from pipeline.db import connect
from pipeline.gemini import GEMINI_MODEL, GeminiError, generate_json


# Antes "nunca modelos superiores a Sonnet 5". Ahora que el juez corre en
# Gemini (RULES-COSTS.md: gratis mientras sea un modelo Flash del tier
# gratuito), el techo equivalente es no subir a un modelo *Pro* o de pago
# sin autorización de coste — no tocar esta constante sin pasar antes por
# Ignacio.
JUEZ_MODEL = GEMINI_MODEL

ANN_OVERSAMPLE = 50  # candidatos brutos por claim (antes de filtrar)
MAX_CANDIDATOS = 8  # candidatos que se le pasan al LLM tras filtrar

# Ver SLEEP_ENTRE_LLAMADAS en extract_claims.py: mismo motivo (tier
# gratuito de Gemini limitado a ~20 req/min, verificado 2026-09-29).
SLEEP_ENTRE_LLAMADAS = 4.5

CRITERIOS_PATH = Path(__file__).resolve().parent.parent / "docs" / "contradiccion-criterios.md"

CABECERA_BATCH = """Vas a recibir un CLAIM FUENTE y una lista numerada de CLAIMS CANDIDATOS de otras noticias. Para cada candidato, aplica exactamente el criterio de abajo y devuelve un veredicto (label + intensidad + razonamiento breve).

- Si el label es `contradiccion` por cifras oficiales de organismos distintos (ver "Casos límite" abajo), marca `metadata_tipo="fuentes_oficiales"`.
- Para labels que no sean `contradiccion`, usa `intensidad=0`.
- `candidato_idx` en tu respuesta debe ser el número exacto (1-based) del candidato en la lista recibida.

---

"""


def _load_system_prompt() -> str:
    criterios = CRITERIOS_PATH.read_text(encoding="utf-8")
    return CABECERA_BATCH + criterios


class Veredicto(BaseModel):
    candidato_idx: int = Field(description="Índice 1-based del candidato evaluado")
    label: Literal["contradiccion", "coincidencia", "no_relacionado", "ambiguo"]
    intensidad: float = Field(default=0.0, ge=0, le=1)
    razonamiento: str = Field(default="", description="1-2 frases justificando el label")
    metadata_tipo: str | None = Field(
        default=None,
        description="'fuentes_oficiales' si aplica el caso límite documentado; null en cualquier otro caso.",
    )


class JuicioClaim(BaseModel):
    veredictos: list[Veredicto]


SELECT_CLAIMS_SQL = """
SELECT c.id AS claim_id, c.noticia_id, c.sujeto, c.predicado, c.objeto, c.cita,
       n.titular, f.nombre AS fuente_nombre, e.embedding
FROM prensa.claims c
JOIN prensa.embeddings e ON e.claim_id = c.id
JOIN prensa.noticias n ON n.id = c.noticia_id
JOIN prensa.fuentes f ON f.id = n.fuente_id
ORDER BY c.created_at DESC
"""

CANDIDATOS_ANN_SQL = """
SELECT c2.id AS claim_id, c2.noticia_id, c2.sujeto, c2.predicado, c2.objeto, c2.cita,
       n2.titular, f2.nombre AS fuente_nombre,
       (e2.embedding <=> %(vec)s::vector) AS distancia
FROM prensa.embeddings e2
JOIN prensa.claims c2 ON c2.id = e2.claim_id
JOIN prensa.noticias n2 ON n2.id = c2.noticia_id
JOIN prensa.fuentes f2 ON f2.id = n2.fuente_id
WHERE c2.id != %(claim_id)s
ORDER BY e2.embedding <=> %(vec)s::vector
LIMIT %(oversample)s;
"""

PARES_EVALUADOS_DEL_CLAIM_SQL = """
SELECT claim_a_id, claim_b_id FROM prensa.pares_evaluados
WHERE claim_a_id = %(claim_id)s OR claim_b_id = %(claim_id)s;
"""

INSERT_PAR_EVALUADO_SQL = """
INSERT INTO prensa.pares_evaluados
    (claim_a_id, claim_b_id, label, intensidad, similitud_coseno, juez, metadata)
VALUES
    (%(claim_a_id)s, %(claim_b_id)s, %(label)s, %(intensidad)s, %(similitud_coseno)s, %(juez)s, %(metadata)s)
ON CONFLICT (claim_a_id, claim_b_id) DO NOTHING;
"""

INSERT_CONTRADICCION_SQL = """
INSERT INTO prensa.contradicciones
    (claim_a_id, claim_b_id, tema, intensidad, razonamiento, juez, metadata)
VALUES
    (%(claim_a_id)s, %(claim_b_id)s, %(tema)s, %(intensidad)s, %(razonamiento)s, %(juez)s, %(metadata)s)
ON CONFLICT (claim_a_id, claim_b_id) DO NOTHING;
"""

RECALC_INTENSIDAD_SQL = """
WITH max_int AS (
    SELECT COALESCE(MAX(ctr.intensidad), 0) AS v
    FROM prensa.contradicciones ctr
    JOIN prensa.claims c ON c.id IN (ctr.claim_a_id, ctr.claim_b_id)
    WHERE c.noticia_id = %(noticia_id)s
)
UPDATE prensa.noticias
SET intensidad_contradiccion = (SELECT v FROM max_int),
    eje_z = (SELECT v FROM max_int) * 3
WHERE id = %(noticia_id)s;
"""


def canonical_pair(id_a: str, id_b: str) -> tuple[str, str]:
    return (id_a, id_b) if id_a < id_b else (id_b, id_a)


def fetch_claims(cur, limit: int | None) -> list[dict[str, Any]]:
    if limit is None:
        cur.execute(SELECT_CLAIMS_SQL)
    else:
        cur.execute(SELECT_CLAIMS_SQL + "\nLIMIT %s", (limit,))
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_candidatos(cur, claim_fuente: dict[str, Any]) -> list[dict[str, Any]]:
    cur.execute(
        CANDIDATOS_ANN_SQL,
        {
            "vec": claim_fuente["embedding"],
            "claim_id": claim_fuente["claim_id"],
            "oversample": ANN_OVERSAMPLE,
        },
    )
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def filtrar_candidatos(cur, claim_fuente: dict[str, Any], candidatos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cur.execute(PARES_EVALUADOS_DEL_CLAIM_SQL, {"claim_id": claim_fuente["claim_id"]})
    ya_evaluados: set[str] = set()
    for a, b in cur.fetchall():
        ya_evaluados.add(a if a != claim_fuente["claim_id"] else b)

    filtrados = [
        c
        for c in candidatos
        if c["noticia_id"] != claim_fuente["noticia_id"] and c["claim_id"] not in ya_evaluados
    ]
    return filtrados[:MAX_CANDIDATOS]


def _format_claim(c: dict[str, Any]) -> str:
    parts = [f"Noticia: {c['titular']} ({c['fuente_nombre']})", f"Claim: {c['sujeto']} {c['predicado']} {c['objeto']}"]
    if c.get("cita"):
        parts.append(f'Cita: "{c["cita"]}"')
    return "\n  ".join(parts)


def build_user_message(claim_fuente: dict[str, Any], candidatos: list[dict[str, Any]]) -> str:
    lines = ["CLAIM FUENTE:\n  " + _format_claim(claim_fuente), "\nCLAIMS CANDIDATOS:"]
    for idx, cand in enumerate(candidatos, start=1):
        lines.append(f"\n{idx}. " + _format_claim(cand))
    return "\n".join(lines)


def judge(claim_fuente: dict[str, Any], candidatos: list[dict[str, Any]]):
    raw, usage = generate_json(
        _load_system_prompt(),
        build_user_message(claim_fuente, candidatos),
    )
    data = json.loads(raw)
    if isinstance(data, list):
        data = {"veredictos": data}
    elif isinstance(data, dict) and "veredictos" not in data:
        for val in data.values():
            if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                data["veredictos"] = val
                break

    if isinstance(data, dict) and "veredictos" in data:
        for v in data["veredictos"]:
            if isinstance(v, dict):
                if "razonamiento" not in v:
                    v["razonamiento"] = (
                        v.get("justificacion")
                        or v.get("explicacion")
                        or v.get("motivo")
                        or v.get("reasoning")
                        or ""
                    )
                if "intensidad" not in v:
                    v["intensidad"] = 0.0
                if "label" in v and v["label"] not in ("contradiccion", "coincidencia", "no_relacionado", "ambiguo"):
                    # Normalizar pequeñas variaciones como 'contradicción' con tilde
                    lbl = str(v["label"]).lower().replace("ó", "o")
                    v["label"] = lbl if lbl in ("contradiccion", "coincidencia", "no_relacionado", "ambiguo") else "no_relacionado"

    return JuicioClaim.model_validate(data), usage


def main(limit: int | None = None) -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            claims = fetch_claims(cur, limit)

        if not claims:
            print("No hay claims con embedding. Corre antes: python -m pipeline.embed_claims", file=sys.stderr)
            return

        total_veredictos = 0
        total_contradicciones = 0
        llamadas_hechas = 0
        for i, claim_fuente in enumerate(claims, 1):
            with conn.cursor() as cur:
                candidatos_raw = fetch_candidatos(cur, claim_fuente)
                candidatos = filtrar_candidatos(cur, claim_fuente, candidatos_raw)

            if not candidatos:
                continue

            if llamadas_hechas > 0:
                time.sleep(SLEEP_ENTRE_LLAMADAS)
            llamadas_hechas += 1

            try:
                juicio, usage = judge(claim_fuente, candidatos)
            except GeminiError as e:
                print(f"  ! [{i}/{len(claims)}] {claim_fuente['claim_id']}: API error — {e}", file=sys.stderr)
                continue
            except ValidationError as e:
                print(f"  ! [{i}/{len(claims)}] {claim_fuente['claim_id']}: respuesta fuera de schema — {e}", file=sys.stderr)
                continue
            except Exception as e:
                print(f"  ! [{i}/{len(claims)}] {claim_fuente['claim_id']}: {e}", file=sys.stderr)
                continue

            nuevas_contradicciones = 0
            try:
                with conn.cursor() as cur:
                    for v in juicio.veredictos:
                        if not (1 <= v.candidato_idx <= len(candidatos)):
                            print(
                                f"  ! candidato_idx {v.candidato_idx} fuera de rango (1-{len(candidatos)}), se descarta",
                                file=sys.stderr,
                            )
                            continue
                        cand = candidatos[v.candidato_idx - 1]
                        claim_a_id, claim_b_id = canonical_pair(claim_fuente["claim_id"], cand["claim_id"])
                        similitud = 1 - cand["distancia"]  # pgvector <=> es distancia coseno, no similitud

                        cur.execute(
                            INSERT_PAR_EVALUADO_SQL,
                            {
                                "claim_a_id": claim_a_id,
                                "claim_b_id": claim_b_id,
                                "label": v.label,
                                "intensidad": v.intensidad,
                                "similitud_coseno": similitud,
                                "juez": JUEZ_MODEL,
                                "metadata": "{}",
                            },
                        )

                        if v.label == "contradiccion":
                            tema = claim_fuente.get("tema") or "general"
                            metadata = (
                                '{"tipo": "fuentes_oficiales"}' if v.metadata_tipo == "fuentes_oficiales" else "{}"
                            )
                            cur.execute(
                                INSERT_CONTRADICCION_SQL,
                                {
                                    "claim_a_id": claim_a_id,
                                    "claim_b_id": claim_b_id,
                                    "tema": tema,
                                    "intensidad": v.intensidad,
                                    "razonamiento": v.razonamiento,
                                    "juez": JUEZ_MODEL,
                                    "metadata": metadata,
                                },
                            )
                            cur.execute(RECALC_INTENSIDAD_SQL, {"noticia_id": claim_fuente["noticia_id"]})
                            cur.execute(RECALC_INTENSIDAD_SQL, {"noticia_id": cand["noticia_id"]})
                            nuevas_contradicciones += 1

                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"  ! escribiendo veredictos de {claim_fuente['claim_id']}: {e}", file=sys.stderr)
                continue

            total_veredictos += len(juicio.veredictos)
            total_contradicciones += nuevas_contradicciones
            tokens_in = usage.get("promptTokenCount", 0)
            tokens_out = usage.get("candidatesTokenCount", 0)
            print(
                f"  [{i:4d}/{len(claims)}] {len(candidatos)} candidatos  "
                f"+{nuevas_contradicciones} contradicciones  tokens:{tokens_in}/{tokens_out}"
            )

        print(
            f"\nTotal: {total_veredictos} veredictos, {total_contradicciones} contradicciones nuevas "
            f"sobre {len(claims)} claims procesados."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesa como mucho N claims fuente (los más recientes).",
    )
    args = parser.parse_args()
    main(limit=args.limit)

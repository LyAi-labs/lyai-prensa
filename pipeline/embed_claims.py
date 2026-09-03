"""
Embeddings de claims vía Voyage AI, para poder buscar candidatos por
similitud coseno antes de invocar al juez LLM (ver judge_contradictions.py).

Por cada claim en `prensa.claims` que aún no tenga fila en `prensa.embeddings`,
genera su vector con Voyage AI (modelo `voyage-4`, 1024 dimensiones) e inserta
en `prensa.embeddings`.

Idempotente: re-ejecutar solo procesa claims sin embedding (NOT EXISTS). Se
embebe en lote (Voyage acepta varios textos por llamada), a diferencia del
extractor de claims que necesita una llamada de razonamiento por noticia.

Uso:
    python -m pipeline.embed_claims                 # todos los pendientes
    python -m pipeline.embed_claims --limit 200      # solo los 200 más recientes
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import voyageai

from pipeline.db import connect


EMBEDDING_MODEL = "voyage-4"
EMBEDDING_DIM = 1024
BATCH_SIZE = 128  # claims por llamada a Voyage


SELECT_PENDING_SQL = """
SELECT c.id AS claim_id, c.sujeto, c.predicado, c.objeto, f.idioma
FROM prensa.claims c
JOIN prensa.noticias n ON n.id = c.noticia_id
JOIN prensa.fuentes f ON f.id = n.fuente_id
WHERE NOT EXISTS (
    SELECT 1 FROM prensa.embeddings e WHERE e.claim_id = c.id
)
ORDER BY c.created_at DESC
"""

INSERT_EMBEDDING_SQL = """
INSERT INTO prensa.embeddings
    (claim_id, idioma, texto_origen, embedding, modelo)
VALUES
    (%(claim_id)s, %(idioma)s, %(texto_origen)s, %(embedding)s::vector, %(modelo)s);
"""


def fetch_pending(cur, limit: int | None) -> list[dict[str, Any]]:
    if limit is None:
        cur.execute(SELECT_PENDING_SQL)
    else:
        cur.execute(SELECT_PENDING_SQL + "\nLIMIT %s", (limit,))
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_texto_origen(claim: dict[str, Any]) -> str:
    # Deliberadamente sin la `cita`: es evidencia de apoyo, no la afirmación
    # en sí — incluirla metería ruido entre medios que citan con distinta
    # extensión la misma declaración.
    return f"{claim['sujeto']} {claim['predicado']} {claim['objeto']}"


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(repr(v) for v in values) + "]"


def main(limit: int | None = None) -> None:
    client = voyageai.Client()
    conn = connect()
    try:
        with conn.cursor() as cur:
            claims = fetch_pending(cur, limit)

        if not claims:
            print("No hay claims pendientes de embedding.")
            return

        total = 0
        for i in range(0, len(claims), BATCH_SIZE):
            batch = claims[i : i + BATCH_SIZE]
            textos = [build_texto_origen(c) for c in batch]
            try:
                # input_type=None: la comparación es simétrica claim-contra-
                # claim, no búsqueda asimétrica query-vs-documento.
                result = client.embed(
                    textos,
                    model=EMBEDDING_MODEL,
                    input_type=None,
                    output_dimension=EMBEDDING_DIM,
                )
            except Exception as e:
                print(
                    f"  ! lote [{i}:{i + len(batch)}]: {e}",
                    file=sys.stderr,
                )
                continue

            try:
                with conn.cursor() as cur:
                    for claim, vec in zip(batch, result.embeddings):
                        cur.execute(
                            INSERT_EMBEDDING_SQL,
                            {
                                "claim_id": claim["claim_id"],
                                "idioma": claim["idioma"] or "es",
                                "texto_origen": build_texto_origen(claim),
                                "embedding": vector_literal(vec),
                                "modelo": EMBEDDING_MODEL,
                            },
                        )
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(
                    f"  ! insertando lote [{i}:{i + len(batch)}]: {e}",
                    file=sys.stderr,
                )
                continue

            total += len(batch)
            print(f"  [{i + len(batch):5d}/{len(claims)}] +{len(batch)} embeddings")

        print(f"\nTotal: {total} embeddings insertados sobre {len(claims)} claims pendientes.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesa como mucho N claims (los más recientes pendientes).",
    )
    args = parser.parse_args()
    main(limit=args.limit)

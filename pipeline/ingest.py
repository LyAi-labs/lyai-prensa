"""
Ingester de RSS. Para cada fuente activa, descarga el feed, parsea los
items y los inserta en `prensa.noticias` (dedup por (fuente_id, id_externo)).

Commit por fuente: si una falla las demás se conservan.

Uso:
    python -m pipeline.ingest
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import Any

import feedparser

from pipeline.db import connect


USER_AGENT = "LyAi-Prensa/1.0 (+https://github.com/LyAi-labs/lyai-prensa)"

SELECT_FUENTES_SQL = """
SELECT id, slug, nombre, rss_url
FROM prensa.fuentes
WHERE activo = true AND rss_url IS NOT NULL
ORDER BY slug;
"""

INSERT_NOTICIA_SQL = """
INSERT INTO prensa.noticias
    (fuente_id, id_externo, titular, descripcion, enlace, publicada_en)
VALUES
    (%(fuente_id)s, %(id_externo)s, %(titular)s, %(descripcion)s,
     %(enlace)s, %(publicada_en)s)
ON CONFLICT (fuente_id, id_externo) DO NOTHING
RETURNING id;
"""


def _parse_published(entry: Any) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if parsed is None:
        return None
    return datetime(*parsed[:6], tzinfo=timezone.utc)


def _id_externo(entry: Any) -> str | None:
    # Preferimos guid/id; fallback al link.
    return getattr(entry, "id", None) or getattr(entry, "link", None)


def _ingest_fuente(cur, fuente: dict[str, Any]) -> tuple[int, int]:
    feed = feedparser.parse(fuente["rss_url"], agent=USER_AGENT)
    if feed.bozo and not feed.entries:
        print(
            f"  ! {fuente['slug']}: feed inválido sin entries — skip",
            file=sys.stderr,
        )
        return 0, 0

    insertadas = 0
    saltadas = 0
    for entry in feed.entries:
        id_externo = _id_externo(entry)
        if not id_externo:
            saltadas += 1
            continue
        publicada_en = _parse_published(entry) or datetime.now(timezone.utc)
        cur.execute(
            INSERT_NOTICIA_SQL,
            {
                "fuente_id": fuente["id"],
                "id_externo": id_externo,
                "titular": (getattr(entry, "title", "") or "")[:1000],
                "descripcion": (getattr(entry, "summary", "") or "")[:5000],
                "enlace": getattr(entry, "link", "") or "",
                "publicada_en": publicada_en,
            },
        )
        if cur.fetchone() is not None:
            insertadas += 1
        else:
            saltadas += 1
    return insertadas, saltadas


def main() -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(SELECT_FUENTES_SQL)
            cols = [c.name for c in cur.description]
            fuentes = [dict(zip(cols, row)) for row in cur.fetchall()]

        if not fuentes:
            print(
                "No hay fuentes activas. Ejecuta antes:\n"
                "    python -m pipeline.seed_fuentes",
                file=sys.stderr,
            )
            return

        total_ins = 0
        total_skip = 0
        for fuente in fuentes:
            try:
                with conn.cursor() as cur:
                    ins, skip = _ingest_fuente(cur, fuente)
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"  ! {fuente['slug']}: {e}", file=sys.stderr)
                continue
            print(f"  {fuente['slug']:20} +{ins:4d}  (skip {skip})")
            total_ins += ins
            total_skip += skip

        print(f"\nTotal: +{total_ins} insertadas, {total_skip} saltadas")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

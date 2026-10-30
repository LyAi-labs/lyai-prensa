"""
Pobla `prensa.fuentes` desde `pipeline.fuentes.FUENTES`.

Idempotente: UPSERT por slug. Re-ejecutar solo actualiza valores cambiados.

Uso:
    python -m pipeline.seed_fuentes
"""

from __future__ import annotations

from pipeline.db import transaction
from pipeline.fuentes import FUENTES


UPSERT_SQL = """
INSERT INTO prensa.fuentes
    (slug, nombre, pais, idioma, rss_url, web_url, color, sesgo, activo)
VALUES
    (%(slug)s, %(nombre)s, %(pais)s, %(idioma)s, %(rss_url)s, %(web_url)s,
     %(color)s, %(sesgo)s, true)
ON CONFLICT (slug) DO UPDATE SET
    nombre   = EXCLUDED.nombre,
    pais     = EXCLUDED.pais,
    idioma   = EXCLUDED.idioma,
    rss_url  = EXCLUDED.rss_url,
    web_url  = EXCLUDED.web_url,
    color    = EXCLUDED.color,
    sesgo    = EXCLUDED.sesgo,
    activo   = true,
    updated_at = NOW();
"""


def main() -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, FUENTES)
    print(f"Upserted {len(FUENTES)} fuentes en prensa.fuentes")


if __name__ == "__main__":
    main()

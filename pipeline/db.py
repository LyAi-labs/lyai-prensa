"""
Helpers de conexión a la BD de prensa: base `prensa` en el contenedor dedicado
`lyai_prensa_postgres` (ver docker-compose.db.yml). Toda la DDL del esquema
`prensa` vive en `database/schema.sql`.

`DATABASE_URL` depende de quién llama:
- en el HOST (cron, `python3 -m pipeline.xxx`) sale de `.env`: rol `prensa`,
  lectura/escritura, por 127.0.0.1:5436;
- en el contenedor `api` la fija docker-compose.yml: rol `prensa_api`, solo
  lectura, por la red Docker `lyai_prensa_db_net`.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import connection as Connection

load_dotenv()


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL no está definida. Copia .env.example a .env; en el host es\n"
            "DATABASE_URL=postgresql://prensa:<password>@127.0.0.1:5436/prensa"
        )
    if "lyai_postgres" in url or url.rstrip("/").endswith("/lyai_db"):
        # Una URL vieja (variable exportada en un shell, copia antigua del .env)
        # escribiría en el esquema congelado de lyai-ski sin que nadie lo viera.
        raise RuntimeError(
            "DATABASE_URL apunta al Postgres de lyai-ski (lyai_postgres / lyai_db). "
            "Desde el 2026-10-10 prensa vive en su propio contenedor: usa la URL de .env."
        )
    return url


def connect() -> Connection:
    """Abre conexión a la BD de prensa con search_path = prensa, public."""
    conn = psycopg2.connect(_database_url())
    with conn.cursor() as cur:
        cur.execute("SET search_path TO prensa, public;")
    conn.commit()
    return conn


@contextmanager
def transaction() -> Iterator[Connection]:
    """Context manager: commit al salir, rollback si hay excepción."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

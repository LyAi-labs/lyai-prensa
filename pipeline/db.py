"""
Helpers de conexión a `lyai_db`. Toda la DDL del esquema `prensa`
vive en `database/schema.sql`.
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
            "DATABASE_URL no está definida. Pon en .env algo como\n"
            "DATABASE_URL=postgres://lyai:lyai@localhost:5432/lyai_db"
        )
    return url


def connect() -> Connection:
    """Abre conexión a lyai_db con search_path = prensa, public."""
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

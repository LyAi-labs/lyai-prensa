from collections.abc import Iterator

from psycopg2.extensions import connection as Connection

from pipeline.db import connect


def get_db() -> Iterator[Connection]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()

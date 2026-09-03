"""
SQL de solo lectura para la API. Enfoque deliberado: dos queries simples
(noticias + contradicciones que las involucran) en vez de un único
json_agg anidado — más fácil de leer, de testear y de depurar cuando algo
sale mal, y a esta escala (cientos de noticias) el coste extra es
insignificante.
"""

from __future__ import annotations

from typing import Any

SELECT_NOTICIAS_SQL = """
SELECT n.id, n.titular, n.descripcion, n.enlace, n.publicada_en,
       n.intensidad_contradiccion, n.eje_z,
       f.nombre AS fuente_nombre, f.color AS fuente_color, f.slug AS fuente_slug
FROM prensa.noticias n
JOIN prensa.fuentes f ON f.id = n.fuente_id
ORDER BY n.publicada_en DESC
LIMIT %(limit)s;
"""

# Trae, para el conjunto de noticias ya paginado, todas las contradicciones
# que involucran alguno de sus claims — desde AMBOS lados del par, para no
# perder contradicciones donde "la otra noticia" cayó fuera de la página.
SELECT_CONTRADICCIONES_SQL = """
SELECT
    ctr.id, ctr.tema, ctr.intensidad, ctr.razonamiento,
    ca.noticia_id AS noticia_a_id, cb.noticia_id AS noticia_b_id,
    ca.sujeto AS a_sujeto, ca.predicado AS a_predicado, ca.objeto AS a_objeto,
    cb.sujeto AS b_sujeto, cb.predicado AS b_predicado, cb.objeto AS b_objeto,
    fa.nombre AS fuente_a_nombre, fb.nombre AS fuente_b_nombre
FROM prensa.contradicciones ctr
JOIN prensa.claims ca ON ca.id = ctr.claim_a_id
JOIN prensa.claims cb ON cb.id = ctr.claim_b_id
JOIN prensa.noticias na ON na.id = ca.noticia_id
JOIN prensa.noticias nb ON nb.id = cb.noticia_id
JOIN prensa.fuentes fa ON fa.id = na.fuente_id
JOIN prensa.fuentes fb ON fb.id = nb.fuente_id
WHERE ca.noticia_id = ANY(%(noticia_ids)s::uuid[]) OR cb.noticia_id = ANY(%(noticia_ids)s::uuid[]);
"""

SELECT_FUENTES_SQL = """
SELECT id, slug, nombre, color, sesgo
FROM prensa.fuentes
WHERE activo = true
ORDER BY nombre;
"""


def build_contradicciones_por_noticia(rows: list[dict[str, Any]]) -> dict[Any, list[dict[str, Any]]]:
    """Cada fila de `contradicciones` es un par no dirigido (A, B). Para que
    cada noticia sepa "cuál es mi claim" y "cuál es el contrario", se genera
    una entrada vista-desde-A y otra vista-desde-B."""
    resultado: dict[Any, list[dict[str, Any]]] = {}
    for r in rows:
        resultado.setdefault(r["noticia_a_id"], []).append(
            {
                "id": str(r["id"]),
                "tema": r["tema"],
                "intensidad": r["intensidad"],
                "razonamiento": r["razonamiento"],
                "noticia_contraria_id": str(r["noticia_b_id"]),
                "fuente_contraria": r["fuente_b_nombre"],
                "claim_propio": {"sujeto": r["a_sujeto"], "predicado": r["a_predicado"], "objeto": r["a_objeto"]},
                "claim_contrario": {"sujeto": r["b_sujeto"], "predicado": r["b_predicado"], "objeto": r["b_objeto"]},
            }
        )
        resultado.setdefault(r["noticia_b_id"], []).append(
            {
                "id": str(r["id"]),
                "tema": r["tema"],
                "intensidad": r["intensidad"],
                "razonamiento": r["razonamiento"],
                "noticia_contraria_id": str(r["noticia_a_id"]),
                "fuente_contraria": r["fuente_a_nombre"],
                "claim_propio": {"sujeto": r["b_sujeto"], "predicado": r["b_predicado"], "objeto": r["b_objeto"]},
                "claim_contrario": {"sujeto": r["a_sujeto"], "predicado": r["a_predicado"], "objeto": r["a_objeto"]},
            }
        )
    return resultado

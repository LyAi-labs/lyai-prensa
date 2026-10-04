"""
SQL de solo lectura para la API. Enfoque deliberado: dos queries simples
(noticias + contradicciones que las involucran) en vez de un único
json_agg anidado — más fácil de leer, de testear y de depurar cuando algo
sale mal, y a esta escala (cientos de noticias) el coste extra es
insignificante.
"""

from __future__ import annotations

from typing import Any

# ── Noticias: filtrable por fecha ancla (Hoy/calendario), búsqueda, fuente,
# sección y contradicciones — todos opcionales, se combinan con AND. Ver
# build_noticias_where() más abajo; antes vivía como dos SQL estáticas
# (con/sin ancla de fecha), sustituidas al añadir el toolbar de filtros
# porque mantener una variante estática por cada combinación no escala.
# Construye el WHERE dinámicamente en vez de mantener variantes estáticas
# para cada combinación — con 4 filtros opcionales serían 16 queries a mano.
# Todos los valores van parametrizados (%(name)s); lo único que se interpola
# directo en el SQL son los propios NOMBRES de los parámetros, nunca datos.


def build_noticias_where(
    *,
    antes: Any = None,
    q: str | None = None,
    fuente_ids: list[str] | None = None,
    seccion_regex: str | None = None,
    seccion_excluir_regex: str | None = None,
    solo_contradicciones: bool = False,
) -> tuple[str, dict[str, Any]]:
    """Devuelve (fragmento WHERE sin la palabra WHERE, params) listo para
    intercalar en SELECT_NOTICIAS_FILTRADO_SQL o COUNT_NOTICIAS_FILTRADO_SQL."""
    condiciones = ["1=1"]
    params: dict[str, Any] = {}

    if antes is not None:
        condiciones.append("n.publicada_en <= %(antes)s")
        params["antes"] = antes

    if q:
        condiciones.append("(n.titular ILIKE %(q)s OR n.descripcion ILIKE %(q)s)")
        params["q"] = f"%{q}%"

    if fuente_ids is not None:
        condiciones.append("n.fuente_id = ANY(%(fuente_ids)s::uuid[])")
        params["fuente_ids"] = fuente_ids

    if seccion_regex is not None:
        condiciones.append("n.enlace ~* %(seccion_regex)s")
        params["seccion_regex"] = seccion_regex
    elif seccion_excluir_regex is not None:
        condiciones.append("n.enlace !~* %(seccion_excluir_regex)s")
        params["seccion_excluir_regex"] = seccion_excluir_regex

    if solo_contradicciones:
        condiciones.append(
            "EXISTS (SELECT 1 FROM prensa.claims c "
            "WHERE c.noticia_id = n.id "
            "AND EXISTS (SELECT 1 FROM prensa.contradicciones ctr "
            "WHERE ctr.claim_a_id = c.id OR ctr.claim_b_id = c.id))"
        )

    return " AND ".join(condiciones), params


def select_noticias_filtrado_sql(where: str) -> str:
    return f"""
SELECT n.id, n.titular, n.descripcion, n.enlace, n.publicada_en, n.imagen_url,
       n.intensidad_contradiccion, n.eje_z,
       f.nombre AS fuente_nombre, f.color AS fuente_color, f.slug AS fuente_slug
FROM prensa.noticias n
JOIN prensa.fuentes f ON f.id = n.fuente_id
WHERE {where}
ORDER BY n.publicada_en DESC
LIMIT %(limit)s OFFSET %(offset)s;
"""


def count_noticias_filtrado_sql(where: str) -> str:
    return f"""
SELECT count(*)
FROM prensa.noticias n
WHERE {where};
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

# Días (dentro de [desde, hasta)) que tienen al menos una contradicción —
# para marcarlos en el calendario del muro. Cuenta un día si CUALQUIERA de
# las dos noticias del par se publicó ese día (pueden diferir de fecha).
SELECT_DIAS_CONTRADICCION_SQL = """
SELECT DISTINCT (dia)::date AS dia FROM (
    SELECT na.publicada_en AS dia
    FROM prensa.contradicciones ctr
    JOIN prensa.claims ca ON ca.id = ctr.claim_a_id
    JOIN prensa.noticias na ON na.id = ca.noticia_id
    UNION ALL
    SELECT nb.publicada_en AS dia
    FROM prensa.contradicciones ctr
    JOIN prensa.claims cb ON cb.id = ctr.claim_b_id
    JOIN prensa.noticias nb ON nb.id = cb.noticia_id
) d
WHERE dia >= %(desde)s AND dia < %(hasta)s
ORDER BY 1;
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

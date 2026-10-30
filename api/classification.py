"""Clasificaciones derivadas para el toolbar de filtros del muro: tipo de
fuente (nacional/regional/TV/radio) y sección — ninguna de las dos existe en
el esquema de BD. Ver dev-xplain 2026-10-04-1745-prensa-toolbar-filtros-busqueda
para el origen, la cobertura real medida y por qué se excluyó el filtro por
`temas` (columna vacía en el 100% de las noticias).
"""

from __future__ import annotations

TV = {"Antena 3 Noticias", "laSexta Noticias", "Telecinco Noticias", "TeleMadrid", "RTVE Noticias"}
RADIO = {"Cadena SER", "COPE", "Onda Cero", "RNE / Radio Nacional"}
# Único nombre con paréntesis que NO es regional: es un subtítulo aclaratorio,
# no una CCAA (verificado a mano contra las 82 fuentes reales).
NACIONAL_CON_PARENTESIS = {"CTXT (Contexto y Acción)"}


def tipo_fuente(nombre: str) -> str:
    if nombre in TV:
        return "tv"
    if nombre in RADIO:
        return "radio"
    if nombre in NACIONAL_CON_PARENTESIS:
        return "nacional"
    if "(" in nombre:
        return "regional"
    return "nacional"


# sección → segmentos de URL que la identifican. Medido sobre las 8163
# noticias reales (2026-10-04): 45.6% de cobertura, 54.4% caen en "otros" —
# sobre todo medios regionales, que organizan sus URLs por geografía
# (/aragon/zaragoza/) en vez de por sección editorial. "otros" es honesto,
# no un fallo de la clasificación.
SECCIONES: dict[str, list[str]] = {
    "economia": ["economia", "cincodias", "dinero", "empresas", "finanzas", "mercados", "negocios"],
    "deportes": ["deportes", "deporte", "futbol", "baloncesto", "balonmano", "motor", "tenis", "ciclismo", "f1", "polideportivo", "deporte-femenino"],
    "politica": ["politica", "espana"],
    "internacional": ["internacional", "mundo"],
    "sociedad": ["sociedad", "sucesos", "gente", "vivir"],
    "cultura": ["cultura", "culturas", "cinemania", "ocio", "television", "series", "libros"],
    "opinion": ["opinion", "articulo", "articulos", "blogs"],
    "tecnologia": ["tecnologia", "ciencia"],
}


def seccion_regex(seccion: str) -> str:
    """Regex (ILIKE-compatible, usada con `~*`) que matchea el path de la URL
    si contiene alguno de los segmentos de la sección pedida, en cualquier
    posición del path (no solo el primer tramo) — más simple que acotar a los
    primeros N segmentos y la diferencia práctica es mínima."""
    segmentos = SECCIONES[seccion]
    alternativas = "|".join(segmentos)
    return f"/({alternativas})(/|$)"


def todas_las_secciones_regex() -> str:
    """Para el filtro «otros»: NOT ~* esto == no cae en ninguna sección conocida."""
    todos = [seg for segs in SECCIONES.values() for seg in segs]
    return f"/({'|'.join(todos)})(/|$)"

"""
Listado de medios de prensa que el ingester recoge por RSS.

Verificado en vivo (HTTP 200 + XML RSS válido). Cargado por
`pipeline.seed_fuentes` en `prensa.fuentes` con UPSERT por slug.
"""

from __future__ import annotations

from typing import TypedDict


class Fuente(TypedDict):
    slug: str
    nombre: str
    rss_url: str
    web_url: str
    idioma: str
    pais: str
    color: str
    sesgo: str


FUENTES: list[Fuente] = [
    # === izquierda / centro_izq ===
    {
        "slug": "el-pais",
        "nombre": "El País",
        "rss_url": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
        "web_url": "https://elpais.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#a82c2c",
        "sesgo": "centro_izq",
    },
    {
        "slug": "eldiario-es",
        "nombre": "elDiario.es",
        "rss_url": "https://www.eldiario.es/rss/",
        "web_url": "https://www.eldiario.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#e63946",
        "sesgo": "izquierda",
    },
    {
        "slug": "infolibre",
        "nombre": "InfoLibre",
        "rss_url": "https://www.infolibre.es/rss/",
        "web_url": "https://www.infolibre.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#d62828",
        "sesgo": "izquierda",
    },
    {
        "slug": "la-marea",
        "nombre": "La Marea",
        "rss_url": "https://www.lamarea.com/feed/",
        "web_url": "https://www.lamarea.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#0a8754",
        "sesgo": "izquierda",
    },
    {
        "slug": "huffpost-es",
        "nombre": "HuffPost España",
        "rss_url": "https://www.huffingtonpost.es/feeds/index.xml",
        "web_url": "https://www.huffingtonpost.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#0dbe98",
        "sesgo": "centro_izq",
    },

    # === centro ===
    {
        "slug": "el-confidencial",
        "nombre": "El Confidencial",
        "rss_url": "https://rss.elconfidencial.com/espana/",
        "web_url": "https://www.elconfidencial.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#c8102e",
        "sesgo": "centro",
    },
    {
        "slug": "el-periodico",
        "nombre": "El Periódico",
        "rss_url": "https://www.elperiodico.com/es/rss/rss_portada.xml",
        "web_url": "https://www.elperiodico.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#e30613",
        "sesgo": "centro_izq",
    },
    {
        "slug": "el-independiente",
        "nombre": "El Independiente",
        "rss_url": "https://www.elindependiente.com/feed/",
        "web_url": "https://www.elindependiente.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#1f3864",
        "sesgo": "centro",
    },
    {
        "slug": "heraldo",
        "nombre": "Heraldo de Aragón",
        "rss_url": "https://www.heraldo.es/rss/",
        "web_url": "https://www.heraldo.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#0e4c92",
        "sesgo": "centro",
    },
    {
        "slug": "newtral",
        "nombre": "Newtral",
        "rss_url": "https://www.newtral.es/feed/",
        "web_url": "https://www.newtral.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#21c685",
        "sesgo": "centro",
    },

    # === centro_der / derecha ===
    {
        "slug": "el-mundo",
        "nombre": "El Mundo",
        "rss_url": "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml",
        "web_url": "https://www.elmundo.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#cc0000",
        "sesgo": "centro_der",
    },
    {
        "slug": "abc",
        "nombre": "ABC",
        "rss_url": "https://www.abc.es/rss/feeds/abc_ultima.xml",
        "web_url": "https://www.abc.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#e2231a",
        "sesgo": "derecha",
    },
    {
        "slug": "el-espanol",
        "nombre": "El Español",
        "rss_url": "https://www.elespanol.com/rss/",
        "web_url": "https://www.elespanol.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#f4a300",
        "sesgo": "centro_der",
    },
    {
        "slug": "okdiario",
        "nombre": "OK Diario",
        "rss_url": "https://okdiario.com/feed",
        "web_url": "https://okdiario.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#005baa",
        "sesgo": "derecha",
    },
    {
        "slug": "libertad-digital",
        "nombre": "Libertad Digital",
        "rss_url": "https://feeds2.feedburner.com/libertaddigital/portada",
        "web_url": "https://www.libertaddigital.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#0d3b66",
        "sesgo": "derecha",
    },

    # === generalistas / agencias ===
    {
        "slug": "20minutos",
        "nombre": "20 Minutos",
        "rss_url": "https://www.20minutos.es/rss",
        "web_url": "https://www.20minutos.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#e30613",
        "sesgo": "centro",
    },
    {
        "slug": "europa-press",
        "nombre": "Europa Press",
        "rss_url": "https://www.europapress.es/rss/rss.aspx",
        "web_url": "https://www.europapress.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#003c79",
        "sesgo": "centro",
    },
    {
        "slug": "cope",
        "nombre": "COPE",
        "rss_url": "https://www.cope.es/api/es/news/rss.xml",
        "web_url": "https://www.cope.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#0c2340",
        "sesgo": "centro_der",
    },

    # === especializados ===
    {
        "slug": "expansion",
        "nombre": "Expansión",
        "rss_url": "https://e00-expansion.uecdn.es/rss/portada.xml",
        "web_url": "https://www.expansion.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#005291",
        "sesgo": "centro_der",
    },
    {
        "slug": "marca",
        "nombre": "Marca",
        "rss_url": "https://e00-marca.uecdn.es/rss/portada.xml",
        "web_url": "https://www.marca.com",
        "idioma": "es",
        "pais": "ES",
        "color": "#cf0a2c",
        "sesgo": "desconocido",
    },
    {
        "slug": "maldita",
        "nombre": "Maldita.es",
        "rss_url": "https://maldita.es/feed/",
        "web_url": "https://maldita.es",
        "idioma": "es",
        "pais": "ES",
        "color": "#ff5a5f",
        "sesgo": "centro_izq",
    },

    # === catalán ===
    {
        "slug": "ara",
        "nombre": "Ara",
        "rss_url": "https://www.ara.cat/rss/",
        "web_url": "https://www.ara.cat",
        "idioma": "ca",
        "pais": "ES",
        "color": "#1a5fb4",
        "sesgo": "centro_izq",
    },
    {
        "slug": "naciodigital",
        "nombre": "Nació Digital",
        "rss_url": "https://www.naciodigital.cat/rss",
        "web_url": "https://www.naciodigital.cat",
        "idioma": "ca",
        "pais": "ES",
        "color": "#f7b500",
        "sesgo": "centro_izq",
    },
]

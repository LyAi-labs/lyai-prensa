"""
Módulo de QA y purga de imágenes para LyAi Prensa.

Detecta imágenes placeholder, genéricas o logotipos corporativos por defecto
que los periódicos inyectan en og:image cuando una noticia no tiene fotografía real
(columnas de opinión, breves, cartas al director, etc.).

Al marcar imagen_url = NULL, el muro 3D y la vista bento renderizan la noticia
en su modo "portada de periódico real" (con tipografía serif, cabecera del medio
y maquetación limpia), evitando que el usuario vea un muro lleno de logos idénticos.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

# Patrones inequívocos de imágenes placeholder o logotipos de fallback
PLACEHOLDER_URL_PATTERNS = [
    re.compile(r"placeholder", re.IGNORECASE),
    re.compile(r"/default\.(jpg|jpeg|png|webp)", re.IGNORECASE),
    re.compile(r"default_0", re.IGNORECASE),
    re.compile(r"aspect-ratio_default", re.IGNORECASE),
    re.compile(r"author_twitter_meta", re.IGNORECASE),
    re.compile(r"abc-noticias\.jpg", re.IGNORECASE),
    re.compile(r"logo[_\-]?default", re.IGNORECASE),
    re.compile(r"og[_\-]?default", re.IGNORECASE),
    re.compile(r"/assets/images/(?:placeholder|default)", re.IGNORECASE),
]

# URLs exactas conocidas de banners genéricos
KNOWN_GENERIC_URLS = {
    "https://s1.abcstatics.com/narwhal/1.3.71/assets/images/abc-noticias.jpg",
    "https://www.lavanguardia.com/files/og_thumbnail/images/default.jpg",
    "https://imagenes2.mundodeportivo.com/files/og_thumbnail/images/default.jpg",
    "https://static.vocstatic.com/voc26/latest/assets/images/placeholder/diariosur-placeholder.png",
    "https://static.vocstatic.com/voc26/latest/assets/images/placeholder/eldiariomontanes-placeholder.png",
    "https://static.vocstatic.com/voc26/latest/assets/images/placeholder/lasprovincias-placeholder.png",
    "https://static.vocstatic.com/voc26/latest/assets/images/placeholder/elnortedecastilla-placeholder.png",
    "https://static.vocstatic.com/voc26/latest/assets/images/placeholder/diariovasco-placeholder.png",
}


def is_placeholder_image(url: str | None) -> bool:
    """Devuelve True si la URL corresponde a una imagen corporativa/placeholder genérica."""
    if not url:
        return True
    
    url_clean = url.strip()
    if url_clean in KNOWN_GENERIC_URLS:
        return True

    for pattern in PLACEHOLDER_URL_PATTERNS:
        if pattern.search(url_clean):
            return True

    return False


def purge_database_placeholders(conn) -> int:
    """Busca en prensa.noticias todas las imágenes placeholder o repetitivas y las pone a NULL.
    Devuelve el número de noticias corregidas."""
    with conn.cursor() as cur:
        # 1. Purgar por patrones conocidos (default_0, placeholders, logos)
        cur.execute("""
            UPDATE prensa.noticias
            SET imagen_url = NULL
            WHERE imagen_url IS NOT NULL AND (
                imagen_url ILIKE '%%placeholder%%'
                OR imagen_url ILIKE '%%default_0%%'
                OR imagen_url ILIKE '%%aspect-ratio_default%%'
                OR imagen_url ILIKE '%%author_twitter_meta%%'
                OR imagen_url ILIKE '%%/default.jpg'
                OR imagen_url ILIKE '%%/default.png'
                OR imagen_url ILIKE '%%/default.jpeg'
                OR imagen_url ILIKE '%%/default.webp'
                OR imagen_url ILIKE '%%abc-noticias.jpg%%'
                OR imagen_url = ANY(%s)
            );
        """, (list(KNOWN_GENERIC_URLS),))
        count_patterns = cur.rowcount

        # 2. Purgar imágenes idénticas compartidas por noticias con diferente titular
        # (indica un banner o cabecera genérica compartida por el medio)
        cur.execute("""
            WITH duplicados AS (
                SELECT imagen_url
                FROM prensa.noticias
                WHERE imagen_url IS NOT NULL
                GROUP BY imagen_url
                HAVING count(DISTINCT id) > 1 AND count(DISTINCT titular) > 1
            )
            UPDATE prensa.noticias n
            SET imagen_url = NULL
            FROM duplicados d
            WHERE n.imagen_url = d.imagen_url;
        """)
        count_duplicates = cur.rowcount
        conn.commit()

        total = count_patterns + count_duplicates
        return total


if __name__ == "__main__":
    from pipeline.db import connect
    conn = connect()
    total_cleaned = purge_database_placeholders(conn)
    print(f"[QA Images] Purga completada: {total_cleaned} noticias con placeholder limpiadas a NULL.")
    conn.close()

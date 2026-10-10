"""
Script de enriquecimiento de imágenes para noticias existentes en `prensa.noticias`.

Para las noticias que se insertaron sin imagen (porque el feed RSS no traía
etiquetas media/enclosure), consulta la cabecera HTML del artículo para
extraer `og:image` o `twitter:image` y actualizar `noticias.imagen_url`.

Uso:
    python -m pipeline.enrich_images --limit 500 --workers 8
"""

from __future__ import annotations

import argparse
import html as html_module
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin

import httpx

from pipeline.db import connect
from pipeline.qa_images import is_placeholder_image

_OG_IMAGE_RE = re.compile(
    r'<meta[^>]+property=[\"\']og:image[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']',
    re.IGNORECASE,
)
_OG_IMAGE_RE_ALT = re.compile(
    r'<meta[^>]+content=[\"\']([^\"\']+)[\"\'][^>]+property=[\"\']og:image[\"\']',
    re.IGNORECASE,
)
_TW_IMAGE_RE = re.compile(
    r'<meta[^>]+(?:name|property)=[\"\']twitter:image[\"\'][^>]+content=[\"\']([^\"\']+)[\"\']',
    re.IGNORECASE,
)
_TW_IMAGE_RE_ALT = re.compile(
    r'<meta[^>]+content=[\"\']([^\"\']+)[\"\'][^>]+(?:name|property)=[\"\']twitter:image[\"\']',
    re.IGNORECASE,
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}


def extract_og_image(url: str, client: httpx.Client, timeout: float = 4.0) -> str | None:
    """Extrae og:image o twitter:image leyendo solo los primeros 65KB del HTML (<head>)."""
    if not url or not url.startswith("http"):
        return None
    try:
        with client.stream("GET", url, timeout=timeout) as resp:
            if resp.status_code >= 400:
                return None
            ct = resp.headers.get("content-type", "")
            if "text/html" not in ct and "xhtml" not in ct:
                return None

            buffer = ""
            for chunk in resp.iter_text():
                buffer += chunk
                if "</head>" in buffer or len(buffer) > 65536:
                    break

            m = _OG_IMAGE_RE.search(buffer) or _OG_IMAGE_RE_ALT.search(buffer)
            if not m:
                m = _TW_IMAGE_RE.search(buffer) or _TW_IMAGE_RE_ALT.search(buffer)

            if m:
                img = html_module.unescape(m.group(1).strip())
                if img.startswith("//"):
                    img = "https:" + img
                elif img.startswith("/"):
                    img = urljoin(url, img)
                if img.startswith("http"):
                    return img
    except Exception:
        return None
    return None


def process_item(item_id: str, enlace: str) -> tuple[str, str | None]:
    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        img_url = extract_og_image(enlace, client)
        return item_id, img_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Enriquece noticias con og:image")
    parser.add_argument("--limit", type=int, default=500, help="Máximo de noticias a procesar (0 = todas)")
    parser.add_argument("--workers", type=int, default=8, help="Hilos concurrentes")
    args = parser.parse_args()

    conn = connect()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT n.id, n.enlace, n.titular, f.nombre
                FROM prensa.noticias n
                JOIN prensa.fuentes f ON n.fuente_id = f.id
                WHERE (n.imagen_url IS NULL OR n.imagen_url = '')
                  AND n.enlace IS NOT NULL
                  AND n.enlace LIKE 'http%'
                ORDER BY n.publicada_en DESC
            """
            if args.limit > 0:
                query += f" LIMIT {args.limit}"
            cur.execute(query)
            rows = cur.fetchall()

        total = len(rows)
        if total == 0:
            print("No hay noticias pendientes de enriquecer.")
            return

        print(f"=== Enriqueciendo {total} noticias recientes con og:image (workers={args.workers}) ===")
        start_time = time.time()
        encontradas = 0
        fallidas = 0
        updates: list[tuple[str, str]] = []

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            future_to_item = {
                executor.submit(process_item, str(row[0]), row[1]): (row[0], row[2], row[3])
                for row in rows
            }

            for i, future in enumerate(as_completed(future_to_item), 1):
                item_id, titular, fuente = future_to_item[future]
                try:
                    _, img_url = future.result()
                    if img_url and not is_placeholder_image(img_url):
                        encontradas += 1
                        updates.append((img_url, item_id))
                    else:
                        fallidas += 1
                except Exception:
                    fallidas += 1

                # Guardar en lotes de 25
                if len(updates) >= 25:
                    with conn.cursor() as cur:
                        cur.executemany(
                            "UPDATE prensa.noticias SET imagen_url = %s WHERE id = %s",
                            updates,
                        )
                    conn.commit()
                    updates = []

                if i % 25 == 0 or i == total:
                    pct = (encontradas / i) * 100 if i > 0 else 0
                    print(f"  [{i:4d}/{total}] {encontradas} fotos encontradas ({pct:.1f}%)")

        if updates:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE prensa.noticias SET imagen_url = %s WHERE id = %s",
                    updates,
                )
            conn.commit()

        elapsed = time.time() - start_time
        print(f"\n✅ Completado en {elapsed:.1f}s: {encontradas} fotos añadidas ({encontradas/total*100:.1f}%), {fallidas} sin foto.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()


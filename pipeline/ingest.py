"""
Ingester de RSS. Para cada fuente activa, descarga el feed, parsea los
items y los inserta en `prensa.noticias` (dedup por (fuente_id, id_externo)).

Commit por fuente: si una falla las demás se conservan.

Uso:
    python -m pipeline.ingest
"""

from __future__ import annotations

import html as html_module
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any

from urllib.parse import urljoin

import feedparser
import httpx

from pipeline.db import connect
from pipeline.qa_images import is_placeholder_image


USER_AGENT = "LyAi-Prensa/1.0 (+https://github.com/LyAi-labs/lyai-prensa)"
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def strip_html(texto: str) -> str:
    """Quita marcado HTML de un texto de RSS y colapsa espacios.

    Muchos feeds (p. ej. el grupo El Español: Crónica Global, InfoLibre...)
    meten `<img>`/`<p>` dentro de `<description>` — válido en RSS, pero no
    queremos pintarlo tal cual en el muro (ver captura del 2026-09-29:
    tarjetas mostrando `<img alt="..." height="675"...` como si fuera el
    resumen de la noticia).
    """
    if not texto or "<" not in texto:
        return texto
    parser = _TextExtractor()
    parser.feed(texto)
    parser.close()
    limpio = html_module.unescape("".join(parser.parts))
    return re.sub(r"\s+", " ", limpio).strip()

SELECT_FUENTES_SQL = """
SELECT id, slug, nombre, rss_url
FROM prensa.fuentes
WHERE activo = true AND rss_url IS NOT NULL
ORDER BY slug;
"""

INSERT_NOTICIA_SQL = """
INSERT INTO prensa.noticias
    (fuente_id, id_externo, titular, descripcion, enlace, publicada_en, imagen_url)
VALUES
    (%(fuente_id)s, %(id_externo)s, %(titular)s, %(descripcion)s,
     %(enlace)s, %(publicada_en)s, %(imagen_url)s)
ON CONFLICT (fuente_id, id_externo) DO NOTHING
RETURNING id;
"""

_IMG_EXT_RE = re.compile(r"\.(jpe?g|png|webp|gif)(\?|$)", re.IGNORECASE)
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


def _extract_og_image(url: str, client: httpx.Client, timeout: float = 3.5) -> str | None:
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


def _imagen_url(
    entry: Any,
    enlace: str | None = None,
    client: httpx.Client | None = None,
) -> str | None:
    """Foto de portada. Primero busca en el feed RSS (media_content/enclosures).
    Si el feed no la trae, extrae og:image del artículo web."""
    candidate = None
    for media in getattr(entry, "media_content", None) or []:
        url = media.get("url")
        mtype = str(media.get("type", "")).lower()
        if "video" in mtype or "flash" in mtype:
            continue
        if url and (mtype.startswith("image/") or _IMG_EXT_RE.search(url) or not mtype):
            candidate = url
            break
    if not candidate:
        for thumb in getattr(entry, "media_thumbnail", None) or []:
            url = thumb.get("url")
            if url:
                candidate = url
                break
    if not candidate:
        for link in getattr(entry, "links", None) or []:
            if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image/"):
                candidate = link.get("href")
                break
    if not candidate:
        for enc in getattr(entry, "enclosures", None) or []:
            href = enc.get("href") if isinstance(enc, dict) else getattr(enc, "href", None)
            if href and (str(getattr(enc, "type", "")).startswith("image/") or _IMG_EXT_RE.search(href)):
                candidate = href
                break

    if not candidate and enlace and client:
        candidate = _extract_og_image(enlace, client)

    if candidate and not is_placeholder_image(candidate):
        return candidate

    return None


def _parse_published(entry: Any) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if parsed is None:
        return None
    return datetime(*parsed[:6], tzinfo=timezone.utc)


def _id_externo(entry: Any) -> str | None:
    # Preferimos guid/id; fallback al link.
    return getattr(entry, "id", None) or getattr(entry, "link", None)


def _ingest_fuente(
    cur,
    fuente: dict[str, Any],
    client: httpx.Client | None = None,
) -> tuple[int, int]:
    feed_source = fuente["rss_url"]
    if client is not None:
        try:
            resp = client.get(fuente["rss_url"], timeout=10.0)
            if resp.status_code == 200:
                feed_source = resp.content
        except Exception:
            pass

    feed = feedparser.parse(feed_source, agent=USER_AGENT)
    if feed.bozo and not feed.entries:
        print(
            f"  ! {fuente['slug']}: feed inválido sin entries — skip",
            file=sys.stderr,
        )
        return 0, 0

    insertadas = 0
    saltadas = 0
    for entry in feed.entries:
        id_externo = _id_externo(entry)
        if not id_externo:
            saltadas += 1
            continue

        # Comprobación previa para no hacer peticiones de imagen si la noticia ya existe
        cur.execute(
            "SELECT 1 FROM prensa.noticias WHERE fuente_id = %s AND id_externo = %s",
            (fuente["id"], id_externo),
        )
        if cur.fetchone() is not None:
            saltadas += 1
            continue

        enlace = getattr(entry, "link", "") or ""
        publicada_en = _parse_published(entry) or datetime.now(timezone.utc)
        img_url = _imagen_url(entry, enlace, client)

        cur.execute(
            INSERT_NOTICIA_SQL,
            {
                "fuente_id": fuente["id"],
                "id_externo": id_externo,
                "titular": strip_html(getattr(entry, "title", "") or "")[:1000],
                "descripcion": strip_html(getattr(entry, "summary", "") or "")[:5000],
                "enlace": enlace,
                "publicada_en": publicada_en,
                "imagen_url": img_url,
            },
        )
        if cur.fetchone() is not None:
            insertadas += 1
        else:
            saltadas += 1
    return insertadas, saltadas


def main() -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(SELECT_FUENTES_SQL)
            cols = [c.name for c in cur.description]
            fuentes = [dict(zip(cols, row)) for row in cur.fetchall()]

        if not fuentes:
            print(
                "No hay fuentes activas. Ejecuta antes:\n"
                "    python -m pipeline.seed_fuentes",
                file=sys.stderr,
            )
            return

        total_ins = 0
        total_skip = 0
        with httpx.Client(headers=HTTP_HEADERS, follow_redirects=True) as client:
            for fuente in fuentes:
                try:
                    with conn.cursor() as cur:
                        ins, skip = _ingest_fuente(cur, fuente, client)
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    print(f"  ! {fuente['slug']}: {e}", file=sys.stderr)
                    continue
                print(f"  {fuente['slug']:20} +{ins:4d}  (skip {skip})")
                total_ins += ins
                total_skip += skip

        print(f"\nTotal: +{total_ins} insertadas, {total_skip} saltadas")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

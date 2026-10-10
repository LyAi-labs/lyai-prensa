"""
API de lectura para el muro de prensa. Sirve `noticias` con sus
contradicciones ya resueltas al ID real de la otra noticia — el contrato
que `sampleNews.ts` nunca pudo dar porque era puro mock sin vínculo real.

Dev:
    uvicorn api.main:app --reload --port 8000

Prod: servido vía Dockerfile.api, detrás de Traefik en /api/* (ver
docker-compose.yml). Sin CORS en prod — mismo origen tras el proxy.
"""

from __future__ import annotations

import hashlib
import io
import os
from datetime import date, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
import httpx

from api.classification import SECCIONES, seccion_regex, tipo_fuente, todas_las_secciones_regex
from api.deps import get_db
from api.queries import (
    SELECT_CONTRADICCIONES_SQL,
    SELECT_DIAS_CONTRADICCION_SQL,
    SELECT_FUENTES_SQL,
    build_contradicciones_por_noticia,
    build_noticias_where,
    count_noticias_filtrado_sql,
    select_noticias_filtrado_sql,
)
from api.archivo import router as archivo_router
from api.schemas import DiaContradiccionOut, FuenteOut, HealthOut, NoticiaOut

app = FastAPI(title="LyAi Prensa API")

_cors_origins = [o.strip() for o in os.environ.get("API_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(archivo_router)


def _rows_as_dicts(cur) -> list[dict]:
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


@app.get("/api/health", response_model=HealthOut)
def health(conn=Depends(get_db)) -> HealthOut:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
        return HealthOut(status="ok", db=True)
    except Exception:
        return HealthOut(status="degraded", db=False)


def _resolve_fuente_ids(conn, fuente_tipo: str) -> list[str]:
    """nacional/regional/tv/radio -> lista de fuente_id. La clasificación no
    existe en BD (ver api/classification.py); se resuelve contra las ~82
    fuentes activas en cada petición — barato, no hace falta cachear."""
    with conn.cursor() as cur:
        cur.execute(SELECT_FUENTES_SQL)
        rows = _rows_as_dicts(cur)
    return [str(r["id"]) for r in rows if tipo_fuente(r["nombre"]) == fuente_tipo]


def _where_from_filtros(
    conn,
    *,
    antes: datetime | None,
    q: str | None,
    fuente_tipo: str | None,
    seccion: str | None,
    solo_contradicciones: bool,
) -> tuple[str, dict]:
    fuente_ids = _resolve_fuente_ids(conn, fuente_tipo) if fuente_tipo else None
    sec_regex = seccion_regex(seccion) if seccion and seccion in SECCIONES else None
    sec_excluir_regex = todas_las_secciones_regex() if seccion == "otros" else None
    return build_noticias_where(
        antes=antes,
        q=q,
        fuente_ids=fuente_ids,
        seccion_regex=sec_regex,
        seccion_excluir_regex=sec_excluir_regex,
        solo_contradicciones=solo_contradicciones,
    )


@app.get("/api/noticias", response_model=list[NoticiaOut])
def listar_noticias(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    antes: datetime | None = Query(default=None, description="Ancla al botón Hoy/calendario: solo noticias publicadas hasta esta fecha"),
    q: str | None = Query(default=None, description="Busca en titular+descripcion (ILIKE)"),
    fuente_tipo: str | None = Query(default=None, description="nacional | regional | tv | radio"),
    seccion: str | None = Query(default=None, description="economia | deportes | politica | internacional | sociedad | cultura | opinion | tecnologia | otros"),
    solo_contradicciones: bool = Query(default=False),
    conn=Depends(get_db),
) -> list[NoticiaOut]:
    where, params = _where_from_filtros(
        conn, antes=antes, q=q, fuente_tipo=fuente_tipo, seccion=seccion, solo_contradicciones=solo_contradicciones
    )
    params["limit"] = limit
    params["offset"] = offset

    with conn.cursor() as cur:
        cur.execute(select_noticias_filtrado_sql(where), params)
        noticias = _rows_as_dicts(cur)

    if not noticias:
        return []

    noticia_ids = [n["id"] for n in noticias]
    with conn.cursor() as cur:
        cur.execute(SELECT_CONTRADICCIONES_SQL, {"noticia_ids": noticia_ids})
        contradicciones_rows = _rows_as_dicts(cur)

    contradicciones_por_noticia = build_contradicciones_por_noticia(contradicciones_rows)

    return [
        NoticiaOut(
            id=str(n["id"]),
            titular=n["titular"],
            descripcion=n["descripcion"] or "",
            enlace=n["enlace"],
            publicada_en=n["publicada_en"].isoformat(),
            imagen_url=n["imagen_url"],
            fuente_nombre=n["fuente_nombre"],
            fuente_color=n["fuente_color"],
            fuente_slug=n["fuente_slug"],
            intensidad_contradiccion=n["intensidad_contradiccion"] or 0,
            eje_z=n["eje_z"] or 0,
            contradicciones=contradicciones_por_noticia.get(n["id"], []),
        )
        for n in noticias
    ]

@app.get("/api/noticias/count")
def contar_noticias(
    antes: datetime | None = Query(default=None),
    q: str | None = Query(default=None),
    fuente_tipo: str | None = Query(default=None),
    seccion: str | None = Query(default=None),
    solo_contradicciones: bool = Query(default=False),
    conn=Depends(get_db),
) -> dict[str, int]:
    """Total real para el contador del muro ("N de TOTAL noticias"). Antes
    del toolbar de filtros, TOTAL vivía hardcodeado en el frontend (3330) —
    con filtros activos esa cifra ya no significa nada, hace falta contarlo."""
    where, params = _where_from_filtros(
        conn, antes=antes, q=q, fuente_tipo=fuente_tipo, seccion=seccion, solo_contradicciones=solo_contradicciones
    )
    with conn.cursor() as cur:
        cur.execute(count_noticias_filtrado_sql(where), params)
        total = cur.fetchone()[0]
    return {"total": total}


@app.get("/api/noticias/{noticia_id}", response_model=NoticiaOut)
def obtener_noticia(noticia_id: str, conn=Depends(get_db)) -> NoticiaOut:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT n.id, n.titular, n.descripcion, n.enlace, n.publicada_en, n.imagen_url,
                   n.intensidad_contradiccion, n.eje_z,
                   f.nombre AS fuente_nombre, f.color AS fuente_color, f.slug AS fuente_slug
            FROM prensa.noticias n
            JOIN prensa.fuentes f ON f.id = n.fuente_id
            WHERE n.id = %(id)s;
            """,
            {"id": noticia_id},
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Noticia no encontrada")
        cols = [desc[0] for desc in cur.description]
        n = dict(zip(cols, row))

        cur.execute(SELECT_CONTRADICCIONES_SQL, {"noticia_ids": [n["id"]]})
        contradicciones_rows = _rows_as_dicts(cur)
        contradicciones_por_noticia = build_contradicciones_por_noticia(contradicciones_rows)

    return NoticiaOut(
        id=str(n["id"]),
        titular=n["titular"],
        descripcion=n["descripcion"] or "",
        enlace=n["enlace"],
        publicada_en=n["publicada_en"].isoformat(),
        imagen_url=n["imagen_url"],
        fuente_nombre=n["fuente_nombre"],
        fuente_color=n["fuente_color"],
        fuente_slug=n["fuente_slug"],
        intensidad_contradiccion=n["intensidad_contradiccion"] or 0,
        eje_z=n["eje_z"] or 0,
        contradicciones=contradicciones_por_noticia.get(n["id"], []),
    )


@app.get("/api/fuentes", response_model=list[FuenteOut])
def listar_fuentes(conn=Depends(get_db)) -> list[FuenteOut]:
    with conn.cursor() as cur:
        cur.execute(SELECT_FUENTES_SQL)
        rows = _rows_as_dicts(cur)
    return [
        FuenteOut(id=str(r["id"]), slug=r["slug"], nombre=r["nombre"], color=r["color"], sesgo=r["sesgo"])
        for r in rows
    ]


@app.get("/api/contradicciones/dias", response_model=list[DiaContradiccionOut])
def listar_dias_contradiccion(
    desde: date = Query(...),
    hasta: date = Query(..., description="Exclusivo — normalmente desde + 1 mes"),
    conn=Depends(get_db),
) -> list[DiaContradiccionOut]:
    """Días con contradicciones y su recuento, para pintarlos en el calendario
    del muro. Rango acotado a un mes por el frontend."""
    with conn.cursor() as cur:
        cur.execute(SELECT_DIAS_CONTRADICCION_SQL, {"desde": desde, "hasta": hasta})
        return [
            DiaContradiccionOut(
                dia=r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
                count=int(r[1]),
                noticias_count=int(r[2]),
            )
            for r in cur.fetchall()
        ]


@app.get("/api/contradicciones/conteo")
def conteo_contradicciones(conn=Depends(get_db)) -> dict[str, int]:
    """Recuento total de contradicciones y de noticias afectadas."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM prensa.contradicciones;")
        total_contradicciones = cur.fetchone()[0]
        cur.execute("""
            SELECT count(DISTINCT n.id)
            FROM prensa.noticias n
            WHERE EXISTS (
                SELECT 1 FROM prensa.claims c
                WHERE c.noticia_id = n.id
                AND EXISTS (
                    SELECT 1 FROM prensa.contradicciones ctr
                    WHERE ctr.claim_a_id = c.id OR ctr.claim_b_id = c.id
                )
            );
        """)
        total_noticias = cur.fetchone()[0]
    return {
        "total_contradicciones": int(total_contradicciones),
        "total_noticias": int(total_noticias),
    }




_IMAGE_CACHE_DIR = Path("/tmp/prensa_img_cache")
_IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_HTTPX_CLIENT: httpx.AsyncClient | None = None


def get_httpx_client() -> httpx.AsyncClient:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None or _HTTPX_CLIENT.is_closed:
        _HTTPX_CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=2.5),
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                ),
                "Accept": "image/webp,image/avif,image/*;q=0.8",
            },
        )
    return _HTTPX_CLIENT


@app.get("/api/image-proxy")
@app.head("/api/image-proxy")
async def image_proxy(url: str = Query(...)):
    """Proxy y optimizador de imágenes para el muro 3D y vista bento.
    Descarga la imagen remota, la redimensiona a thumbnail (máx 480x320)
    y la comprime a WebP, guardándola en caché en disco.
    Reduce imágenes pesadas (hasta 8MB) a ~25KB (97% de ahorro) y responde en <2ms."""
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return Response(status_code=400, content="URL inválida")

    from pipeline.qa_images import is_placeholder_image
    if is_placeholder_image(url):
        return Response(status_code=404, content="Placeholder descartado")

    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_file = _IMAGE_CACHE_DIR / f"{cache_key}.webp"

    # 1. Caché en disco local: respuesta ultrarrápida (<2ms)
    if cache_file.exists():
        try:
            content = cache_file.read_bytes()
            return Response(
                content=content,
                media_type="image/webp",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=2592000, immutable",
                    "X-Image-Cache": "HIT",
                },
            )
        except Exception:
            pass

    # 2. Descargar imagen remota con pool persistente
    try:
        client = get_httpx_client()
        resp = await client.get(url)
        if resp.status_code != 200:
            return Response(status_code=resp.status_code)
        raw_bytes = resp.content
        if not raw_bytes:
            return Response(status_code=404)

        # 3. Optimización con PIL (redimensión y conversión a WebP)
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(raw_bytes))
            img.thumbnail((480, 320), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            elif img.mode != "RGB":
                img = img.convert("RGB")

            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
            webp_bytes = buf.getvalue()

            try:
                cache_file.write_bytes(webp_bytes)
            except Exception:
                pass

            return Response(
                content=webp_bytes,
                media_type="image/webp",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=2592000, immutable",
                    "X-Image-Cache": "MISS",
                },
            )
        except Exception:
            content_type = resp.headers.get("content-type", "image/jpeg")
            return Response(
                content=raw_bytes,
                media_type=content_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=604800",
                    "X-Image-Cache": "BYPASS",
                },
            )
    except Exception as e:
        return Response(status_code=504, content=f"Timeout o error en origen: {e}")


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

import os
from datetime import date, datetime

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

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
from api.schemas import FuenteOut, HealthOut, NoticiaOut

app = FastAPI(title="LyAi Prensa API")

_cors_origins = [o.strip() for o in os.environ.get("API_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["GET"],
        allow_headers=["*"],
    )


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


@app.get("/api/fuentes", response_model=list[FuenteOut])
def listar_fuentes(conn=Depends(get_db)) -> list[FuenteOut]:
    with conn.cursor() as cur:
        cur.execute(SELECT_FUENTES_SQL)
        rows = _rows_as_dicts(cur)
    return [
        FuenteOut(id=str(r["id"]), slug=r["slug"], nombre=r["nombre"], color=r["color"], sesgo=r["sesgo"])
        for r in rows
    ]


@app.get("/api/contradicciones/dias", response_model=list[date])
def listar_dias_contradiccion(
    desde: date = Query(...),
    hasta: date = Query(..., description="Exclusivo — normalmente desde + 1 mes"),
    conn=Depends(get_db),
) -> list[date]:
    """Días con al menos una contradicción, para pintarlos en el calendario
    del muro. Rango acotado a un mes por el frontend — barato hoy (1 fila en
    toda la BD), pero evita un escaneo sin límite según crezca el pipeline."""
    with conn.cursor() as cur:
        cur.execute(SELECT_DIAS_CONTRADICCION_SQL, {"desde": desde, "hasta": hasta})
        return [r[0] for r in cur.fetchall()]

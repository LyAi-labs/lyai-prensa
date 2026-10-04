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

from api.deps import get_db
from api.queries import (
    SELECT_CONTRADICCIONES_SQL,
    SELECT_DIAS_CONTRADICCION_SQL,
    SELECT_FUENTES_SQL,
    SELECT_NOTICIAS_ANTES_SQL,
    SELECT_NOTICIAS_SQL,
    build_contradicciones_por_noticia,
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


@app.get("/api/noticias", response_model=list[NoticiaOut])
def listar_noticias(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    antes: datetime | None = Query(default=None, description="Ancla al botón Hoy/calendario: solo noticias publicadas hasta esta fecha"),
    conn=Depends(get_db),
) -> list[NoticiaOut]:
    with conn.cursor() as cur:
        if antes is not None:
            cur.execute(SELECT_NOTICIAS_ANTES_SQL, {"limit": limit, "offset": offset, "antes": antes})
        else:
            cur.execute(SELECT_NOTICIAS_SQL, {"limit": limit, "offset": offset})
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

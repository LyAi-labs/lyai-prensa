"""
Archivo del observatorio (`/archivo`): explorador público de solo lectura sobre
toda la base — noticias, afirmaciones, contradicciones y medios — pensado para
periodistas. La página es `public/archivo/index.html`; esto es su API.

Todo cuelga de `/api/archivo/*`, lee con el rol `prensa_api` y lleva un límite
de peticiones por IP (la página es pública y sin registro).
"""

from __future__ import annotations

import csv
import io
import time
from collections import defaultdict, deque
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from api.deps import get_db

# --- Límite de peticiones -------------------------------------------------
# Ventana deslizante en memoria: basta para un único proceso uvicorn. Traefik
# añade la IP real al FINAL de X-Forwarded-For; lo anterior lo pone el cliente.
LIMITE_PETICIONES = 120
VENTANA_SEGUNDOS = 60
_peticiones: dict[str, deque[float]] = defaultdict(deque)


def _ip_cliente(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "desconocida"


def limitar(request: Request) -> None:
    ahora = time.monotonic()
    cola = _peticiones[_ip_cliente(request)]
    while cola and ahora - cola[0] > VENTANA_SEGUNDOS:
        cola.popleft()
    if len(cola) >= LIMITE_PETICIONES:
        raise HTTPException(
            status_code=429,
            detail="Demasiadas peticiones; espera un minuto.",
            headers={"Retry-After": str(VENTANA_SEGUNDOS)},
        )
    cola.append(ahora)
    if len(_peticiones) > 10_000:  # no crecer sin fin con IPs de un solo uso
        for ip in [ip for ip, c in _peticiones.items() if not c or ahora - c[-1] > VENTANA_SEGUNDOS]:
            del _peticiones[ip]


router = APIRouter(prefix="/api/archivo", dependencies=[Depends(limitar)])

MAX_FILAS_CSV = 5000
# Datos de prueba que quedaron en producción: fuera de todo lo que se publica.
SIN_SEED = "c.extractor <> 'seed'"


def _filas(cur) -> list[dict]:
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, fila)) for fila in cur.fetchall()]


def _uuid(valor: str) -> str:
    try:
        return str(UUID(valor))
    except ValueError:
        raise HTTPException(status_code=404, detail="No encontrado")


def _palabras(q: str | None, columnas: str, params: dict) -> list[str]:
    """Una condición ILIKE por palabra: todas tienen que aparecer."""
    conds = []
    for i, palabra in enumerate((q or "").split()[:8]):
        params[f"q{i}"] = "%" + palabra.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"
        conds.append(f"({columnas}) ILIKE %(q{i})s")
    return conds


def _csv(filas: list[dict], nombre: str) -> Response:
    buf = io.StringIO()
    if filas:
        w = csv.DictWriter(buf, fieldnames=list(filas[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(filas)
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="observatorio-{nombre}.csv"'},
    )


@router.get("/resumen")
def resumen(conn=Depends(get_db)) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT (SELECT count(*) FROM prensa.noticias WHERE publicada_en <= now()) AS noticias,
                   (SELECT count(DISTINCT noticia_id) FROM prensa.claims c WHERE {SIN_SEED}) AS noticias_analizadas,
                   (SELECT count(*) FROM prensa.claims c WHERE {SIN_SEED}) AS afirmaciones,
                   (SELECT count(*) FROM prensa.fuentes WHERE activo) AS medios,
                   (SELECT min(created_at)::date FROM prensa.noticias) AS desde,
                   (SELECT max(created_at) FROM prensa.noticias) AS actualizado;
            """
        )
        totales = _filas(cur)[0]
        cur.execute("SELECT label, count(*) AS n FROM prensa.pares_evaluados GROUP BY 1;")
        pares = {f["label"]: f["n"] for f in _filas(cur)}
        cur.execute(f"SELECT c.tema, count(*) AS n FROM prensa.claims c WHERE {SIN_SEED} GROUP BY 1 ORDER BY 2 DESC;")
        temas = _filas(cur)
        cur.execute(_SQL_SUCESOS.format(where="TRUE"), {})
        totales["contradicciones"] = len(_filas(cur))
    return {"totales": totales, "pares": pares, "temas": temas}


@router.get("/fuentes")
def fuentes(formato: str = Query(default="json"), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT f.slug, f.nombre, f.color, f.sesgo,
                   (SELECT count(*) FROM prensa.noticias n WHERE n.fuente_id = f.id AND n.publicada_en <= now()) AS noticias,
                   (SELECT count(*) FROM prensa.claims c JOIN prensa.noticias n ON n.id = c.noticia_id
                     WHERE n.fuente_id = f.id AND {SIN_SEED}) AS afirmaciones,
                   (SELECT count(DISTINCT ctr.id) FROM prensa.contradicciones ctr
                     JOIN prensa.claims c ON c.id IN (ctr.claim_a_id, ctr.claim_b_id)
                     JOIN prensa.noticias n ON n.id = c.noticia_id
                     WHERE n.fuente_id = f.id AND {SIN_SEED}) AS contradicciones
            FROM prensa.fuentes f
            WHERE f.activo
            ORDER BY noticias DESC, f.nombre;
            """
        )
        filas = _filas(cur)
    return _csv(filas, "medios") if formato == "csv" else filas


@router.get("/noticias")
def noticias(
    q: str | None = Query(default=None, max_length=200),
    fuente: str | None = Query(default=None, max_length=80),
    solo: str | None = Query(default=None, pattern="^(afirmaciones|contradiccion)$"),
    limit: int = Query(default=40, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    formato: str = Query(default="json"),
    conn=Depends(get_db),
):
    params: dict = {}
    conds = ["n.publicada_en <= now()"] + _palabras(q, "n.titular || ' ' || coalesce(n.descripcion, '')", params)
    if fuente:
        conds.append("f.slug = %(fuente)s")
        params["fuente"] = fuente
    if solo == "afirmaciones":
        conds.append(f"EXISTS (SELECT 1 FROM prensa.claims c WHERE c.noticia_id = n.id AND {SIN_SEED})")
    if solo == "contradiccion":
        conds.append(
            "EXISTS (SELECT 1 FROM prensa.claims c JOIN prensa.contradicciones ctr "
            "ON c.id IN (ctr.claim_a_id, ctr.claim_b_id) WHERE c.noticia_id = n.id)"
        )
    where = " AND ".join(conds)
    desde = "FROM prensa.noticias n JOIN prensa.fuentes f ON f.id = n.fuente_id WHERE " + where
    es_csv = formato == "csv"
    params["limit"] = MAX_FILAS_CSV if es_csv else limit
    params["offset"] = 0 if es_csv else offset
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) {desde};", params)
        total = cur.fetchone()[0]
        cur.execute(
            f"""
            SELECT n.id::text, n.publicada_en, f.slug AS fuente, f.nombre AS medio, n.titular,
                   coalesce(n.descripcion, '') AS descripcion, n.enlace,
                   (SELECT count(*) FROM prensa.claims c WHERE c.noticia_id = n.id AND {SIN_SEED}) AS afirmaciones,
                   (SELECT count(DISTINCT ctr.id) FROM prensa.claims c JOIN prensa.contradicciones ctr
                     ON c.id IN (ctr.claim_a_id, ctr.claim_b_id) WHERE c.noticia_id = n.id) AS contradicciones
            {desde}
            ORDER BY n.publicada_en DESC, n.id
            LIMIT %(limit)s OFFSET %(offset)s;
            """,
            params,
        )
        filas = _filas(cur)
    if es_csv:
        return _csv(filas, "noticias")
    return {"total": total, "filas": filas}


@router.get("/afirmaciones")
def afirmaciones(
    q: str | None = Query(default=None, max_length=200),
    fuente: str | None = Query(default=None, max_length=80),
    tema: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=40, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    formato: str = Query(default="json"),
    conn=Depends(get_db),
):
    params: dict = {}
    conds = [SIN_SEED] + _palabras(
        q, "c.sujeto || ' ' || c.predicado || ' ' || c.objeto || ' ' || coalesce(c.cita, '')", params
    )
    if fuente:
        conds.append("f.slug = %(fuente)s")
        params["fuente"] = fuente
    if tema:
        conds.append("c.tema = %(tema)s")
        params["tema"] = tema
    desde = (
        "FROM prensa.claims c JOIN prensa.noticias n ON n.id = c.noticia_id "
        "JOIN prensa.fuentes f ON f.id = n.fuente_id WHERE " + " AND ".join(conds)
    )
    es_csv = formato == "csv"
    params["limit"] = MAX_FILAS_CSV if es_csv else limit
    params["offset"] = 0 if es_csv else offset
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) {desde};", params)
        total = cur.fetchone()[0]
        cur.execute(
            f"""
            SELECT c.id::text, f.slug AS fuente, f.nombre AS medio, c.sujeto, c.predicado, c.objeto,
                   coalesce(c.cita, '') AS cita, c.tema, c.confianza_extr AS confianza,
                   n.id::text AS noticia_id, n.titular AS noticia, n.enlace, n.publicada_en
            {desde}
            ORDER BY n.publicada_en DESC, c.id
            LIMIT %(limit)s OFFSET %(offset)s;
            """,
            params,
        )
        filas = _filas(cur)
    if es_csv:
        return _csv(filas, "afirmaciones")
    return {"total": total, "filas": filas}


# Una contradicción en la base es un par de AFIRMACIONES. Dos noticias sobre el
# mismo suceso suelen chocar en varias afirmaciones a la vez: aquí se agrupan
# por pareja de noticias, que es lo que un lector entiende por "una contradicción".
_SQL_SUCESOS = """
SELECT na.id::text || '_' || nb.id::text AS id,
       max(ctr.created_at) AS detectada, max(ctr.intensidad) AS intensidad,
       (fa.id = fb.id) AS mismo_medio,
       json_build_object('id', na.id, 'titular', na.titular, 'enlace', na.enlace, 'publicada_en', na.publicada_en,
                         'fuente', fa.slug, 'medio', fa.nombre, 'color', fa.color) AS a,
       json_build_object('id', nb.id, 'titular', nb.titular, 'enlace', nb.enlace, 'publicada_en', nb.publicada_en,
                         'fuente', fb.slug, 'medio', fb.nombre, 'color', fb.color) AS b,
       json_agg(json_build_object(
           'id', ctr.id, 'intensidad', ctr.intensidad, 'razonamiento', ctr.razonamiento, 'juez', ctr.juez,
           'a', json_build_object('sujeto', ca.sujeto, 'predicado', ca.predicado, 'objeto', ca.objeto, 'cita', ca.cita),
           'b', json_build_object('sujeto', cb.sujeto, 'predicado', cb.predicado, 'objeto', cb.objeto, 'cita', cb.cita)
       ) ORDER BY ctr.intensidad DESC, ctr.created_at) AS choques
FROM prensa.contradicciones ctr
JOIN prensa.claims c1 ON c1.id = ctr.claim_a_id AND c1.extractor <> 'seed'
JOIN prensa.claims c2 ON c2.id = ctr.claim_b_id AND c2.extractor <> 'seed'
-- El par (A, B) y el (B, A) son el mismo suceso: el lado "a" es siempre la noticia de menor id.
JOIN prensa.claims ca ON ca.id = CASE WHEN c1.noticia_id <= c2.noticia_id THEN c1.id ELSE c2.id END
JOIN prensa.claims cb ON cb.id = CASE WHEN c1.noticia_id <= c2.noticia_id THEN c2.id ELSE c1.id END
JOIN prensa.noticias na ON na.id = ca.noticia_id
JOIN prensa.noticias nb ON nb.id = cb.noticia_id
JOIN prensa.fuentes fa ON fa.id = na.fuente_id
JOIN prensa.fuentes fb ON fb.id = nb.fuente_id
WHERE {where}
GROUP BY na.id, nb.id, fa.id, fb.id
ORDER BY detectada DESC, id;
"""


def _plano(suceso: dict) -> dict:
    primero = suceso["choques"][0]
    return {
        "detectada": suceso["detectada"],
        "intensidad": suceso["intensidad"],
        "medio_a": suceso["a"]["medio"],
        "afirmacion_a": f'{primero["a"]["sujeto"]} {primero["a"]["predicado"]} {primero["a"]["objeto"]}',
        "titular_a": suceso["a"]["titular"],
        "enlace_a": suceso["a"]["enlace"],
        "medio_b": suceso["b"]["medio"],
        "afirmacion_b": f'{primero["b"]["sujeto"]} {primero["b"]["predicado"]} {primero["b"]["objeto"]}',
        "titular_b": suceso["b"]["titular"],
        "enlace_b": suceso["b"]["enlace"],
        "razonamiento": primero["razonamiento"],
        "choques": len(suceso["choques"]),
        "juez": primero["juez"],
    }


@router.get("/contradicciones")
def contradicciones(
    q: str | None = Query(default=None, max_length=200),
    fuente: str | None = Query(default=None, max_length=80),
    formato: str = Query(default="json"),
    conn=Depends(get_db),
):
    params: dict = {}
    conds = _palabras(
        q,
        "ca.sujeto || ' ' || ca.predicado || ' ' || ca.objeto || ' ' || cb.sujeto || ' ' || cb.predicado || ' ' || "
        "cb.objeto || ' ' || na.titular || ' ' || nb.titular || ' ' || coalesce(ctr.razonamiento, '')",
        params,
    )
    if fuente:
        conds.append("%(fuente)s IN (fa.slug, fb.slug)")
        params["fuente"] = fuente
    with conn.cursor() as cur:
        cur.execute(_SQL_SUCESOS.format(where=" AND ".join(conds) or "TRUE"), params)
        filas = _filas(cur)
    if formato == "csv":
        return _csv([_plano(f) for f in filas], "contradicciones")
    return {"total": len(filas), "filas": filas}


@router.get("/contradiccion/{suceso_id}")
def contradiccion(suceso_id: str, conn=Depends(get_db)) -> dict:
    partes = suceso_id.split("_")
    if len(partes) != 2:
        raise HTTPException(status_code=404, detail="No encontrado")
    a, b = _uuid(partes[0]), _uuid(partes[1])
    with conn.cursor() as cur:
        cur.execute(
            _SQL_SUCESOS.format(where="na.id = %(a)s::uuid AND nb.id = %(b)s::uuid"),
            {"a": min(a, b), "b": max(a, b)},
        )
        filas = _filas(cur)
    if not filas:
        raise HTTPException(status_code=404, detail="No encontrado")
    return filas[0]


@router.get("/noticia/{noticia_id}")
def noticia(noticia_id: str, conn=Depends(get_db)) -> dict:
    nid = _uuid(noticia_id)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT n.id::text, n.titular, coalesce(n.descripcion, '') AS descripcion, n.enlace, n.publicada_en,
                   f.slug AS fuente, f.nombre AS medio, f.color
            FROM prensa.noticias n JOIN prensa.fuentes f ON f.id = n.fuente_id
            WHERE n.id = %(id)s::uuid;
            """,
            {"id": nid},
        )
        filas = _filas(cur)
        if not filas:
            raise HTTPException(status_code=404, detail="No encontrado")
        ficha = filas[0]
        cur.execute(
            f"""
            SELECT c.id::text, c.sujeto, c.predicado, c.objeto, coalesce(c.cita, '') AS cita, c.tema,
                   EXISTS (SELECT 1 FROM prensa.contradicciones ctr WHERE c.id IN (ctr.claim_a_id, ctr.claim_b_id)) AS en_conflicto
            FROM prensa.claims c WHERE c.noticia_id = %(id)s::uuid AND {SIN_SEED}
            ORDER BY c.created_at, c.id;
            """,
            {"id": nid},
        )
        ficha["afirmaciones"] = _filas(cur)
        cur.execute(_SQL_SUCESOS.format(where="%(id)s::uuid IN (na.id, nb.id)"), {"id": nid})
        ficha["contradicciones"] = _filas(cur)
    return ficha

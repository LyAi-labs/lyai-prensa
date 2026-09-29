from pydantic import BaseModel


class ClaimResumen(BaseModel):
    sujeto: str
    predicado: str
    objeto: str


class ContradiccionOut(BaseModel):
    id: str
    tema: str
    intensidad: float
    razonamiento: str | None
    noticia_contraria_id: str
    fuente_contraria: str
    claim_propio: ClaimResumen
    claim_contrario: ClaimResumen


class NoticiaOut(BaseModel):
    id: str
    titular: str
    descripcion: str
    enlace: str
    publicada_en: str
    fuente_nombre: str
    fuente_color: str
    fuente_slug: str
    intensidad_contradiccion: float
    eje_z: float
    contradicciones: list[ContradiccionOut]


class FuenteOut(BaseModel):
    id: str
    slug: str
    nombre: str
    color: str
    sesgo: str | None


class HealthOut(BaseModel):
    status: str
    db: bool

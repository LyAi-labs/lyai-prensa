"""
Cliente mínimo para Gemini (Google AI Studio) vía REST, sin SDK — mismo
patrón (httpx + `?key=` en la URL) que ya usa el router de lyai-ski en
`backend/services/llm/providers/google.py`.

Usa `GOOGLE_GENERATIVE_KEY` (mismo nombre de variable que ese router, para
poder reutilizar la misma key entre proyectos).

RULES-COSTS.md (política sin revalidar desde 2026-04-17) cita
"gemini-2.5-flash" como gratis — ese modelo ya no está disponible para
keys nuevas (retirado, verificado 2026-09-29 contra un 404 real de la
API). Su sucesor gratuito actual es `gemini-3.8-flash` (confirmado ese
mismo día contra la página oficial de precios de Google, no contra la
regla desactualizada). Si esto vuelve a fallar con 404, la política ha
vuelto a quedarse atrás — revalidar contra la doc oficial antes de subir
de generación otra vez, no asumir.
"""

from __future__ import annotations

import os
import time

import httpx

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
]
GEMINI_MODEL = GEMINI_MODELS[0]


class GeminiError(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("GOOGLE_GENERATIVE_KEY", "")
    if not key:
        raise GeminiError("GOOGLE_GENERATIVE_KEY no configurada en .env")
    return key


def generate_json(
    system_prompt: str,
    user_message: str,
    *,
    max_output_tokens: int = 8000,
    temperature: float = 0.2,
    timeout: float = 60.0,
) -> tuple[str, dict]:
    """Llama a Gemini forzando salida JSON (responseMimeType).

    Devuelve (texto_json_crudo, usage_metadata) — el llamador valida el
    JSON contra su propio schema Pydantic; este módulo no sabe de schemas
    concretos, solo habla con la API.
    Si el modelo principal sufre 503 (alta demanda) o 429/404, recurre
    a los modelos Flash hermanos en el tier gratuito sin coste adicional.
    """
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
        },
    }

    last_err: Exception | None = None
    for model in GEMINI_MODELS:
        url = f"{GEMINI_BASE}/{model}:generateContent?key={_api_key()}"
        try:
            resp = httpx.post(url, json=payload, timeout=timeout)
        except httpx.HTTPError as e:
            last_err = GeminiError(f"Gemini ({model}): error de red — {e}")
            continue

        if resp.status_code in (503, 429, 404):
            last_err = GeminiError(f"Gemini {resp.status_code} ({model}): {resp.text[:300]}")
            time.sleep(2.0)
            continue
        elif resp.status_code != 200:
            body = resp.text[:500].replace(_api_key(), "***")
            raise GeminiError(f"Gemini {resp.status_code}: {body}")

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            reason = data.get("promptFeedback", {}).get("blockReason", "sin candidatos")
            raise GeminiError(f"Gemini no devolvió contenido: {reason}")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        if not text:
            finish_reason = candidates[0].get("finishReason", "desconocido")
            raise GeminiError(f"Gemini devolvió texto vacío (finishReason={finish_reason})")

        return text, data.get("usageMetadata", {})

    if last_err:
        raise last_err
    raise GeminiError("No se pudo obtener respuesta de ningún modelo de Gemini Flash")


import logging
import os
from typing import Any, List, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _cors_origins() -> List[str]:
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.61:3000",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


def _cors_origin_regex() -> Optional[str]:
    raw = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    if raw == "0" or raw.lower() == "false":
        return None
    if raw:
        return raw
    return (
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(:\d+)?$"
    )


# ==================== Initialisation FastAPI ====================
app = FastAPI(
    title="MS5 - AI Assistant",
    description="Assistant IA EST Salé via Ollama (Cloud Privé)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Configuration Ollama ====================
# Nom du service Docker : « ollama » (pas le container_name)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# Réponses plus rapides : moins de tokens, température modérée
OLLAMA_TEMPERATURE = float(os.getenv("OLLAMA_TEMPERATURE", "0.35"))
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "320"))

SYSTEM_PROMPT = """Tu es l'assistant de l'École Supérieure de Technologie (EST) de Salé, Maroc, intégré à l'Espace Numérique de Travail (ENT) de l'établissement.

Mission : aider étudiants et enseignants uniquement dans ce cadre (formations, cours sur la plateforme, organisation des études, orientation pratique liée à l'EST Salé).

Règles :
- Réponds toujours en français clair et professionnel.
- Reste focalisé sur l'EST Salé et l'ENT. Si la question est sans rapport, réponds en une ou deux phrases en reliant à l'école ou en refusant poliment d'extrapoler.
- Pour les comptes, mots de passe ou démarches officielles précises, indique de contacter l'administration ou le secrétariat sans inventer de procédures.
- Ne fabrique pas de noms, dates ou programmes : si tu ne sais pas, dis-le.
- Sois bref : en général 2 à 6 phrases, ou une courte liste à puces si la question le demande. Pas de longues introductions."""

# ==================== Schema ====================
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


def _ollama_options() -> dict:
    return {
        "temperature": OLLAMA_TEMPERATURE,
        "num_predict": OLLAMA_NUM_PREDICT,
        "top_p": 0.9,
        "repeat_penalty": 1.12,
    }


def _parse_chat_response(data: dict) -> str:
    msg = data.get("message") or {}
    reply = (msg.get("content") or "").strip()
    if not reply:
        reply = (data.get("response") or "").strip()
    return reply


def _ollama_chat(user_text: str) -> Optional[str]:
    """POST /api/chat (Ollama récent). Retourne None si l’endpoint n’existe pas (404)."""
    body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ],
        "options": _ollama_options(),
    }
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json=body,
        timeout=90,
    )
    if resp.status_code == 404:
        logger.info("Ollama /api/chat absent (404), repli sur /api/generate")
        return None
    resp.raise_for_status()
    data = resp.json()
    return _parse_chat_response(data) or None


def _ollama_error_text(resp: Any) -> str:
    try:
        j = resp.json()
        if isinstance(j, dict) and j.get("error"):
            return str(j["error"])
    except Exception:
        pass
    return (resp.text or "")[:500]


def _model_is_available(model_names: List[str]) -> bool:
    for m in model_names:
        if not m:
            continue
        if m == OLLAMA_MODEL or m.startswith(f"{OLLAMA_MODEL}:"):
            return True
    return False


def _ollama_generate(user_text: str) -> str:
    """POST /api/generate — compatible toutes les versions Ollama avec ce endpoint."""
    prompt = (
        f"{SYSTEM_PROMPT}\n\n---\nQuestion : {user_text}\n\nRéponse (en français) :"
    )
    body = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": _ollama_options(),
    }
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json=body,
        timeout=90,
    )
    if not resp.ok:
        err = _ollama_error_text(resp)
        raise HTTPException(
            status_code=503,
            detail=(
                f"Ollama /api/generate : {err or resp.reason}. "
                f"Modèle attendu : {OLLAMA_MODEL}. "
                f"Vérifiez avec GET /api/ai/health et : docker compose exec ollama ollama pull {OLLAMA_MODEL}"
            ),
        )
    data = resp.json()
    return (data.get("response") or "").strip()


@app.get("/")
def health():
    return {"service": "ms5-ai", "status": "ok", "provider": "ollama", "model": OLLAMA_MODEL}


@app.get("/api/ai/health")
def ai_health():
    """Vérifie la connexion à Ollama et la présence du modèle configuré."""
    out: dict = {
        "service": "ms5-ai",
        "ollama_url": OLLAMA_URL,
        "model_configured": OLLAMA_MODEL,
        "ollama_reachable": False,
        "model_ready": False,
        "models": [],
    }
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=8)
        if not r.ok:
            out["error"] = _ollama_error_text(r)
            return out
        data = r.json()
        names = [m.get("name") for m in data.get("models", []) if m.get("name")]
        out["ollama_reachable"] = True
        out["models"] = names[:40]
        out["model_ready"] = _model_is_available(names)
        if not out["model_ready"] and names:
            out["hint"] = (
                f"Aucun modèle ne correspond à OLLAMA_MODEL={OLLAMA_MODEL!r}. "
                f"Exemple : docker compose exec ollama ollama pull {OLLAMA_MODEL}"
            )
        elif not names:
            out["hint"] = (
                f"Aucun modèle téléchargé. Exécutez : "
                f"docker compose exec ollama ollama pull {OLLAMA_MODEL}"
            )
    except requests.RequestException as e:
        out["error"] = str(e)
    return out


@app.post("/api/ai/chat")
def chat(payload: ChatRequest):
    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Message vide")

    try:
        reply = _ollama_chat(user_text)
        if reply is None:
            reply = _ollama_generate(user_text)
        if not reply:
            reply = "Aucune réponse générée."
        return {"reply": reply}
    except requests.HTTPError as exc:
        detail_txt = str(exc)
        if exc.response is not None:
            detail_txt = _ollama_error_text(exc.response) or detail_txt
        raise HTTPException(
            status_code=503,
            detail=(
                f"Ollama /api/chat ({OLLAMA_URL}, modèle {OLLAMA_MODEL}): {detail_txt}. "
                f"Diagnostic : GET /api/ai/health sur ai-service. "
                f"Télécharger le modèle : docker compose exec ollama ollama pull {OLLAMA_MODEL}"
            ),
        ) from exc
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Ollama indisponible ({OLLAMA_URL}, modèle {OLLAMA_MODEL}): {exc}. "
                f"Vérifiez le conteneur et tirez le modèle: docker compose exec ollama ollama pull {OLLAMA_MODEL}"
            ),
        ) from exc

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import requests
import os

# ==================== Initialisation FastAPI ====================
app = FastAPI(
    title="MS5 - AI Assistant",
    description="Assistant IA EST Salé via Ollama (Cloud Privé)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Configuration Ollama ====================
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ent-ollama:11434").rstrip("/")
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


@app.get("/")
def health():
    return {"service": "ms5-ai", "status": "ok", "provider": "ollama", "model": OLLAMA_MODEL}


@app.post("/api/ai/chat")
def chat(payload: ChatRequest):
    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Message vide")

    body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ],
        "options": {
            "temperature": OLLAMA_TEMPERATURE,
            "num_predict": OLLAMA_NUM_PREDICT,
            "top_p": 0.9,
            "repeat_penalty": 1.12,
        },
    }

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=body,
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()
        msg = data.get("message") or {}
        reply = (msg.get("content") or "").strip()
        if not reply:
            reply = (data.get("response") or "").strip()
        if not reply:
            reply = "Aucune réponse générée."
        return {"reply": reply}
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Ollama indisponible: {exc}")

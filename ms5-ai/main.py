from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os

app = FastAPI(
    title="MS5 - AI Assistant",
    description="Assistant IA EST Sale via Ollama (Cloud Prive)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def health():
    return {"service": "ms5-ai", "status": "ok", "provider": "ollama"}


@app.post("/api/ai/chat")
def chat(payload: ChatRequest):
    prompt = payload.message.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Message vide")

    system_prefix = (
        "Tu es l'assistant de l'EST Sale. "
        "Reponds en francais de maniere concise et utile pour un etudiant/enseignant."
    )

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": f"{system_prefix}\n\nQuestion: {prompt}",
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"reply": data.get("response", "").strip() or "Aucune reponse generee."}
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Ollama indisponible: {exc}")

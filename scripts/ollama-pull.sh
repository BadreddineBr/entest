#!/usr/bin/env sh
# Télécharge le modèle attendu par ai-service (OLLAMA_MODEL dans docker-compose).
# À lancer une fois après docker compose up : ./scripts/ollama-pull.sh
set -eu
MODEL="${OLLAMA_MODEL:-llama3.2:1b}"
echo "Pull Ollama model: $MODEL"
docker compose exec ollama ollama pull "$MODEL"
echo "OK. Vérifiez: curl -s http://127.0.0.1:8005/api/ai/health | head"

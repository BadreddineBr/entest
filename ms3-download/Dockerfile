# Dockerfile
FROM python:3.12

# Dossier de travail dans le conteneur
WORKDIR /app

# Copier tout le projet dans le conteneur
COPY . .

# Installer les dépendances
RUN pip install fastapi uvicorn minio cassandra-driver python-jose

# Commande pour lancer ton service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


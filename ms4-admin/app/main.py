"""
Microservice 4 : Administration — utilisateurs via Keycloak Admin API.
"""

import base64
import json
import logging
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from . import keycloak_admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOW_FAKE_ADMIN_TOKEN = os.getenv("ALLOW_FAKE_ADMIN_TOKEN", "false").lower() == "true"


def _cors_origins() -> List[str]:
    """Origines explicites requises si allow_credentials=True (interdit avec '*')."""
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.61:3000",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


def _cors_origin_regex() -> Optional[str]:
    """Autorise tout le LAN (192.168.x.x, 10.x) pour le dev sans lister chaque IP."""
    raw = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    if raw == "0" or raw.lower() == "false":
        return None
    if raw:
        return raw
    return (
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(:\d+)?$"
    )


app = FastAPI(
    title="Service d'Administration - ENT EST Salé",
    description="Gestion des utilisateurs (Keycloak)",
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


def verify_admin_token(token: str) -> dict:
    if ALLOW_FAKE_ADMIN_TOKEN and token == "fake-token-admin":
        return {"valid": True, "user": "admin1", "role": "admin"}
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(token.split(".")[1] + "==").decode()
        )
        roles = payload.get("resource_access", {}).get("ent-backend", {}).get("roles", [])
        realm_roles = payload.get("realm_access", {}).get("roles", [])
        all_roles = roles + realm_roles
        if "admin" in all_roles:
            return {
                "valid": True,
                "user": payload.get("preferred_username"),
                "role": "admin",
            }
        if "enseignant" in all_roles:
            return {
                "valid": True,
                "user": payload.get("preferred_username"),
                "role": "enseignant",
            }
        if "etudiant" in all_roles:
            return {
                "valid": True,
                "user": payload.get("preferred_username"),
                "role": "etudiant",
            }
        return {"valid": False}
    except Exception:
        return {"valid": False}


def require_admin(authorization: Optional[str]) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    token = authorization.replace("Bearer ", "").strip()
    user_info = verify_admin_token(token)
    if not user_info.get("valid"):
        raise HTTPException(status_code=401, detail="Token invalide")
    if user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user_info


class CreateUserBody(BaseModel):
    username: str = Field(..., min_length=1)
    email: EmailStr
    role: str
    nom: str = Field(..., min_length=1)
    prenom: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)
    filiere: Optional[str] = None


class UpdateUserBody(BaseModel):
    email: Optional[EmailStr] = None
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: Optional[str] = None
    actif: Optional[bool] = None
    password: Optional[str] = None
    filiere: Optional[str] = None


@app.get("/")
async def root():
    return {
        "service": "MS4 - Administration",
        "status": "OK",
        "message": "Service de gestion des utilisateurs (Keycloak)",
    }


@app.get("/api/admin/users")
async def list_users(authorization: str = Header(None)):
    require_admin(authorization)
    users = keycloak_admin.list_users_app_format()
    return {"users": users, "total": len(users)}


@app.get("/api/admin/users/{user_id}")
async def get_user(user_id: str, authorization: str = Header(None)):
    require_admin(authorization)
    return keycloak_admin.get_user_app_dict(user_id)


@app.post("/api/admin/users")
async def create_user(body: CreateUserBody, authorization: str = Header(None)):
    user_info = require_admin(authorization)
    logger.info(
        "Création utilisateur %s par %s", body.username, user_info.get("user")
    )
    user = keycloak_admin.create_user_keycloak(
        username=body.username.strip(),
        email=str(body.email).strip(),
        nom=body.nom.strip(),
        prenom=body.prenom.strip(),
        password=body.password,
        role=body.role.strip(),
        filiere=body.filiere.strip() if body.filiere else None,
    )
    return {"message": "Utilisateur créé avec succès", "user": user}


@app.put("/api/admin/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserBody,
    authorization: str = Header(None),
):
    user_info = require_admin(authorization)
    logger.info("Modification utilisateur %s par %s", user_id, user_info.get("user"))
    patch = body.model_dump(exclude_unset=True)
    user = keycloak_admin.update_user_keycloak(
        user_id,
        email=str(patch["email"]).strip() if "email" in patch else None,
        nom=patch["nom"].strip() if patch.get("nom") is not None else None,
        prenom=patch["prenom"].strip() if patch.get("prenom") is not None else None,
        role=patch["role"].strip() if patch.get("role") is not None else None,
        actif=patch.get("actif"),
        password=patch.get("password"),
        filiere=patch["filiere"] if "filiere" in patch else None,
    )
    return {"message": "Utilisateur modifié avec succès", "user": user}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: str, authorization: str = Header(None)):
    user_info = require_admin(authorization)
    username = keycloak_admin.delete_user_keycloak(user_id)
    logger.info("Utilisateur %s supprimé par %s", username, user_info.get("user"))
    return {"message": "Utilisateur supprimé avec succès", "deleted_user": username}


@app.get("/api/public/users")
async def list_users_public():
    return {
        "users": [],
        "message": "Liste publique désactivée — utilisez l'API admin authentifiée.",
    }

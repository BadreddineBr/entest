"""
Microservice 4 : Administration
Gère les utilisateurs et les rôles
"""

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import logging
from typing import List, Optional
import uuid

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialisation de FastAPI
app = FastAPI(
    title="Service d'Administration - ENT EST Salé",
    description="Gestion des utilisateurs et des rôles",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base de données fictive pour commencer
FAKE_USERS_DB = {
    "1": {
        "id": "1",
        "username": "admin1",
        "email": "admin1@est-salé.ma",
        "role": "admin",
        "nom": "Admin",
        "prenom": "System",
        "actif": True
    },
    "2": {
        "id": "2",
        "username": "prof1",
        "email": "prof1@est-salé.ma",
        "role": "enseignant",
        "nom": "Alaoui",
        "prenom": "Mohamed",
        "actif": True
    },
    "3": {
        "id": "3",
        "username": "etudiant1",
        "email": "etudiant1@est-salé.ma",
        "role": "etudiant",
        "nom": "Benzema",
        "prenom": "Karim",
        "actif": True,
        "filiere": "Genie Logiciel"
    }
}

# Modèles (simples pour l'instant)
class Utilisateur:
    pass

def verify_admin_token(token: str):
    try:
        # Decode without verification (Keycloak validates on its side)
        import base64, json
        payload = json.loads(base64.b64decode(token.split('.')[1] + '==').decode())
        roles = payload.get('resource_access', {}).get('ent-backend', {}).get('roles', [])
        realm_roles = payload.get('realm_access', {}).get('roles', [])
        all_roles = roles + realm_roles
        if 'admin' in all_roles:
            return {"valid": True, "user": payload.get('preferred_username'), "role": "admin"}
        elif 'enseignant' in all_roles:
            return {"valid": True, "user": payload.get('preferred_username'), "role": "enseignant"}
        elif 'etudiant' in all_roles:
            return {"valid": True, "user": payload.get('preferred_username'), "role": "etudiant"}
        # fallback for fake tokens
        if token == "fake-token-admin":
            return {"valid": True, "user": "admin1", "role": "admin"}
        return {"valid": False}
    except:
        if token == "fake-token-admin":
            return {"valid": True, "user": "admin1", "role": "admin"}
        return {"valid": False}

@app.get("/")
async def root():
    """Vérifier que le service tourne"""
    return {
        "service": "MS4 - Administration",
        "status": "OK",
        "message": "Service de gestion des utilisateurs"
    }

# ✅ ROUTE 1: Liste tous les utilisateurs (admin seulement)
@app.get("/api/admin/users")
async def list_users(authorization: str = Header(None)):
    """Liste tous les utilisateurs (admin seulement)"""
    # Vérifier token
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization.replace("Bearer ", "")
    user_info = verify_admin_token(token)
    
    if not user_info.get("valid"):
        raise HTTPException(status_code=401, detail="Token invalide")
    
    # Seul l'admin peut voir tous les utilisateurs
    if user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    logger.info(f"Liste des utilisateurs demandée par {user_info.get('user')}")
    
    # Retourner la liste (sans mots de passe)
    users_list = []
    for user_id, user_data in FAKE_USERS_DB.items():
        users_list.append({
            "id": user_id,
            "username": user_data["username"],
            "email": user_data["email"],
            "role": user_data["role"],
            "nom": user_data["nom"],
            "prenom": user_data["prenom"],
            "actif": user_data["actif"]
        })
    
    return {"users": users_list, "total": len(users_list)}

# ✅ ROUTE 2: Créer un nouvel utilisateur (admin seulement)
@app.post("/api/admin/users")
async def create_user(
    username: str,
    email: str,
    role: str,
    nom: str,
    prenom: str,
    authorization: str = Header(None)
):
    """Crée un nouvel utilisateur (admin seulement)"""
    # Vérifier token
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization.replace("Bearer ", "")
    user_info = verify_admin_token(token)
    
    if not user_info.get("valid") or user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    # Vérifier que le rôle est valide
    if role not in ["admin", "enseignant", "etudiant"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    
    # Créer nouvel utilisateur
    new_id = str(len(FAKE_USERS_DB) + 1)
    new_user = {
        "id": new_id,
        "username": username,
        "email": email,
        "role": role,
        "nom": nom,
        "prenom": prenom,
        "actif": True
    }
    
    # Ajouter à la "base"
    FAKE_USERS_DB[new_id] = new_user
    
    logger.info(f"Utilisateur {username} créé par {user_info.get('user')}")
    
    return {
        "message": "Utilisateur créé avec succès",
        "user": new_user
    }

# ✅ ROUTE 3: Modifier un utilisateur (admin seulement)
@app.put("/api/admin/users/{user_id}")
async def update_user(
    user_id: str,
    email: Optional[str] = None,
    nom: Optional[str] = None,
    prenom: Optional[str] = None,
    role: Optional[str] = None,
    actif: Optional[bool] = None,
    authorization: str = Header(None)
):
    """Modifie un utilisateur existant"""
    # Vérifier token
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization.replace("Bearer ", "")
    user_info = verify_admin_token(token)
    
    if not user_info.get("valid") or user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    # Vérifier que l'utilisateur existe
    if user_id not in FAKE_USERS_DB:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Mettre à jour les champs fournis
    user = FAKE_USERS_DB[user_id]
    if email:
        user["email"] = email
    if nom:
        user["nom"] = nom
    if prenom:
        user["prenom"] = prenom
    if role:
        if role not in ["admin", "enseignant", "etudiant"]:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        user["role"] = role
    if actif is not None:
        user["actif"] = actif
    
    logger.info(f"Utilisateur {user_id} modifié par {user_info.get('user')}")
    
    return {
        "message": "Utilisateur modifié avec succès",
        "user": user
    }

# ✅ ROUTE 4: Supprimer un utilisateur (admin seulement)
@app.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: str, authorization: str = Header(None)):
    """Supprime un utilisateur"""
    # Vérifier token
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization.replace("Bearer ", "")
    user_info = verify_admin_token(token)
    
    if not user_info.get("valid") or user_info.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    # Vérifier que l'utilisateur existe
    if user_id not in FAKE_USERS_DB:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Ne pas supprimer le dernier admin
    if FAKE_USERS_DB[user_id]["role"] == "admin":
        admin_count = sum(1 for u in FAKE_USERS_DB.values() if u["role"] == "admin")
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Impossible de supprimer le dernier administrateur")
    
    # Supprimer
    deleted_user = FAKE_USERS_DB.pop(user_id)
    logger.info(f"Utilisateur {user_id} supprimé par {user_info.get('user')}")
    
    return {
        "message": "Utilisateur supprimé avec succès",
        "deleted_user": deleted_user["username"]
    }

# ✅ ROUTE 5: Route publique pour les tests
@app.get("/api/public/users")
async def list_users_public():
    """Version publique pour les tests (sans auth)"""
    users_list = []
    for user_id, user_data in FAKE_USERS_DB.items():
        users_list.append({
            "id": user_id,
            "username": user_data["username"],
            "role": user_data["role"]
        })
    
    return {
        "users": users_list,
        "message": "Mode développement - sans authentification"
    }

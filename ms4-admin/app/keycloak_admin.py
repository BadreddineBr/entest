"""
Keycloak Admin REST API — gestion des utilisateurs du realm (création, rôles, mot de passe).
Utilise le compte admin du realm master (admin-cli / mot de passe bootstrap).
"""

import logging
import os
from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException

logger = logging.getLogger(__name__)

KEYCLOAK_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://keycloak:8080").rstrip("/")
REALM = os.getenv("KEYCLOAK_REALM", "est-sale")
CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "ent-backend")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")

APP_ROLES = frozenset({"admin", "enseignant", "etudiant"})

_ent_client_uuid: Optional[str] = None
_admin_token: Optional[str] = None


def _admin_token_url() -> str:
    return f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"


def get_admin_token() -> str:
    global _admin_token
    try:
        r = requests.post(
            _admin_token_url(),
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": ADMIN_USER,
                "password": ADMIN_PASSWORD,
            },
            timeout=30,
        )
    except requests.exceptions.RequestException as e:
        logger.exception("Keycloak token: connexion impossible vers %s", KEYCLOAK_URL)
        raise HTTPException(
            status_code=503,
            detail=f"Keycloak inaccessible ({KEYCLOAK_URL}): {e}",
        ) from e
    if r.status_code != 200:
        logger.error("Keycloak admin token failed: %s %s", r.status_code, r.text)
        raise HTTPException(
            status_code=503,
            detail="Impossible d'obtenir un jeton d'administration Keycloak. Vérifiez KEYCLOAK_ADMIN_USER / KEYCLOAK_ADMIN_PASSWORD.",
        )
    _admin_token = r.json()["access_token"]
    return _admin_token


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {get_admin_token()}",
        "Content-Type": "application/json",
    }


def _admin_request(method: str, path: str, **kwargs: Any) -> requests.Response:
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM}{path}"
    try:
        r = requests.request(method, url, headers=_headers(), timeout=30, **kwargs)
    except requests.exceptions.RequestException as e:
        logger.exception("Keycloak API %s %s", method, path)
        raise HTTPException(
            status_code=503,
            detail=f"Keycloak inaccessible ({KEYCLOAK_URL}): {e}",
        ) from e
    if r.status_code == 401:
        global _admin_token
        _admin_token = None
        r = requests.request(method, url, headers=_headers(), timeout=30, **kwargs)
    return r


def get_ent_client_uuid() -> str:
    global _ent_client_uuid
    if _ent_client_uuid:
        return _ent_client_uuid
    r = _admin_request("GET", "/clients", params={"clientId": CLIENT_ID})
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=f"Keycloak clients: {r.text}")
    clients = r.json()
    if not clients:
        raise HTTPException(status_code=503, detail=f"Client OIDC '{CLIENT_ID}' introuvable dans Keycloak.")
    _ent_client_uuid = clients[0]["id"]
    return _ent_client_uuid


def get_user_app_role(user_id: str, client_uuid: Optional[str] = None) -> str:
    cid = client_uuid or get_ent_client_uuid()
    r = _admin_request(
        "GET", f"/users/{user_id}/role-mappings/clients/{cid}"
    )
    if r.status_code != 200:
        return "etudiant"
    for role in r.json():
        name = role.get("name")
        if name in APP_ROLES:
            return name
    return "etudiant"


def user_to_app_dict(kc_user: Dict[str, Any], client_uuid: str) -> Dict[str, Any]:
    uid = kc_user["id"]
    role = get_user_app_role(uid, client_uuid)
    attrs = kc_user.get("attributes") or {}
    filiere = None
    if "filiere" in attrs and attrs["filiere"]:
        filiere = attrs["filiere"][0]
    out: Dict[str, Any] = {
        "id": uid,
        "username": kc_user.get("username") or "",
        "email": kc_user.get("email") or "",
        "nom": kc_user.get("lastName") or "",
        "prenom": kc_user.get("firstName") or "",
        "role": role,
        "actif": kc_user.get("enabled", True),
    }
    if filiere:
        out["filiere"] = filiere
    return out


def list_users_app_format() -> List[Dict[str, Any]]:
    r = _admin_request("GET", "/users", params={"max": 1000})
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=r.text)
    client_uuid = get_ent_client_uuid()
    out: List[Dict[str, Any]] = []
    for u in r.json():
        if u.get("serviceAccountClientId"):
            continue
        out.append(user_to_app_dict(u, client_uuid))
    return out


def get_user_app_dict(user_id: str) -> Dict[str, Any]:
    r = _admin_request("GET", f"/users/{user_id}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=r.text)
    client_uuid = get_ent_client_uuid()
    return user_to_app_dict(r.json(), client_uuid)


def set_user_password(user_id: str, password: str, temporary: bool = False) -> None:
    r = _admin_request(
        "PUT",
        f"/users/{user_id}/reset-password",
        json={"type": "password", "value": password, "temporary": temporary},
    )
    if r.status_code not in (204, 200):
        raise HTTPException(status_code=400, detail=f"Mot de passe: {r.text}")


def map_user_client_role(user_id: str, role_key: str) -> None:
    if role_key not in APP_ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    client_uuid = get_ent_client_uuid()
    base = f"/users/{user_id}/role-mappings/clients/{client_uuid}"
    r = _admin_request("GET", base)
    if r.status_code == 200:
        existing = r.json()
        if existing:
            dr = _admin_request("DELETE", base, json=existing)
            if dr.status_code not in (204, 200):
                raise HTTPException(status_code=400, detail=dr.text)
    r = _admin_request("GET", f"/clients/{client_uuid}/roles/{role_key}")
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=f"Rôle client '{role_key}': {r.text}")
    role_rep = r.json()
    pr = _admin_request("POST", base, json=[role_rep])
    if pr.status_code not in (204, 200):
        raise HTTPException(status_code=400, detail=pr.text)


def create_user_keycloak(
    username: str,
    email: str,
    nom: str,
    prenom: str,
    password: str,
    role: str,
    filiere: Optional[str] = None,
) -> Dict[str, Any]:
    if role not in APP_ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    body: Dict[str, Any] = {
        "username": username,
        "email": email,
        "firstName": prenom,
        "lastName": nom,
        "enabled": True,
        "emailVerified": True,
    }
    if filiere and role == "etudiant":
        body["attributes"] = {"filiere": [filiere]}
    r = _admin_request("POST", "/users", json=body)
    if r.status_code == 409:
        raise HTTPException(status_code=409, detail="Ce nom d'utilisateur ou cet email existe déjà.")
    if r.status_code not in (201, 204):
        raise HTTPException(status_code=400, detail=r.text or "Création utilisateur refusée")

    loc = r.headers.get("Location") or ""
    user_id = loc.rstrip("/").split("/")[-1] if loc else ""
    if not user_id:
        s = _admin_request("GET", "/users", params={"username": username, "exact": "true"})
        if s.status_code == 200 and s.json():
            user_id = s.json()[0]["id"]
    if not user_id:
        raise HTTPException(status_code=500, detail="Utilisateur créé mais ID introuvable.")

    set_user_password(user_id, password, temporary=False)
    map_user_client_role(user_id, role)
    return get_user_app_dict(user_id)


def update_user_keycloak(
    user_id: str,
    email: Optional[str] = None,
    nom: Optional[str] = None,
    prenom: Optional[str] = None,
    role: Optional[str] = None,
    actif: Optional[bool] = None,
    password: Optional[str] = None,
    filiere: Optional[str] = None,
) -> Dict[str, Any]:
    r = _admin_request("GET", f"/users/{user_id}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=r.text)
    current = r.json()
    updated = dict(current)
    if email is not None:
        updated["email"] = email
    if nom is not None:
        updated["lastName"] = nom
    if prenom is not None:
        updated["firstName"] = prenom
    if actif is not None:
        updated["enabled"] = actif
    if filiere is not None:
        attrs = dict(current.get("attributes") or {})
        if filiere == "":
            attrs.pop("filiere", None)
        else:
            attrs["filiere"] = [filiere]
        updated["attributes"] = attrs
    needs_put = any(
        x is not None
        for x in (email, nom, prenom, actif, filiere)
    )
    if needs_put:
        ur = _admin_request("PUT", f"/users/{user_id}", json=updated)
        if ur.status_code != 204:
            raise HTTPException(status_code=400, detail=ur.text)
    if password:
        set_user_password(user_id, password, temporary=False)
    if role is not None:
        if role not in APP_ROLES:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        map_user_client_role(user_id, role)
    return get_user_app_dict(user_id)


def count_admins() -> int:
    client_uuid = get_ent_client_uuid()
    r = _admin_request("GET", f"/clients/{client_uuid}/roles/admin/users")
    if r.status_code != 200:
        return 0
    return len(r.json())


def delete_user_keycloak(user_id: str) -> str:
    r = _admin_request("GET", f"/users/{user_id}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if r.status_code != 200:
        raise HTTPException(status_code=503, detail=r.text)
    client_uuid = get_ent_client_uuid()
    role = get_user_app_role(user_id, client_uuid)
    if role == "admin":
        if count_admins() <= 1:
            raise HTTPException(
                status_code=400,
                detail="Impossible de supprimer le dernier administrateur.",
            )
    username = r.json().get("username", user_id)
    dr = _admin_request("DELETE", f"/users/{user_id}")
    if dr.status_code not in (204, 200):
        raise HTTPException(status_code=400, detail=dr.text)
    return username

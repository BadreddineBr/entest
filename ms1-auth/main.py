from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os

app = FastAPI(title="MS1 - Auth Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KEYCLOAK_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://keycloak:8080")
REALM = os.getenv("KEYCLOAK_REALM", "est-sale")
CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "ent-backend")
CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET", "BYeRznZta4Yv14brE6zPCRJqLpkKyA7f")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.get("/")
def root():
    return {"service": "MS1 - Auth Service", "status": "OK"}

@app.post("/api/auth/login")
def login(data: LoginRequest):
    token_url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token"
    response = requests.post(token_url, data={
        "grant_type": "password",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": data.username,
        "password": data.password,
    })
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail=response.json())
    return response.json()


@app.post("/api/auth/logout")
def logout(refresh_token: str):
    logout_url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/logout"
    requests.post(logout_url, data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
    })
    return {"message": "Logged out"}

@app.get("/api/auth/me")
def me(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"message": "Authenticated", "status": "ok"}
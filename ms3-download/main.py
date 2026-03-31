import os
import time
from fastapi import FastAPI, HTTPException, Header
from cassandra.cluster import Cluster
from minio import Minio
from datetime import timedelta
from jose import jwt, JWTError

app = FastAPI()

# 🔐 Secret pour JWT
SECRET = "secret"

# 📌 Génération d'un token test
test_token = jwt.encode({"sub": "user1"}, SECRET, algorithm="HS256")
print("💡 Token JWT pour test :", test_token)

# 🔹 Configuration Cassandra et MinIO
CASSANDRA_HOST = "127.0.0.1"
MINIO_HOST = os.getenv("MINIO_HOST", "localhost:9000")
MINIO_ACCESS = os.getenv("MINIO_ACCESS", "minio")
MINIO_SECRET = os.getenv("MINIO_SECRET", "password")

# 🔹 Connexion Cassandra avec retry
cluster = None
session = None

for i in range(10):
    try:
        cluster = Cluster([CASSANDRA_HOST])
        session = cluster.connect("ent")  # ⚠️ keyspace = ent
        print("✅ Connected to Cassandra")
        break
    except Exception:
        print(f"❌ Attempt {i+1}: Cassandra not ready, retrying in 5s")
        time.sleep(5)

if not cluster:
    raise Exception("❌ Cassandra connection failed")

# 🔹 Connexion MinIO
minio_client = Minio(
    MINIO_HOST,
    access_key=MINIO_ACCESS,
    secret_key=MINIO_SECRET,
    secure=False
)

# 🔐 Vérification JWT
def verify_token(token: str):
    try:
        jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# 📚 Endpoint : liste des cours depuis Cassandra
@app.get("/courses")
def list_courses(authorization: str = Header(...)):

    # 🔑 Extraire token du header Authorization: Bearer xxx
    try:
        token = authorization.split(" ")[1]
    except IndexError:
        raise HTTPException(status_code=401, detail="Malformed authorization header")

    verify_token(token)

    # 🔥 Requête Cassandra
    rows = session.execute("SELECT id, title, description FROM courses")

    # 🔥 Conversion en JSON
    courses = [
        {
            "id": str(r.id),
            "title": r.title,
            "description": r.description
        }
        for r in rows
    ]

    return courses


# ⬇️ Endpoint : téléchargement d'un cours
@app.get("/courses/{course_id}/download")
def download_course(course_id: str, authorization: str = Header(...)):

    try:
        token = authorization.split(" ")[1]
    except IndexError:
        raise HTTPException(status_code=401, detail="Malformed authorization header")

    verify_token(token)

    # 🔎 Rechercher le cours
    row = session.execute(
        "SELECT * FROM courses WHERE id=%s",
        [course_id]
    ).one()

    if not row:
        raise HTTPException(status_code=404, detail="Course not found")

    # 🔗 URL temporaire MinIO
    url = minio_client.presigned_get_object(
        "courses",
        row.file_name,
        expires=timedelta(minutes=10)
    )

    return {"download_url": url}
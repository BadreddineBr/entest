from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
import logging
from datetime import datetime
import uuid
from minio import Minio
from cassandra.cluster import Cluster
import os
import shutil
import json

# -----------------------
# Logging
# -----------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------
# FastAPI app
# -----------------------
app = FastAPI(
    title="MS2 - Ajout de Fichiers",
    description="Microservice pour permettre aux enseignants d'ajouter des cours",
    version="1.0.0"
)

# -----------------------
# CORS
# -----------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# Fake JWT verification (to replace with Keycloak later)
# -----------------------
def verify_teacher_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    token = authorization.replace("Bearer ", "")
    # Accept fake tokens for dev
    if token == "fake-token-enseignant":
        return {"valid": True, "user": "prof1", "role": "enseignant"}
    # Accept real Keycloak tokens
    try:
        import base64, json
        payload = json.loads(base64.b64decode(token.split('.')[1] + '==').decode())
        roles = payload.get('resource_access', {}).get('ent-backend', {}).get('roles', [])
        realm_roles = payload.get('realm_access', {}).get('roles', [])
        all_roles = roles + realm_roles
        username = payload.get('preferred_username', 'unknown')
        if 'enseignant' in all_roles:
            return {"valid": True, "user": username, "role": "enseignant"}
        elif 'admin' in all_roles:
            return {"valid": True, "user": username, "role": "admin"}
        else:
            raise HTTPException(status_code=401, detail="Role insuffisant")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide")

# -----------------------
# MinIO client
# -----------------------
MINIO_CLIENT = Minio(
    "minio:9000",  # Container name or host
    access_key="MINIO_ACCESS_KEY",
    secret_key="MINIO_SECRET_KEY",
    secure=False
)
BUCKET_NAME = "courses"
if not MINIO_CLIENT.bucket_exists(BUCKET_NAME):
    MINIO_CLIENT.make_bucket(BUCKET_NAME)

# Allow public read for downloaded course files.
# Upload/delete operations remain protected by backend auth.
bucket_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{BUCKET_NAME}/*"]
        }
    ]
}
MINIO_CLIENT.set_bucket_policy(BUCKET_NAME, json.dumps(bucket_policy))

# -----------------------
# Cassandra client
# -----------------------
cluster = Cluster(["cassandra"])  # Container name or host
session = cluster.connect()
KEYSPACE = "ent_keyspace"
session.execute(f"""
    CREATE KEYSPACE IF NOT EXISTS {KEYSPACE}
    WITH replication = {{'class':'SimpleStrategy', 'replication_factor':'1'}}
""")
session.set_keyspace(KEYSPACE)
session.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id uuid PRIMARY KEY,
        title text,
        description text,
        file_url text,
        teacher text,
        created_at timestamp
    )
""")

# -----------------------
# Routes
# -----------------------
@app.get("/")
async def root():
    """Vérifie que le service tourne"""
    return {"service": "MS2 - Ajout de Fichiers", "status": "OK"}

@app.post("/api/courses")
async def upload_course(
    title: str,
    description: str,
    file: UploadFile = File(...),
    user=Depends(verify_teacher_token)
):
    """Permet à un enseignant d'ajouter un cours avec fichier"""
    teacher = user.get("user")
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1]
    file_name = f"{uuid.uuid4()}{file_extension}"

    # Upload file to MinIO
    MINIO_CLIENT.put_object(
        BUCKET_NAME,
        file_name,
        file.file,
        length=-1,
        part_size=10*1024*1024
    )
    
    # Create file URL (use HTTP URL for MinIO)
    file_url = f"http://localhost:9000/courses/{file_name}"

    # Store metadata in Cassandra
    course_id = uuid.uuid4()
    session.execute(
        "INSERT INTO courses (id, title, description, file_url, teacher, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
        (course_id, title, description, file_url, teacher, datetime.utcnow())
    )

    logger.info(f"Course '{title}' uploaded by {teacher}")
    return {"message": "Course uploaded successfully", "file_url": file_url, "course_id": str(course_id)}

@app.get("/api/courses")
async def list_courses(user=Depends(verify_teacher_token)):
    rows = session.execute("SELECT id, title, description, file_url, teacher, created_at FROM courses")
    all_courses = []
    for row in rows:
        all_courses.append({
            "id": str(row.id),
            "title": row.title,
            "description": row.description,
            "file_url": row.file_url,
            "teacher": row.teacher,
            "created_at": row.created_at.isoformat() if row.created_at else None
        })
    
    # If enseignant, return only their courses
    if user.get("role") == "enseignant":
        filtered = [c for c in all_courses if c.get("teacher") == user.get("user")]
        return {"courses": filtered}
    
    # Admin or others see all
    return {"courses": all_courses}

@app.delete("/api/courses/{course_id}")
async def delete_course(course_id: str, user=Depends(verify_teacher_token)):
    try:
        # Get file URL before deleting
        result = session.execute("SELECT file_url FROM courses WHERE id=%s", [uuid.UUID(course_id)])
        row = result.one()
        
        if row:
            # Delete file from MinIO
            file_url = row.file_url
            if file_url and "localhost:9000" in file_url:
                file_name = file_url.split('/')[-1]
                try:
                    MINIO_CLIENT.remove_object(BUCKET_NAME, file_name)
                    logger.info(f"Deleted file {file_name} from MinIO")
                except Exception as e:
                    logger.error(f"Error deleting file from MinIO: {e}")
        
        # Delete from Cassandra
        session.execute("DELETE FROM courses WHERE id=%s", [uuid.UUID(course_id)])
        return {"message": "Course deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/courses/{course_id}")
async def update_course(
    course_id: str,
    title: str = Form(...),
    description: str = Form(...),
    file: UploadFile = File(None),
    user=Depends(verify_teacher_token)
):
    try:
        print(f"=== UPDATE COURSE START ===")
        print(f"Course ID: {course_id}")
        print(f"Title: {title}")
        print(f"Description: {description}")
        print(f"File received: {file.filename if file else 'No file'}")
        
        # Convert course_id to UUID
        course_uuid = uuid.UUID(course_id)
        
        # Handle file upload if a new file is provided
        new_file_url = None
        if file and file.filename:
            print(f"Processing file: {file.filename}")
            
            # Get the old file URL before updating
            result = session.execute("SELECT file_url FROM courses WHERE id = %s", [course_uuid])
            row = result.one()
            old_file_url = row.file_url if row else None
            print(f"Old file URL: {old_file_url}")
            
            # Generate new filename
            file_extension = os.path.splitext(file.filename)[1]
            file_name = f"{uuid.uuid4()}{file_extension}"
            
            # Upload new file to MinIO
            MINIO_CLIENT.put_object(
                BUCKET_NAME,
                file_name,
                file.file,
                length=-1,
                part_size=10*1024*1024
            )
            print(f"File uploaded to MinIO: {file_name}")
            
            # Create new file URL
            new_file_url = f"http://localhost:9000/courses/{file_name}"
            
            # Update the database with new file URL
            update_query = "UPDATE courses SET title = %s, description = %s, file_url = %s WHERE id = %s"
            session.execute(update_query, [title, description, new_file_url, course_uuid])
            print(f"Database updated with new file URL: {new_file_url}")
            
            # Delete the old file from MinIO if it exists
            if old_file_url:
                old_file_name = old_file_url.split('/')[-1]
                try:
                    MINIO_CLIENT.remove_object(BUCKET_NAME, old_file_name)
                    print(f"Deleted old file from MinIO: {old_file_name}")
                except Exception as e:
                    print(f"Error deleting old file: {e}")
            
        else:
            # Update only title and description without changing file
            update_query = "UPDATE courses SET title = %s, description = %s WHERE id = %s"
            session.execute(update_query, [title, description, course_uuid])
            print("Database updated with new title and description only")
        
        print(f"=== UPDATE SUCCESSFUL ===")
        return {
            "success": True,
            "message": "Course updated successfully",
            "title": title,
            "description": description,
            "file_updated": new_file_url is not None,
            "file_url": new_file_url
        }
        
    except Exception as e:
        print(f"=== ERROR UPDATING COURSE ===")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/public/courses")
async def list_public_courses(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    rows = session.execute("SELECT id, title, description, file_url, teacher, created_at FROM courses")
    courses = []
    for row in rows:
        courses.append({
            "id": str(row.id),
            "title": row.title,
            "description": row.description,
            "file_url": row.file_url,
            "teacher": row.teacher,
            "created_at": row.created_at.isoformat() if row.created_at else None
        })
    return {"courses": courses}
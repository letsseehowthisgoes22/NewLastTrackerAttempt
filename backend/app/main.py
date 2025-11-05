from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from typing import List
import psycopg
import os
import shutil
from pathlib import Path
from app.database import get_db_connection, init_db
from app.auth import create_access_token, verify_token, authenticate_user
from app.models import (
    LoginRequest, LoginResponse, UserResponse, 
    TripCreate, TripUpdate, TripResponse, 
    DocumentResponse, MessageResponse
)

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

UPLOAD_DIR = Path("./uploads")
ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.docx', '.doc'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes

@app.on_event("startup")
async def startup_event():
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return current user"""
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, role, first_name, last_name FROM users WHERE id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(login_data: LoginRequest):
    """Login endpoint - authenticate user and return JWT token"""
    conn = get_db_connection()
    user = authenticate_user(login_data.email, login_data.password, conn)
    conn.close()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "role": user["role"]
    })
    
    return LoginResponse(
        token=token,
        user=UserResponse(**user)
    )

@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(**current_user)

@app.post("/api/auth/logout")
async def logout():
    """Logout endpoint (client-side token deletion)"""
    return {"message": "Logged out successfully"}

@app.post("/api/trips", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(trip_data: TripCreate, current_user: dict = Depends(get_current_user)):
    """Create a new trip (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create trips"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        INSERT INTO trips (
            client_name, pickup_location, dropoff_location,
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            scheduled_start, scheduled_end, flight_number, airline,
            assigned_agent_id, assigned_parent_id, assigned_clinician_id,
            clinician_name, clinician_phone, clinician_email, additional_info,
            created_by_id, status
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    
    cursor.execute(query, (
        trip_data.client_name,
        trip_data.pickup_location,
        trip_data.dropoff_location,
        trip_data.pickup_lat,
        trip_data.pickup_lng,
        trip_data.dropoff_lat,
        trip_data.dropoff_lng,
        trip_data.scheduled_start,
        trip_data.scheduled_end,
        trip_data.flight_number,
        trip_data.airline,
        trip_data.assigned_agent_id,
        trip_data.assigned_parent_id,
        trip_data.assigned_clinician_id,
        trip_data.clinician_name,
        trip_data.clinician_phone,
        trip_data.clinician_email,
        trip_data.additional_info,
        current_user["id"],
        "scheduled"
    ))
    
    new_trip = cursor.fetchone()
    conn.commit()
    
    query_with_names = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               up.first_name || ' ' || up.last_name as parent_name,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name
        FROM trips t
        LEFT JOIN users ua ON t.assigned_agent_id = ua.id
        LEFT JOIN users up ON t.assigned_parent_id = up.id
        LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
        WHERE t.id = %s
    """
    cursor.execute(query_with_names, (new_trip["id"],))
    trip_with_names = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    return TripResponse(**trip_with_names)

@app.get("/api/trips", response_model=List[TripResponse])
async def get_trips(current_user: dict = Depends(get_current_user)):
    """Get all trips filtered by user role"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role == "admin":
        query = """
            SELECT t.*, 
                   ua.first_name || ' ' || ua.last_name as agent_name,
                   up.first_name || ' ' || up.last_name as parent_name,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name
            FROM trips t
            LEFT JOIN users ua ON t.assigned_agent_id = ua.id
            LEFT JOIN users up ON t.assigned_parent_id = up.id
            LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
            ORDER BY t.scheduled_start DESC
        """
        cursor.execute(query)
    elif user_role == "agent":
        query = """
            SELECT t.*, 
                   ua.first_name || ' ' || ua.last_name as agent_name,
                   up.first_name || ' ' || up.last_name as parent_name,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name
            FROM trips t
            LEFT JOIN users ua ON t.assigned_agent_id = ua.id
            LEFT JOIN users up ON t.assigned_parent_id = up.id
            LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
            WHERE t.assigned_agent_id = %s
            ORDER BY t.scheduled_start DESC
        """
        cursor.execute(query, (user_id,))
    elif user_role == "parent":
        query = """
            SELECT t.*, 
                   ua.first_name || ' ' || ua.last_name as agent_name,
                   up.first_name || ' ' || up.last_name as parent_name,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name
            FROM trips t
            LEFT JOIN users ua ON t.assigned_agent_id = ua.id
            LEFT JOIN users up ON t.assigned_parent_id = up.id
            LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
            WHERE t.assigned_parent_id = %s
            ORDER BY t.scheduled_start DESC
        """
        cursor.execute(query, (user_id,))
    elif user_role == "clinician":
        query = """
            SELECT t.*, 
                   ua.first_name || ' ' || ua.last_name as agent_name,
                   up.first_name || ' ' || up.last_name as parent_name,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name
            FROM trips t
            LEFT JOIN users ua ON t.assigned_agent_id = ua.id
            LEFT JOIN users up ON t.assigned_parent_id = up.id
            LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
            WHERE t.assigned_clinician_id = %s
            ORDER BY t.scheduled_start DESC
        """
        cursor.execute(query, (user_id,))
    else:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid user role"
        )
    
    trips = cursor.fetchall()
    cursor.close()
    conn.close()
    
    return [TripResponse(**trip) for trip in trips]

@app.get("/api/trips/{trip_id}", response_model=TripResponse)
async def get_trip(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get single trip details with access control"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               up.first_name || ' ' || up.last_name as parent_name,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name
        FROM trips t
        LEFT JOIN users ua ON t.assigned_agent_id = ua.id
        LEFT JOIN users up ON t.assigned_parent_id = up.id
        LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
        WHERE t.id = %s
    """
    cursor.execute(query, (trip_id,))
    trip = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    return TripResponse(**trip)

@app.put("/api/trips/{trip_id}", response_model=TripResponse)
async def update_trip(trip_id: int, trip_data: TripUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing trip (admin and agent roles)"""
    if current_user["role"] not in ["admin", "agent"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and agents can update trips"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    existing_trip = cursor.fetchone()
    
    if not existing_trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    update_fields = []
    update_values = []
    
    if trip_data.client_name is not None:
        update_fields.append("client_name = %s")
        update_values.append(trip_data.client_name)
    if trip_data.pickup_location is not None:
        update_fields.append("pickup_location = %s")
        update_values.append(trip_data.pickup_location)
    if trip_data.dropoff_location is not None:
        update_fields.append("dropoff_location = %s")
        update_values.append(trip_data.dropoff_location)
    if trip_data.pickup_lat is not None:
        update_fields.append("pickup_lat = %s")
        update_values.append(trip_data.pickup_lat)
    if trip_data.pickup_lng is not None:
        update_fields.append("pickup_lng = %s")
        update_values.append(trip_data.pickup_lng)
    if trip_data.dropoff_lat is not None:
        update_fields.append("dropoff_lat = %s")
        update_values.append(trip_data.dropoff_lat)
    if trip_data.dropoff_lng is not None:
        update_fields.append("dropoff_lng = %s")
        update_values.append(trip_data.dropoff_lng)
    if trip_data.scheduled_start is not None:
        update_fields.append("scheduled_start = %s")
        update_values.append(trip_data.scheduled_start)
    if trip_data.scheduled_end is not None:
        update_fields.append("scheduled_end = %s")
        update_values.append(trip_data.scheduled_end)
    if trip_data.flight_number is not None:
        update_fields.append("flight_number = %s")
        update_values.append(trip_data.flight_number)
    if trip_data.airline is not None:
        update_fields.append("airline = %s")
        update_values.append(trip_data.airline)
    if trip_data.assigned_agent_id is not None:
        update_fields.append("assigned_agent_id = %s")
        update_values.append(trip_data.assigned_agent_id)
    if trip_data.assigned_parent_id is not None:
        update_fields.append("assigned_parent_id = %s")
        update_values.append(trip_data.assigned_parent_id)
    if trip_data.assigned_clinician_id is not None:
        update_fields.append("assigned_clinician_id = %s")
        update_values.append(trip_data.assigned_clinician_id)
    if trip_data.clinician_name is not None:
        update_fields.append("clinician_name = %s")
        update_values.append(trip_data.clinician_name)
    if trip_data.clinician_phone is not None:
        update_fields.append("clinician_phone = %s")
        update_values.append(trip_data.clinician_phone)
    if trip_data.clinician_email is not None:
        update_fields.append("clinician_email = %s")
        update_values.append(trip_data.clinician_email)
    if trip_data.additional_info is not None:
        update_fields.append("additional_info = %s")
        update_values.append(trip_data.additional_info)
    if trip_data.status is not None:
        update_fields.append("status = %s")
        update_values.append(trip_data.status)
    
    update_fields.append("updated_at = CURRENT_TIMESTAMP")
    
    if len(update_fields) > 1:
        query = f"UPDATE trips SET {', '.join(update_fields)} WHERE id = %s"
        update_values.append(trip_id)
        cursor.execute(query, tuple(update_values))
        conn.commit()
    
    query_with_names = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               up.first_name || ' ' || up.last_name as parent_name,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name
        FROM trips t
        LEFT JOIN users ua ON t.assigned_agent_id = ua.id
        LEFT JOIN users up ON t.assigned_parent_id = up.id
        LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
        WHERE t.id = %s
    """
    cursor.execute(query_with_names, (trip_id,))
    updated_trip = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    return TripResponse(**updated_trip)

@app.delete("/api/trips/{trip_id}")
async def delete_trip(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a trip (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete trips"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    cursor.execute("DELETE FROM trips WHERE id = %s", (trip_id,))
    conn.commit()
    
    cursor.close()
    conn.close()
    
    return {"message": "Trip deleted successfully"}

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(role: str = None, current_user: dict = Depends(get_current_user)):
    """Get all users, optionally filtered by role (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view users"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if role:
        cursor.execute(
            "SELECT id, email, role, first_name, last_name FROM users WHERE role = %s ORDER BY first_name, last_name",
            (role,)
        )
    else:
        cursor.execute("SELECT id, email, role, first_name, last_name FROM users ORDER BY role, first_name, last_name")
    
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    
    return [UserResponse(**user) for user in users]

@app.get("/api/trips/{trip_id}/documents", response_model=List[DocumentResponse])
async def get_trip_documents(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get all documents for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    query = """
        SELECT d.*, u.first_name || ' ' || u.last_name as uploader_name
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by_id = u.id
        WHERE d.trip_id = %s
        ORDER BY d.uploaded_at DESC
    """
    cursor.execute(query, (trip_id,))
    documents = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return [DocumentResponse(**doc) for doc in documents]

@app.get("/api/trips/{trip_id}/messages", response_model=List[MessageResponse])
async def get_trip_messages(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get all messages for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    query = """
        SELECT m.*, u.first_name || ' ' || u.last_name as sender_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.trip_id = %s
        ORDER BY m.sent_at ASC
    """
    cursor.execute(query, (trip_id,))
    messages = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return [MessageResponse(**msg) for msg in messages]

@app.post("/api/trips/{trip_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    trip_id: int, 
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a document to a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    contents = await file.read()
    file_size = len(contents)
    
    if file_size > MAX_FILE_SIZE:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024 * 1024)}MB"
        )
    
    trip_upload_dir = UPLOAD_DIR / f"trip_{trip_id}"
    trip_upload_dir.mkdir(parents=True, exist_ok=True)
    
    safe_filename = f"{os.urandom(16).hex()}_{file.filename}"
    file_path = trip_upload_dir / safe_filename
    
    with open(file_path, "wb") as f:
        f.write(contents)
    
    file_url = f"/uploads/trip_{trip_id}/{safe_filename}"
    
    query = """
        INSERT INTO documents (trip_id, uploaded_by_id, filename, file_url, file_type, file_size)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    cursor.execute(query, (
        trip_id,
        user_id,
        file.filename,
        file_url,
        file.content_type,
        file_size
    ))
    
    new_document = cursor.fetchone()
    conn.commit()
    
    query_with_uploader = """
        SELECT d.*, u.first_name || ' ' || u.last_name as uploader_name
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by_id = u.id
        WHERE d.id = %s
    """
    cursor.execute(query_with_uploader, (new_document["id"],))
    document_with_uploader = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    return DocumentResponse(**document_with_uploader)

@app.get("/api/documents/{document_id}/download")
async def download_document(document_id: int, current_user: dict = Depends(get_current_user)):
    """Download a document"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
    document = cursor.fetchone()
    
    if not document:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (document["trip_id"],))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    cursor.close()
    conn.close()
    
    file_path = Path(".") / document["file_url"].lstrip("/")
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on server"
        )
    
    return FileResponse(
        path=file_path,
        filename=document["filename"],
        media_type="application/octet-stream"
    )

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a document"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
    document = cursor.fetchone()
    
    if not document:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin" and document["uploaded_by_id"] != user_id:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the uploader can delete documents"
        )
    
    file_path = Path(".") / document["file_url"].lstrip("/")
    
    if file_path.exists():
        os.remove(file_path)
    
    cursor.execute("DELETE FROM documents WHERE id = %s", (document_id,))
    conn.commit()
    
    cursor.close()
    conn.close()
    
    return {"message": "Document deleted successfully"}

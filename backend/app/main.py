from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from typing import List, Optional
from datetime import datetime
import psycopg
import os
import shutil
from pathlib import Path
from app.database import get_db_connection, init_db
from app.auth import create_access_token, verify_token, authenticate_user
from app.models import (
    LoginRequest, LoginResponse, UserResponse, 
    TripCreate, TripUpdate, TripResponse, 
    DocumentResponse, MessageResponse,
    LocationUpdate, LocationUpdateResponse,
    MessageCreate, MessageResponseItem, MessagesResponse, UnreadCountResponse,
    LocationSharingUpdate, TripCredentialsUpdate, MilestoneUpdate,
    NotificationRecipient, NotificationSettingsResponse
)
from app.websocket import sio, broadcast_location_update
from app.flight_tracking import fetch_flight_status
from app.tracking_mode import determine_tracking_mode, update_trip_tracking_mode
from app.rate_limiter import rate_limiter
from app.notifications import send_email, send_sms
import socketio
import html

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path='socket.io')

UPLOAD_DIR = Path("./uploads")
ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.docx', '.doc'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes

def _split_name(full_name: Optional[str]):
    if not full_name:
        return (None, None)
    parts = full_name.strip().split(" ", 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else None
    return first, last

def _virtual_email(role: str, passcode: str) -> str:
    safe_code = passcode.strip().lower()
    return f"{role.lower()}+{safe_code}@iyt.com"

def ensure_role_user(cursor, role: str, name: Optional[str], passcode: Optional[str]):
    if not passcode:
        return None
    email = _virtual_email(role, passcode)
    first_name, last_name = _split_name(name or role.title())
    cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            "UPDATE users SET password = %s, role = %s, first_name = %s, last_name = %s WHERE id = %s",
            (passcode, role, first_name, last_name, existing["id"])
        )
        return existing["id"]
    cursor.execute(
        """
        INSERT INTO users (email, password, role, first_name, last_name)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (email, passcode, role, first_name, last_name)
    )
    new_user = cursor.fetchone()
    return new_user["id"]

def update_user_name(cursor, user_id: Optional[int], name: Optional[str]):
    if not user_id or not name:
        return
    first_name, last_name = _split_name(name)
    cursor.execute(
        "UPDATE users SET first_name = %s, last_name = %s WHERE id = %s",
        (first_name, last_name, user_id)
    )

def get_user_full_name(cursor, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    cursor.execute(
        "SELECT first_name, last_name FROM users WHERE id = %s",
        (user_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    parts = [part for part in [row.get("first_name"), row.get("last_name")] if part]
    return " ".join(parts) if parts else None

@app.on_event("startup")
async def startup_event():
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

security = HTTPBearer()

def log_document_access(document_id: Optional[int], user_id: int, action: str, ip_address: str, success: bool):
    """Log document access for audit trail"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO document_access_log (document_id, user_id, action, ip_address, success)
            VALUES (%s, %s, %s, %s, %s)
        """, (document_id, user_id, action, ip_address, success))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Failed to log document access: {e}")

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
    
    agent_id = None
    if trip_data.agent_passcode:
        agent_id = ensure_role_user(cursor, "agent", trip_data.agent_name, trip_data.agent_passcode)
    elif trip_data.agent_name:
        agent_id = ensure_role_user(cursor, "agent", trip_data.agent_name, trip_data.agent_passcode or "")

    parent_id = None
    if trip_data.parent_passcode:
        parent_id = ensure_role_user(cursor, "parent", trip_data.parent_name, trip_data.parent_passcode)
    elif trip_data.parent_name:
        parent_id = ensure_role_user(cursor, "parent", trip_data.parent_name, trip_data.parent_passcode or "")

    clinician_id = None
    if trip_data.clinician_passcode:
        clinician_id = ensure_role_user(cursor, "clinician", trip_data.clinician_name, trip_data.clinician_passcode)
    elif trip_data.clinician_name:
        clinician_id = ensure_role_user(cursor, "clinician", trip_data.clinician_name, trip_data.clinician_passcode or "")
    
    sharing_enabled = trip_data.location_sharing_enabled if trip_data.location_sharing_enabled is not None else True

    flight_number = trip_data.flight_number.strip().upper() if trip_data.flight_number else None
    airline = trip_data.airline.strip() if trip_data.airline else None

    query = """
        INSERT INTO trips (
            client_name, client_age, client_build, transport_relevant_medical_info,
            parent_guardian_name, parent_guardian_relationship,
            pickup_location, dropoff_location,
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            scheduled_start, scheduled_end, flight_number, airline,
            assigned_agent_id, assigned_parent_id, assigned_clinician_id,
            clinician_name, clinician_phone, clinician_email, additional_info,
            created_by_id, status, location_sharing_enabled
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    
    cursor.execute(query, (
        trip_data.client_name,
        trip_data.client_age,
        trip_data.client_build,
        trip_data.transport_relevant_medical_info,
        trip_data.parent_guardian_name,
        trip_data.parent_guardian_relationship,
        trip_data.pickup_location,
        trip_data.dropoff_location,
        trip_data.pickup_lat,
        trip_data.pickup_lng,
        trip_data.dropoff_lat,
        trip_data.dropoff_lng,
        trip_data.scheduled_start,
        trip_data.scheduled_end,
        flight_number,
        airline,
        agent_id,
        parent_id,
        clinician_id,
        trip_data.clinician_name,
        trip_data.clinician_phone,
        trip_data.clinician_email,
        trip_data.additional_info,
        current_user["id"],
        "scheduled",
        sharing_enabled
    ))
    
    new_trip = cursor.fetchone()
    conn.commit()
    
    query_with_names = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               ua.password as agent_passcode,
               up.first_name || ' ' || up.last_name as parent_name,
               up.password as parent_passcode,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
               uc.password as clinician_passcode
        FROM trips t
        LEFT JOIN users ua ON t.assigned_agent_id = ua.id
        LEFT JOIN users up ON t.assigned_parent_id = up.id
        LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
        WHERE t.id = %s
    """
    cursor.execute(query_with_names, (new_trip["id"],))
    trip_with_names = cursor.fetchone()
    
    if current_user["role"] != "admin":
        trip_with_names["agent_passcode"] = None
        trip_with_names["parent_passcode"] = None
        trip_with_names["clinician_passcode"] = None
    
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
                   ua.password as agent_passcode,
                   up.first_name || ' ' || up.last_name as parent_name,
                   up.password as parent_passcode,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
                   uc.password as clinician_passcode
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
                   ua.password as agent_passcode,
                   up.first_name || ' ' || up.last_name as parent_name,
                   up.password as parent_passcode,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
                   uc.password as clinician_passcode
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
                   ua.password as agent_passcode,
                   up.first_name || ' ' || up.last_name as parent_name,
                   up.password as parent_passcode,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
                   uc.password as clinician_passcode
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
                   ua.password as agent_passcode,
                   up.first_name || ' ' || up.last_name as parent_name,
                   up.password as parent_passcode,
                   uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
                   uc.password as clinician_passcode
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
    
    responses = []
    for trip in trips:
        if current_user["role"] != "admin":
            trip["agent_passcode"] = None
            trip["parent_passcode"] = None
            trip["clinician_passcode"] = None
        responses.append(TripResponse(**trip))
    
    return responses

@app.get("/api/trips/{trip_id}", response_model=TripResponse)
async def get_trip(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get single trip details with access control"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               ua.password as agent_passcode,
               up.first_name || ' ' || up.last_name as parent_name,
               up.password as parent_passcode,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
               uc.password as clinician_passcode
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
    if current_user["role"] != "admin":
        trip["agent_passcode"] = None
        trip["parent_passcode"] = None
        trip["clinician_passcode"] = None
    
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
    
    existing_agent_id = existing_trip.get("assigned_agent_id")
    existing_parent_id = existing_trip.get("assigned_parent_id")
    existing_clinician_id = existing_trip.get("assigned_clinician_id")

    existing_agent_name = get_user_full_name(cursor, existing_agent_id)
    existing_parent_name = get_user_full_name(cursor, existing_parent_id)
    existing_clinician_name = get_user_full_name(cursor, existing_clinician_id)

    effective_agent_id = existing_agent_id
    effective_parent_id = existing_parent_id
    effective_clinician_id = existing_clinician_id

    if trip_data.agent_passcode is not None:
        cleaned_passcode = trip_data.agent_passcode.strip() if isinstance(trip_data.agent_passcode, str) else trip_data.agent_passcode
        if cleaned_passcode:
            effective_agent_id = ensure_role_user(
                cursor,
                "agent",
                trip_data.agent_name or existing_agent_name,
                cleaned_passcode
            )
        else:
            cleaned_passcode = None
        trip_data.agent_passcode = cleaned_passcode
    elif trip_data.agent_name is not None and effective_agent_id:
        update_user_name(cursor, effective_agent_id, trip_data.agent_name)

    if trip_data.parent_passcode is not None:
        cleaned_passcode = trip_data.parent_passcode.strip() if isinstance(trip_data.parent_passcode, str) else trip_data.parent_passcode
        if cleaned_passcode:
            effective_parent_id = ensure_role_user(
                cursor,
                "parent",
                trip_data.parent_name or existing_parent_name,
                cleaned_passcode
            )
        else:
            cleaned_passcode = None
        trip_data.parent_passcode = cleaned_passcode
    elif trip_data.parent_name is not None and effective_parent_id:
        update_user_name(cursor, effective_parent_id, trip_data.parent_name)

    if trip_data.clinician_passcode is not None:
        cleaned_passcode = trip_data.clinician_passcode.strip() if isinstance(trip_data.clinician_passcode, str) else trip_data.clinician_passcode
        if cleaned_passcode:
            effective_clinician_id = ensure_role_user(
                cursor,
                "clinician",
                trip_data.clinician_name or existing_clinician_name,
                cleaned_passcode
            )
        else:
            cleaned_passcode = None
        trip_data.clinician_passcode = cleaned_passcode
    elif trip_data.clinician_name is not None and effective_clinician_id:
        update_user_name(cursor, effective_clinician_id, trip_data.clinician_name)

    update_fields = []
    update_values = []
    
    if trip_data.client_name is not None:
        update_fields.append("client_name = %s")
        update_values.append(trip_data.client_name)
    if trip_data.client_age is not None:
        update_fields.append("client_age = %s")
        update_values.append(trip_data.client_age)
    if trip_data.client_build is not None:
        update_fields.append("client_build = %s")
        update_values.append(trip_data.client_build)
    if trip_data.transport_relevant_medical_info is not None:
        update_fields.append("transport_relevant_medical_info = %s")
        update_values.append(trip_data.transport_relevant_medical_info)
    if trip_data.parent_guardian_name is not None:
        update_fields.append("parent_guardian_name = %s")
        update_values.append(trip_data.parent_guardian_name)
    if trip_data.parent_guardian_relationship is not None:
        update_fields.append("parent_guardian_relationship = %s")
        update_values.append(trip_data.parent_guardian_relationship)
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
        sanitized_flight = trip_data.flight_number.strip().upper() if trip_data.flight_number else None
        update_fields.append("flight_number = %s")
        update_values.append(sanitized_flight)
    if trip_data.airline is not None:
        sanitized_airline = trip_data.airline.strip() if trip_data.airline else None
        update_fields.append("airline = %s")
        update_values.append(sanitized_airline)
    if effective_agent_id != existing_agent_id:
        update_fields.append("assigned_agent_id = %s")
        update_values.append(effective_agent_id)
    if effective_parent_id != existing_parent_id:
        update_fields.append("assigned_parent_id = %s")
        update_values.append(effective_parent_id)
    if effective_clinician_id != existing_clinician_id:
        update_fields.append("assigned_clinician_id = %s")
        update_values.append(effective_clinician_id)
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
    if trip_data.location_sharing_enabled is not None:
        update_fields.append("location_sharing_enabled = %s")
        update_values.append(trip_data.location_sharing_enabled)
    
    update_fields.append("updated_at = CURRENT_TIMESTAMP")
    
    if len(update_fields) > 1:
        query = f"UPDATE trips SET {', '.join(update_fields)} WHERE id = %s"
        update_values.append(trip_id)
        cursor.execute(query, tuple(update_values))
        conn.commit()
    
    query_with_names = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               ua.password as agent_passcode,
               up.first_name || ' ' || up.last_name as parent_name,
               up.password as parent_passcode,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
               uc.password as clinician_passcode
        FROM trips t
        LEFT JOIN users ua ON t.assigned_agent_id = ua.id
        LEFT JOIN users up ON t.assigned_parent_id = up.id
        LEFT JOIN users uc ON t.assigned_clinician_id = uc.id
        WHERE t.id = %s
    """
    cursor.execute(query_with_names, (trip_id,))
    updated_trip = cursor.fetchone()
    
    if current_user["role"] != "admin":
        updated_trip["agent_passcode"] = None
        updated_trip["parent_passcode"] = None
        updated_trip["clinician_passcode"] = None
    
    cursor.close()
    conn.close()
    
    return TripResponse(**updated_trip)

@app.put("/api/trips/{trip_id}/credentials", response_model=TripResponse)
async def update_trip_credentials(
    trip_id: int,
    credentials: TripCredentialsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update trip credentials (names and passcodes) - admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update trip credentials"
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
    
    # Get existing user IDs before updating
    existing_agent_id = existing_trip.get("assigned_agent_id")
    existing_parent_id = existing_trip.get("assigned_parent_id")
    existing_clinician_id = existing_trip.get("assigned_clinician_id")
    
    # Check if passcodes are actually changing by looking at existing users
    agent_id = existing_agent_id  # Keep existing if no passcode provided
    if credentials.agent_passcode:
        # Check if the existing user has the same passcode (case-insensitive for email lookup)
        if existing_agent_id:
            cursor.execute("SELECT password, email FROM users WHERE id = %s", (existing_agent_id,))
            existing_agent_user = cursor.fetchone()
            if existing_agent_user and existing_agent_user.get("password") == credentials.agent_passcode:
                # Same passcode, just update name if needed
                if credentials.agent_name:
                    update_user_name(cursor, existing_agent_id, credentials.agent_name)
                agent_id = existing_agent_id
            else:
                # Passcode changed, create/update to new virtual user
                agent_id = ensure_role_user(
                    cursor,
                    "agent",
                    credentials.agent_name,
                    credentials.agent_passcode
                )
        else:
            # No existing agent, create new one
            agent_id = ensure_role_user(
                cursor,
                "agent",
                credentials.agent_name,
                credentials.agent_passcode
            )
    
    # Update parent credentials
    parent_id = existing_parent_id  # Keep existing if no passcode provided
    if credentials.parent_passcode:
        if existing_parent_id:
            cursor.execute("SELECT password, email FROM users WHERE id = %s", (existing_parent_id,))
            existing_parent_user = cursor.fetchone()
            if existing_parent_user and existing_parent_user.get("password") == credentials.parent_passcode:
                # Same passcode, just update name if needed
                if credentials.parent_name:
                    update_user_name(cursor, existing_parent_id, credentials.parent_name)
                parent_id = existing_parent_id
            else:
                # Passcode changed, create/update to new virtual user
                parent_id = ensure_role_user(
                    cursor,
                    "parent",
                    credentials.parent_name,
                    credentials.parent_passcode
                )
        else:
            # No existing parent, create new one
            parent_id = ensure_role_user(
                cursor,
                "parent",
                credentials.parent_name,
                credentials.parent_passcode
            )
    
    # Update clinician credentials
    clinician_id = existing_clinician_id  # Keep existing if no passcode provided
    if credentials.clinician_passcode:
        if existing_clinician_id:
            cursor.execute("SELECT password, email FROM users WHERE id = %s", (existing_clinician_id,))
            existing_clinician_user = cursor.fetchone()
            if existing_clinician_user and existing_clinician_user.get("password") == credentials.clinician_passcode:
                # Same passcode, just update name if needed
                if credentials.clinician_name:
                    update_user_name(cursor, existing_clinician_id, credentials.clinician_name)
                clinician_id = existing_clinician_id
            else:
                # Passcode changed, create/update to new virtual user
                clinician_id = ensure_role_user(
                    cursor,
                    "clinician",
                    credentials.clinician_name,
                    credentials.clinician_passcode
                )
        else:
            # No existing clinician, create new one
            clinician_id = ensure_role_user(
                cursor,
                "clinician",
                credentials.clinician_name,
                credentials.clinician_passcode
            )
    
    # Update the trip with new user assignments
    cursor.execute(
        """
        UPDATE trips 
        SET assigned_agent_id = %s,
            assigned_parent_id = %s,
            assigned_clinician_id = %s,
            clinician_name = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (
            agent_id,
            parent_id,
            clinician_id,
            credentials.clinician_name,
            trip_id
        )
    )
    conn.commit()
    
    # Fetch updated trip with names
    query_with_names = """
        SELECT t.*, 
               ua.first_name || ' ' || ua.last_name as agent_name,
               ua.password as agent_passcode,
               up.first_name || ' ' || up.last_name as parent_name,
               up.password as parent_passcode,
               uc.first_name || ' ' || uc.last_name as assigned_clinician_name,
               uc.password as clinician_passcode
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

@app.post("/api/trips/{trip_id}/location-sharing")
async def update_location_sharing(
    trip_id: int,
    payload: LocationSharingUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Enable or disable location sharing for a trip (admin or assigned agent)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT assigned_agent_id FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()

    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )

    if current_user["role"] == "admin":
        authorized = True
    elif current_user["role"] == "agent" and trip["assigned_agent_id"] == current_user["id"]:
        authorized = True
    else:
        authorized = False

    if not authorized:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to change location sharing status"
        )

    cursor.execute(
        """
        UPDATE trips
        SET location_sharing_enabled = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (payload.enabled, trip_id)
    )
    conn.commit()

    cursor.close()
    conn.close()

    await sio.emit(
        'location_sharing_status',
        {
            "trip_id": trip_id,
            "enabled": payload.enabled,
            "changed_by": current_user["role"]
        },
        room=f"trip_{trip_id}"
    )

    return {"success": True, "location_sharing_enabled": payload.enabled}

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


@app.post("/api/trips/{trip_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    trip_id: int, 
    file: UploadFile = File(...),
    request: Request = None,
    current_user: dict = Depends(get_current_user)
):
    """Upload a document to a trip"""
    client_ip = request.client.host if request else "unknown"
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        log_document_access(None, current_user["id"], "upload", client_ip, False)
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
            log_document_access(None, user_id, "upload", client_ip, False)
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
    
    log_document_access(new_document["id"], user_id, "upload", client_ip, True)
    
    return DocumentResponse(**document_with_uploader)

@app.get("/api/documents/{document_id}/download")
async def download_document(document_id: int, request: Request = None, current_user: dict = Depends(get_current_user)):
    """Download a document"""
    client_ip = request.client.host if request else "unknown"
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
    document = cursor.fetchone()
    
    if not document:
        cursor.close()
        conn.close()
        log_document_access(document_id, current_user["id"], "download", client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (document["trip_id"],))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        log_document_access(document_id, current_user["id"], "download", client_ip, False)
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
            log_document_access(document_id, user_id, "download", client_ip, False)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    cursor.close()
    conn.close()
    
    file_path = Path(".") / document["file_url"].lstrip("/")
    
    if not file_path.exists():
        log_document_access(document_id, user_id, "download", client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on server"
        )
    
    media_type = document.get("file_type") or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    log_document_access(document_id, user_id, "download", client_ip, True)
    return FileResponse(path=file_path, filename=document["filename"], media_type=media_type)

@app.get("/api/documents/{document_id}/view")
async def view_document(document_id: int, token: str = Query(...)):
    """Inline view of a document in browser using a JWT token in query string."""
    try:
        payload = verify_token(token)
        user_id = payload.get("user_id")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
    document = cursor.fetchone()
    if not document:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    cursor.execute("SELECT * FROM trips WHERE id = %s", (document["trip_id"],))
    trip = cursor.fetchone()
    if not trip:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")

    cursor.execute("SELECT id, role FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    if not user:
        cursor.close(); conn.close()
        raise HTTPException(status_code=401, detail="User not found")

    if user["role"] != "admin":
        if (trip["assigned_agent_id"] != user["id"] and 
            trip["assigned_parent_id"] != user["id"] and 
            trip["assigned_clinician_id"] != user["id"]):
            cursor.close(); conn.close()
            raise HTTPException(status_code=403, detail="Access denied")

    cursor.close(); conn.close()
    file_path = Path(".") / document["file_url"].lstrip("/")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")
    media_type = document.get("file_type") or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    headers = {"Content-Disposition": f'inline; filename="{document["filename"]}"'}
    return FileResponse(path=file_path, media_type=media_type, headers=headers)

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: int, request: Request = None, current_user: dict = Depends(get_current_user)):
    """Delete a document"""
    client_ip = request.client.host if request else "unknown"
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
    document = cursor.fetchone()
    
    if not document:
        cursor.close()
        conn.close()
        log_document_access(document_id, current_user["id"], "delete", client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (document["trip_id"],))
    trip = cursor.fetchone()
    
    user_id = current_user["id"]
    user_role = current_user["role"]
    
    if user_role != "admin" and document["uploaded_by_id"] != user_id:
        cursor.close()
        conn.close()
        log_document_access(document_id, user_id, "delete", client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the uploader can delete documents"
        )
    
    if trip and user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            cursor.close()
            conn.close()
            log_document_access(document_id, user_id, "delete", client_ip, False)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    file_path = Path(".") / document["file_url"].lstrip("/")
    
    if file_path.exists():
        os.remove(file_path)
    
    cursor.execute("DELETE FROM documents WHERE id = %s", (document_id,))
    conn.commit()
    
    cursor.close()
    conn.close()
    
    log_document_access(document_id, user_id, "delete", client_ip, True)
    
    return {"message": "Document deleted successfully"}

@app.post("/api/trips/{trip_id}/location", response_model=LocationUpdateResponse, status_code=status.HTTP_201_CREATED)
async def post_location(trip_id: int, location_data: LocationUpdate, current_user: dict = Depends(get_current_user)):
    """Post GPS location update for a trip (agent only)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip
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
    
    # Verify user is the assigned agent or admin
    if user_role != "admin" and trip["assigned_agent_id"] != user_id:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned agent can post location updates"
        )

    if "location_sharing_enabled" in trip.keys() and trip["location_sharing_enabled"] is False:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location sharing is currently disabled for this trip."
        )
    
    # Validate coordinates
    if not (-90 <= location_data.latitude <= 90):
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid latitude (must be between -90 and 90)"
        )
    
    if not (-180 <= location_data.longitude <= 180):
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid longitude (must be between -180 and 180)"
        )
    
    # Insert location update
    query = """
        INSERT INTO location_updates (trip_id, agent_id, latitude, longitude, accuracy, source)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    cursor.execute(query, (
        trip_id,
        user_id,
        location_data.latitude,
        location_data.longitude,
        location_data.accuracy,
        'gps'
    ))
    
    location = cursor.fetchone()
    
    # Update trip status to in_progress if it's scheduled
    if trip["status"] == "scheduled":
        cursor.execute("""
            UPDATE trips 
            SET status = 'in_progress', actual_start = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (trip_id,))
    
    conn.commit()
    cursor.close()
    conn.close()
    
    await broadcast_location_update(trip_id, {
        'latitude': float(location['latitude']),
        'longitude': float(location['longitude']),
        'accuracy': float(location['accuracy']) if location['accuracy'] else None,
        'timestamp': location['timestamp'].isoformat()
    })
    
    return LocationUpdateResponse(**location)

@app.get("/api/trips/{trip_id}/location/latest")
async def get_latest_location(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get the most recent location update for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip
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
    
    # Verify user has access to this trip
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

    if "location_sharing_enabled" in trip.keys() and trip["location_sharing_enabled"] is False:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location sharing is currently disabled for this trip."
        )
    
    # Get latest location
    cursor.execute("""
        SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) as seconds_ago
        FROM location_updates 
        WHERE trip_id = %s 
        ORDER BY timestamp DESC 
        LIMIT 1
    """, (trip_id,))
    
    location = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if not location:
        return {"message": "No location updates yet"}
    
    return {
        "latitude": float(location["latitude"]),
        "longitude": float(location["longitude"]),
        "accuracy": float(location["accuracy"]) if location["accuracy"] else None,
        "timestamp": location["timestamp"].isoformat(),
        "seconds_ago": int(location["seconds_ago"])
    }

@app.get("/api/trips/{trip_id}/location/history")
async def get_location_history(
    trip_id: int, 
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get location history for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip
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
    
    # Verify user has access to this trip
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

    if "location_sharing_enabled" in trip.keys() and trip["location_sharing_enabled"] is False:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location sharing is currently disabled for this trip."
        )
    
    # Get location history
    cursor.execute("""
        SELECT latitude, longitude, accuracy, timestamp
        FROM location_updates 
        WHERE trip_id = %s 
        ORDER BY timestamp DESC 
        LIMIT %s
    """, (trip_id, limit))
    
    locations = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return {
        "locations": [
            {
                "latitude": float(loc["latitude"]),
                "longitude": float(loc["longitude"]),
                "accuracy": float(loc["accuracy"]) if loc["accuracy"] else None,
                "timestamp": loc["timestamp"].isoformat()
            }
            for loc in locations
        ]
    }

@app.get("/api/trips/{trip_id}/flight")
async def get_flight_status(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get flight status for a trip with a flight number"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
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
    
    # Verify user has access to this trip
    if user_role != "admin":
        if (trip["assigned_agent_id"] != user_id and 
            trip["assigned_parent_id"] != user_id and 
            trip["assigned_clinician_id"] != user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    if not trip["flight_number"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No flight number associated with this trip"
        )
    
    flight_info = fetch_flight_status(trip["flight_number"])
    
    if not flight_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch flight status. API may be unavailable or flight not found."
        )
    
    if flight_info.get('aircraft_lat') and flight_info.get('aircraft_lng'):
        flight_info['current_position'] = {
            'latitude': flight_info['aircraft_lat'],
            'longitude': flight_info['aircraft_lng'],
            'altitude': flight_info.get('aircraft_altitude'),
            'speed': flight_info.get('aircraft_speed')
        }
    
    return flight_info

@app.get("/api/trips/{trip_id}/tracking-mode")
async def get_tracking_mode(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get current tracking mode for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
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
    
    mode = determine_tracking_mode(trip_id)
    
    new_mode = update_trip_tracking_mode(trip_id)
    if new_mode:
        await sio.emit('tracking_mode_changed', {
            'mode': new_mode,
            'timestamp': datetime.now().isoformat()
        }, room=f'trip_{trip_id}')
    
    return {
        'mode': mode,
        'timestamp': datetime.now().isoformat()
    }

@app.post("/api/trips/{trip_id}/messages", status_code=status.HTTP_201_CREATED)
async def post_message(trip_id: int, message_data: MessageCreate, current_user: dict = Depends(get_current_user)):
    """Send a new message to a trip"""
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
    
    if not rate_limiter.check_rate_limit(user_id, max_requests=20, window_minutes=1):
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 20 messages per minute."
        )
    
    message_text = message_data.message.strip()
    
    if not message_text:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty"
        )
    
    if len(message_text) > 5000:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message too long (max 5000 characters)"
        )
    
    message_text = html.escape(message_text)
    
    cursor.execute("""
        INSERT INTO messages (trip_id, sender_id, message_text, sent_at, read_by_recipient)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, sent_at
    """, (trip_id, user_id, message_text, datetime.now(), False))
    
    result = cursor.fetchone()
    message_id = result['id']
    sent_at = result['sent_at']
    
    conn.commit()
    cursor.close()
    conn.close()
    
    return {
        'id': message_id,
        'trip_id': trip_id,
        'sender': {
            'id': user_id,
            'name': f"{current_user['first_name']} {current_user['last_name']}",
            'role': user_role
        },
        'message': message_text,
        'sent_at': sent_at.isoformat(),
        'read': False,
        'is_mine': True
    }

@app.get("/api/trips/{trip_id}/messages")
async def get_messages(
    trip_id: int, 
    current_user: dict = Depends(get_current_user),
    limit: int = 100,
    since: Optional[str] = None
):
    """Retrieve all messages for a trip"""
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
    
    if since:
        try:
            from dateutil.parser import parse
            parse(since)
        except (ValueError, TypeError):
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid 'since' timestamp format. Use ISO 8601 format."
            )
    
    query = """
        SELECT m.*, u.first_name, u.last_name, u.role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.trip_id = %s
    """
    params = [trip_id]
    
    if since:
        query += " AND m.sent_at > %s"
        params.append(since)
    
    query += " ORDER BY m.sent_at ASC LIMIT %s"
    params.append(limit)
    
    cursor.execute(query, params)
    messages = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    result = []
    for msg in messages:
        result.append({
            'id': msg['id'],
            'sender': {
                'id': msg['sender_id'],
                'name': f"{msg['first_name']} {msg['last_name']}",
                'role': msg['role']
            },
            'message': msg['message_text'],
            'sent_at': msg['sent_at'].isoformat(),
            'read': msg['read_by_recipient'],
            'is_mine': msg['sender_id'] == user_id
        })
    
    return {
        'messages': result,
        'count': len(result)
    }

@app.put("/api/messages/{message_id}/read")
async def mark_message_read(message_id: int, current_user: dict = Depends(get_current_user)):
    """Mark a message as read"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM messages WHERE id = %s", (message_id,))
    message = cursor.fetchone()
    
    if not message:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (message['trip_id'],))
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
    
    cursor.execute(
        "UPDATE messages SET read_by_recipient = TRUE WHERE id = %s",
        (message_id,)
    )
    
    conn.commit()
    cursor.close()
    conn.close()
    
    return {'success': True}

@app.delete("/api/trips/{trip_id}/messages")
async def clear_trip_messages(
    trip_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Clear all messages for a trip (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can clear chat messages"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify trip exists
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    # Delete all messages for this trip
    cursor.execute("DELETE FROM messages WHERE trip_id = %s", (trip_id,))
    conn.commit()
    
    cursor.close()
    conn.close()
    
    # Emit WebSocket event to notify all connected clients
    await sio.emit('messages_cleared', {"trip_id": trip_id}, room=f"trip_{trip_id}")
    
    return {"message": "All messages cleared successfully"}

@app.get("/api/trips/{trip_id}/messages/unread")
async def get_unread_count(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Get count of unread messages for a trip"""
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
    
    cursor.execute("""
        SELECT COUNT(*) as count
        FROM messages
        WHERE trip_id = %s AND read_by_recipient = FALSE AND sender_id != %s
    """, (trip_id, user_id))
    
    result = cursor.fetchone()
    unread_count = result['count']
    
    cursor.close()
    conn.close()
    
    return {'unread_count': unread_count}

# ------- Milestones and Notifications -------

def _get_trip(cursor, trip_id: int):
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    return cursor.fetchone()

def _get_recipients(cursor, trip_id: int, event: str):
    cursor.execute("""
        SELECT * FROM notification_recipients
        WHERE trip_id = %s AND event = %s
    """, (trip_id, event))
    return cursor.fetchall()

def _send_event_emails(cursor, trip, event: str):
    recipients = _get_recipients(cursor, trip["id"], event)
    emails = [r["email"] for r in recipients if r.get("send_email") and r.get("email")]
    phones = [r["phone"] for r in recipients if r.get("send_sms") and r.get("phone")]
    print(f"[milestones] Event '{event}' recipients={emails}")
    if not emails:
        # still allow SMS without emails
        pass
    if event == "trip_started":
        subject = f"IYT Compass: Trip Started for {trip['client_name']}"
        html = f"<p>Trip for <strong>{trip['client_name']}</strong> has begun en route to destination.</p>"
    elif event == "complete":
        subject = f"IYT Compass: Transport Complete for {trip['client_name']}"
        html = f"<p>Transport for <strong>{trip['client_name']}</strong> is complete.</p>"
    elif event == "sixty_miles":
        subject = f"IYT Compass: 60 Miles from Destination - {trip['client_name']}"
        html = f"<p>The agent is within 60 miles of the destination for <strong>{trip['client_name']}</strong>.</p>"
    else:
        subject = f"IYT Compass Notification"
        html = "<p>Status update.</p>"
    sent = False
    if emails:
        sent = send_email(emails, subject, html, html_content_to_text(html))
        print(f"[milestones] Event '{event}' email_sent={sent}")
    # SMS body (plain text)
    sms_body = html_content_to_text(html)
    for phone in phones:
        s = send_sms(phone, sms_body)
        print(f"[milestones] Event '{event}' sms_sent={s} to={phone}")

def html_content_to_text(html: str) -> str:
    # naive fallback
    import re
    return re.sub("<[^<]+?>", "", html)

@app.put("/api/trips/{trip_id}/milestones")
async def update_milestones(trip_id: int, payload: MilestoneUpdate, current_user: dict = Depends(get_current_user)):
    """Toggle a milestone and trigger notifications where applicable."""
    if current_user["role"] not in ["admin", "agent"]:
        raise HTTPException(status_code=403, detail="Only admins or assigned agents can update milestones")
    conn = get_db_connection()
    cursor = conn.cursor()
    trip = _get_trip(cursor, trip_id)
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")
    if current_user["role"] == "agent" and trip["assigned_agent_id"] != current_user["id"]:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Not authorized for this trip")

    milestone_map = {
        1: "m1_began_route_to_pickup",
        2: "m2_arrived_pickup",
        3: "m3_en_route_to_destination",
        4: "m4_arrived_dropoff",
        5: "m5_transport_complete",
    }
    if payload.milestone not in milestone_map:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid milestone (must be 1..5)")

    # Basic skip check: if trying to set milestone >1 and previous isn't done
    if payload.completed and payload.milestone > 1:
        previous_done = trip.get(milestone_map[payload.milestone - 1])
        if not previous_done and not payload.confirm:
            cursor.close()
            conn.close()
            return {"needsConfirmation": True, "previousMilestone": payload.milestone - 1}

    field = milestone_map[payload.milestone]
    cursor.execute(
        f"UPDATE trips SET {field} = %s, milestone_updated_at = NOW(), updated_at = NOW() WHERE id = %s",
        (payload.completed, trip_id)
    )
    conn.commit()

    # Refresh
    trip = _get_trip(cursor, trip_id)

    # Trigger notifications for certain milestones
    if payload.completed:
        if payload.milestone == 3:
            _send_event_emails(cursor, trip, "trip_started")
        if payload.milestone == 5:
            _send_event_emails(cursor, trip, "complete")

    cursor.close()
    conn.close()
    await sio.emit('milestone_updated', {"trip_id": trip_id, "milestone": payload.milestone, "completed": payload.completed}, room=f"trip_{trip_id}")
    return {"success": True, "trip_id": trip_id, "milestone": payload.milestone, "completed": payload.completed}

@app.get("/api/trips/{trip_id}/notifications", response_model=NotificationSettingsResponse)
async def get_notification_settings(trip_id: int, current_user: dict = Depends(get_current_user)):
    """Return per-trip recipients for milestone events."""
    if current_user["role"] not in ["admin", "agent"]:
        raise HTTPException(status_code=403, detail="Only admins or agents can view")
    conn = get_db_connection()
    cursor = conn.cursor()
    trip = _get_trip(cursor, trip_id)
    if not trip:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")
    cursor.execute("SELECT * FROM notification_recipients WHERE trip_id = %s ORDER BY id ASC", (trip_id,))
    rows = cursor.fetchall()
    cursor.close(); conn.close()
    recipients = [
        {
            "id": r["id"],
            "event": r["event"],
            "name": r.get("name"),
            "email": r.get("email"),
            "phone": r.get("phone"),
            "send_email": r.get("send_email"),
            "send_sms": r.get("send_sms"),
        }
        for r in rows
    ]
    return {"trip_id": trip_id, "recipients": recipients}

@app.put("/api/trips/{trip_id}/notifications", response_model=NotificationSettingsResponse)
async def save_notification_settings(trip_id: int, recipients: List[NotificationRecipient], current_user: dict = Depends(get_current_user)):
    """Replace recipients list for a trip."""
    if current_user["role"] not in ["admin", "agent"]:
        raise HTTPException(status_code=403, detail="Only admins or agents can edit")
    conn = get_db_connection()
    cursor = conn.cursor()
    trip = _get_trip(cursor, trip_id)
    if not trip:
        cursor.close(); conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")
    # Clear and reinsert for simplicity
    cursor.execute("DELETE FROM notification_recipients WHERE trip_id = %s", (trip_id,))
    for r in recipients:
        cursor.execute("""
            INSERT INTO notification_recipients (trip_id, event, name, email, phone, send_email, send_sms)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (trip_id, r.event, r.name, str(r.email) if r.email else None, r.phone, r.send_email, r.send_sms))
    conn.commit()
    cursor.close(); conn.close()
    return await get_notification_settings(trip_id, current_user)
@app.post("/api/trips/{trip_id}/chat/takeover")
async def takeover_chat(
    trip_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Admin takes over chat control"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE trips
        SET chat_admin_takeover = TRUE,
            chat_taken_over_by = %s,
            chat_takeover_at = NOW()
        WHERE id = %s
    """, (current_user['id'], trip_id))
    
    conn.commit()
    cursor.close()
    conn.close()
    
    admin_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
    if not admin_name:
        admin_name = current_user['email']
    
    await sio.emit('chat_takeover', {
        'trip_id': trip_id,
        'admin_name': admin_name,
        'taken_over': True
    }, room=f'trip_{trip_id}')
    
    return {"success": True, "message": "Chat taken over successfully"}

@app.post("/api/trips/{trip_id}/chat/release")
async def release_chat(
    trip_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Admin releases chat control"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE trips
        SET chat_admin_takeover = FALSE,
            chat_taken_over_by = NULL,
            chat_takeover_at = NULL
        WHERE id = %s
    """, (trip_id,))
    
    conn.commit()
    cursor.close()
    conn.close()
    
    await sio.emit('chat_takeover', {
        'trip_id': trip_id,
        'taken_over': False
    }, room=f'trip_{trip_id}')
    
    return {"success": True, "message": "Chat released successfully"}

@app.put("/api/trips/{trip_id}/status")
async def update_trip_status(
    trip_id: int,
    status: str,
    notes: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Update trip status"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if current_user['role'] != 'admin' and trip['assigned_agent_id'] != current_user['id']:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Only assigned agent or admin can update status")
    
    # Validate status
    valid_statuses = ['scheduled', 'in_progress', 'completed', 'cancelled']
    if status not in valid_statuses:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    old_status = trip['status']
    
    cursor.execute("""
        INSERT INTO trip_status_history (trip_id, changed_by_id, old_status, new_status, notes)
        VALUES (%s, %s, %s, %s, %s)
    """, (trip_id, current_user['id'], old_status, status, notes))
    
    # Update trip status
    update_fields = ['status = %s', 'updated_at = NOW()']
    update_values = [status]
    
    if status == 'in_progress' and not trip['actual_start']:
        update_fields.append('actual_start = NOW()')
    elif status == 'completed' and not trip['actual_end']:
        update_fields.append('actual_end = NOW()')
    
    update_values.append(trip_id)
    cursor.execute(f"""
        UPDATE trips
        SET {', '.join(update_fields)}
        WHERE id = %s
    """, update_values)
    
    conn.commit()
    cursor.close()
    conn.close()
    
    user_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
    if not user_name:
        user_name = current_user['email']
    
    await sio.emit('status_changed', {
        'trip_id': trip_id,
        'old_status': old_status,
        'new_status': status,
        'changed_by': user_name,
        'timestamp': datetime.now().isoformat()
    }, room=f'trip_{trip_id}')
    
    return {
        'success': True,
        'trip_id': trip_id,
        'status': status
    }

@app.get("/api/trips/{trip_id}/status-history")
async def get_status_history(
    trip_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get status change history for a trip"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get trip to verify access
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Verify user has access to this trip
    if current_user['role'] not in ['admin', 'agent']:
        if (trip['assigned_parent_id'] != current_user['id'] and 
            trip['assigned_clinician_id'] != current_user['id']):
            cursor.close()
            conn.close()
            raise HTTPException(status_code=403, detail="Access denied")
    
    cursor.execute("""
        SELECT 
            sh.id,
            sh.old_status,
            sh.new_status,
            sh.changed_at,
            sh.notes,
            u.first_name,
            u.last_name,
            u.email
        FROM trip_status_history sh
        LEFT JOIN users u ON sh.changed_by_id = u.id
        WHERE sh.trip_id = %s
        ORDER BY sh.changed_at DESC
    """, (trip_id,))
    
    history = cursor.fetchall()
    cursor.close()
    conn.close()
    
    formatted_history = []
    for record in history:
        changed_by = f"{record['first_name']} {record['last_name']}".strip()
        if not changed_by:
            changed_by = record['email']
        
        formatted_history.append({
            'id': record['id'],
            'old_status': record['old_status'],
            'new_status': record['new_status'],
            'changed_by': changed_by,
            'changed_at': record['changed_at'].isoformat() if record['changed_at'] else None,
            'notes': record['notes']
        })
    
    return {'history': formatted_history}

@app.get("/api/users/me/notification-preferences")
async def get_notification_preferences(
    current_user: dict = Depends(get_current_user)
):
    """Get notification preferences for current user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM notification_preferences
        WHERE user_id = %s
    """, (current_user['id'],))
    
    prefs = cursor.fetchone()
    
    if not prefs:
        cursor.execute("""
            INSERT INTO notification_preferences (user_id)
            VALUES (%s)
            RETURNING *
        """, (current_user['id'],))
        prefs = cursor.fetchone()
        conn.commit()
    
    cursor.close()
    conn.close()
    
    return {
        'user_id': prefs['user_id'],
        'email_trip_started': prefs['email_trip_started'],
        'email_trip_completed': prefs['email_trip_completed'],
        'email_new_message': prefs['email_new_message'],
        'email_status_changed': prefs['email_status_changed'],
        'sms_trip_started': prefs['sms_trip_started'],
        'sms_trip_completed': prefs['sms_trip_completed'],
        'sms_new_message': prefs['sms_new_message'],
        'sms_status_changed': prefs['sms_status_changed']
    }

@app.put("/api/users/me/notification-preferences")
async def update_notification_preferences(
    email_trip_started: bool = None,
    email_trip_completed: bool = None,
    email_new_message: bool = None,
    email_status_changed: bool = None,
    sms_trip_started: bool = None,
    sms_trip_completed: bool = None,
    sms_new_message: bool = None,
    sms_status_changed: bool = None,
    current_user: dict = Depends(get_current_user)
):
    """Update notification preferences for current user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM notification_preferences
        WHERE user_id = %s
    """, (current_user['id'],))
    
    prefs = cursor.fetchone()
    
    if not prefs:
        cursor.execute("""
            INSERT INTO notification_preferences (user_id)
            VALUES (%s)
        """, (current_user['id'],))
        conn.commit()
    
    update_fields = []
    update_values = []
    
    if email_trip_started is not None:
        update_fields.append('email_trip_started = %s')
        update_values.append(email_trip_started)
    if email_trip_completed is not None:
        update_fields.append('email_trip_completed = %s')
        update_values.append(email_trip_completed)
    if email_new_message is not None:
        update_fields.append('email_new_message = %s')
        update_values.append(email_new_message)
    if email_status_changed is not None:
        update_fields.append('email_status_changed = %s')
        update_values.append(email_status_changed)
    if sms_trip_started is not None:
        update_fields.append('sms_trip_started = %s')
        update_values.append(sms_trip_started)
    if sms_trip_completed is not None:
        update_fields.append('sms_trip_completed = %s')
        update_values.append(sms_trip_completed)
    if sms_new_message is not None:
        update_fields.append('sms_new_message = %s')
        update_values.append(sms_new_message)
    if sms_status_changed is not None:
        update_fields.append('sms_status_changed = %s')
        update_values.append(sms_status_changed)
    
    if update_fields:
        update_fields.append('updated_at = NOW()')
        update_values.append(current_user['id'])
        
        cursor.execute(f"""
            UPDATE notification_preferences
            SET {', '.join(update_fields)}
            WHERE user_id = %s
        """, update_values)
        
        conn.commit()
    
    cursor.execute("""
        SELECT * FROM notification_preferences
        WHERE user_id = %s
    """, (current_user['id'],))
    
    prefs = cursor.fetchone()
    cursor.close()
    conn.close()
    
    return {
        'success': True,
        'preferences': {
            'user_id': prefs['user_id'],
            'email_trip_started': prefs['email_trip_started'],
            'email_trip_completed': prefs['email_trip_completed'],
            'email_new_message': prefs['email_new_message'],
            'email_status_changed': prefs['email_status_changed'],
            'sms_trip_started': prefs['sms_trip_started'],
            'sms_trip_completed': prefs['sms_trip_completed'],
            'sms_new_message': prefs['sms_new_message'],
            'sms_status_changed': prefs['sms_status_changed']
        }
    }

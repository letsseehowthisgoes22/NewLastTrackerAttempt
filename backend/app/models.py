from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from decimal import Decimal

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class LoginResponse(BaseModel):
    token: str
    user: UserResponse

class TripResponse(BaseModel):
    id: int
    client_name: str
    pickup_location: str
    dropoff_location: str
    pickup_lat: Optional[Decimal] = None
    pickup_lng: Optional[Decimal] = None
    dropoff_lat: Optional[Decimal] = None
    dropoff_lng: Optional[Decimal] = None
    scheduled_start: datetime
    scheduled_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: str
    flight_number: Optional[str] = None
    airline: Optional[str] = None
    assigned_agent_id: Optional[int] = None
    assigned_parent_id: Optional[int] = None
    assigned_clinician_id: Optional[int] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    agent_name: Optional[str] = None
    parent_name: Optional[str] = None
    clinician_name: Optional[str] = None

class LocationUpdateResponse(BaseModel):
    id: int
    trip_id: int
    agent_id: Optional[int] = None
    latitude: Decimal
    longitude: Decimal
    accuracy: Optional[Decimal] = None
    timestamp: datetime
    source: str

class DocumentResponse(BaseModel):
    id: int
    trip_id: int
    uploaded_by_id: Optional[int] = None
    filename: str
    file_url: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: datetime
    uploader_name: Optional[str] = None

class MessageResponse(BaseModel):
    id: int
    trip_id: int
    sender_id: Optional[int] = None
    message_text: str
    sent_at: datetime
    read_by_recipient: bool
    sender_name: Optional[str] = None

class ClientNoteResponse(BaseModel):
    id: int
    trip_id: int
    created_by_id: Optional[int] = None
    note_text: str
    created_at: datetime
    updated_at: datetime
    creator_name: Optional[str] = None

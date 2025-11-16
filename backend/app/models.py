from pydantic import BaseModel, EmailStr
from typing import Optional, List
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

class TripCreate(BaseModel):
    client_name: str
    client_age: Optional[int] = None
    client_build: Optional[str] = None
    transport_relevant_medical_info: Optional[str] = None
    parent_guardian_name: Optional[str] = None
    parent_guardian_relationship: Optional[str] = None
    pickup_location: str
    dropoff_location: str
    pickup_lat: Optional[Decimal] = None
    pickup_lng: Optional[Decimal] = None
    dropoff_lat: Optional[Decimal] = None
    dropoff_lng: Optional[Decimal] = None
    scheduled_start: datetime
    scheduled_end: Optional[datetime] = None
    flight_number: Optional[str] = None
    airline: Optional[str] = None
    agent_name: Optional[str] = None
    agent_passcode: Optional[str] = None
    parent_name: Optional[str] = None
    parent_passcode: Optional[str] = None
    clinician_passcode: Optional[str] = None
    clinician_name: Optional[str] = None
    clinician_phone: Optional[str] = None
    clinician_email: Optional[str] = None
    additional_info: Optional[str] = None
    location_sharing_enabled: Optional[bool] = True

class TripUpdate(BaseModel):
    client_name: Optional[str] = None
    client_age: Optional[int] = None
    client_build: Optional[str] = None
    transport_relevant_medical_info: Optional[str] = None
    parent_guardian_name: Optional[str] = None
    parent_guardian_relationship: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    pickup_lat: Optional[Decimal] = None
    pickup_lng: Optional[Decimal] = None
    dropoff_lat: Optional[Decimal] = None
    dropoff_lng: Optional[Decimal] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    flight_number: Optional[str] = None
    airline: Optional[str] = None
    assigned_agent_id: Optional[int] = None
    assigned_parent_id: Optional[int] = None
    assigned_clinician_id: Optional[int] = None
    agent_name: Optional[str] = None
    agent_passcode: Optional[str] = None
    parent_name: Optional[str] = None
    parent_passcode: Optional[str] = None
    clinician_passcode: Optional[str] = None
    clinician_name: Optional[str] = None
    clinician_phone: Optional[str] = None
    clinician_email: Optional[str] = None
    additional_info: Optional[str] = None
    status: Optional[str] = None
    location_sharing_enabled: Optional[bool] = None

class TripResponse(BaseModel):
    id: int
    client_name: str
    client_age: Optional[int] = None
    client_build: Optional[str] = None
    transport_relevant_medical_info: Optional[str] = None
    parent_guardian_name: Optional[str] = None
    parent_guardian_relationship: Optional[str] = None
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
    clinician_name: Optional[str] = None
    clinician_phone: Optional[str] = None
    clinician_email: Optional[str] = None
    additional_info: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    agent_name: Optional[str] = None
    agent_passcode: Optional[str] = None
    parent_name: Optional[str] = None
    parent_passcode: Optional[str] = None
    assigned_clinician_name: Optional[str] = None
    clinician_passcode: Optional[str] = None
    chat_admin_takeover: Optional[bool] = False
    chat_taken_over_by: Optional[int] = None
    chat_takeover_at: Optional[datetime] = None
    location_sharing_enabled: Optional[bool] = True
    # Milestones
    m1_began_route_to_pickup: Optional[bool] = False
    m2_arrived_pickup: Optional[bool] = False
    m3_en_route_to_destination: Optional[bool] = False
    m4_arrived_dropoff: Optional[bool] = False
    m5_transport_complete: Optional[bool] = False
    milestone_updated_at: Optional[datetime] = None
    notified_sixty_miles: Optional[bool] = False

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: Optional[datetime] = None

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

class MessageCreate(BaseModel):
    message: str

class MessageSender(BaseModel):
    id: int
    name: str
    role: str

class MessageResponseItem(BaseModel):
    id: int
    sender: MessageSender
    message: str
    sent_at: str
    read: bool
    is_mine: bool

class MessagesResponse(BaseModel):
    messages: List[MessageResponseItem]
    count: int

class UnreadCountResponse(BaseModel):
    unread_count: int

class LocationSharingUpdate(BaseModel):
    enabled: bool

class TripCredentialsUpdate(BaseModel):
    agent_name: str
    agent_passcode: str
    parent_name: str
    parent_passcode: str
    clinician_name: str
    clinician_passcode: str

class MilestoneUpdate(BaseModel):
    milestone: int
    completed: bool = True
    confirm: Optional[bool] = False

class NotificationRecipient(BaseModel):
    id: Optional[int] = None
    event: str  # 'trip_started' | 'sixty_miles' | 'complete'
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    send_email: bool = True
    send_sms: bool = False

class NotificationSettingsResponse(BaseModel):
    trip_id: int
    recipients: List[NotificationRecipient]

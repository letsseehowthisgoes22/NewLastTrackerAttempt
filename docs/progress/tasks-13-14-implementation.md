# Task 13 & 14 Implementation Report

**Date:** November 7, 2025  
**Tasks Completed:** Task 13 (Auto-Switch GPS ↔ Flight Logic) and Task 14 (Basic Chat API)  
**Pull Requests:**
- Task 13: https://github.com/letsseehowthisgoes22/NewLastTrackerAttempt/pull/4
- Task 14: https://github.com/letsseehowthisgoes22/NewLastTrackerAttempt/pull/5

---

## Task 13: Auto-Switch GPS ↔ Flight Logic

### Overview
Implemented automatic switching between GPS and flight tracking modes based on GPS data staleness and flight status. The system intelligently determines when to use GPS tracking versus flight tracking and displays appropriate visual indicators.

### Backend Implementation

#### 1. Database Schema Updates
**File:** `backend/app/database.py`

Added `tracking_mode` field to trips table:
```sql
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(50) DEFAULT 'gps';
```

#### 2. Tracking Mode Logic Module
**File:** `backend/app/tracking_mode.py` (NEW)

Implemented two core functions:

**`determine_tracking_mode(trip_id: int) -> TrackingMode`**
- Returns: 'gps', 'flight', or 'unknown'
- Logic:
  - If GPS update < 5 minutes old → 'gps'
  - If GPS stale (≥5 min) AND flight_number exists AND flight active/en-route → 'flight'
  - If flight landed < 30 minutes ago → 'flight'
  - Otherwise → 'unknown'

**`update_trip_tracking_mode(trip_id: int) -> Optional[TrackingMode]`**
- Updates tracking_mode in database
- Returns new mode if changed, None if unchanged
- Used by tracking mode endpoint

#### 3. API Endpoint
**File:** `backend/app/main.py`

Added `GET /api/trips/{trip_id}/tracking-mode`:
- Requires authentication
- Role-based access control (admin or assigned to trip)
- Calls `determine_tracking_mode()` and `update_trip_tracking_mode()`
- Emits WebSocket event if mode changes
- Returns current mode and timestamp

**Dependencies Added:**
- `python-dateutil` for date parsing in flight tracking logic

### Frontend Implementation

#### 1. API Integration
**File:** `frontend/src/api/trips.ts`

Added:
```typescript
export interface TrackingMode {
  mode: 'gps' | 'flight' | 'unknown';
  timestamp: string;
}

export const getTrackingMode = async (token: string, tripId: number): Promise<TrackingMode>
```

#### 2. Map Component Updates
**File:** `frontend/src/components/TripMap.tsx`

**New Icons:**
- `vehicleIcon` (blue marker) - for GPS mode
- `airplaneIcon` (violet marker) - for flight mode

**State Management:**
- Added `trackingMode` state variable
- Fetches tracking mode on component mount
- Updates marker icon based on current mode

**Visual Indicators:**
- GPS Mode: 📍 "GPS Tracking" (green) - "Real-time location from transport agent"
- Flight Mode: ✈️ "Flight Tracking" (blue) - "Tracking via flight number"
- Unknown Mode: ⚠️ "Location Unavailable" (orange) - "Waiting for location update..."

**Dynamic Marker:**
- `getCurrentIcon()` function returns appropriate icon based on mode
- Popup text changes: "Transport Agent" vs "Aircraft"

### Features Implemented

1. **Automatic Mode Detection**
   - Monitors GPS staleness
   - Checks flight status from AviationStack API
   - Switches modes automatically based on conditions

2. **Visual Feedback**
   - Different marker icons for each mode
   - Status indicator with icon, text, color, and description
   - Clear communication of current tracking method

3. **Edge Case Handling**
   - GPS intermittent: Waits 5 minutes before switching
   - Flight delayed/canceled: Returns to unknown mode
   - Post-landing grace period: 30 minutes before switching back
   - No flight number: Stays in GPS mode with appropriate messaging

### Testing Scenarios

**Test 1: Normal GPS Tracking**
- GPS updates every 30 seconds
- Mode: GPS (blue car marker)
- Status: "GPS Tracking" (green)

**Test 2: Board Flight**
- GPS stops updating
- After 5 minutes with active flight
- Mode switches to: Flight (violet airplane marker)
- Status: "Flight Tracking" (blue)

**Test 3: Land from Flight**
- Flight status changes to 'landed'
- GPS resumes
- Mode switches back to: GPS (blue car marker)

**Test 4: No Flight Number**
- GPS stops for 10+ minutes
- No flight_number in trip
- Mode: Unknown (orange warning marker)
- Status: "Location Unavailable"

---

## Task 14: Basic Chat API

### Overview
Implemented trip-specific messaging system with REST API endpoints. All messages are tied to trips with role-based access control, validation, rate limiting, and XSS protection. Frontend API functions included (UI components are Task 15).

### Backend Implementation

#### 1. Data Models
**File:** `backend/app/models.py`

Added Pydantic models:
```python
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
```

#### 2. Rate Limiting Module
**File:** `backend/app/rate_limiter.py` (NEW)

Implemented in-memory rate limiter:
```python
class RateLimiter:
    def check_rate_limit(self, user_id: int, max_requests: int = 20, window_minutes: int = 1) -> bool
```

- Tracks requests per user with timestamps
- Sliding window algorithm
- Configurable limits (default: 20 messages/minute)
- Automatic cleanup of expired timestamps

#### 3. API Endpoints
**File:** `backend/app/main.py`

**POST /api/trips/{trip_id}/messages**
- Send new message to trip
- Validation:
  - Non-empty message (400 error)
  - Max 5000 characters (400 error)
  - Rate limit: 20 messages/minute (429 error)
- Security:
  - XSS protection with `html.escape()`
  - Role-based access control
  - Plain text only
- Returns: Created message with sender info (201)

**GET /api/trips/{trip_id}/messages**
- Retrieve all messages for trip
- Query parameters:
  - `limit` (optional, default: 100)
  - `since` (optional, timestamp filter)
- Returns: Messages ordered by sent_at (oldest first)
- Includes:
  - Sender name and role
  - `is_mine` flag for current user's messages
  - Read status

**PUT /api/messages/{message_id}/read**
- Mark message as read
- Verifies user has access to trip
- Updates `read_by_recipient` to TRUE
- Returns: `{success: true}`

**GET /api/trips/{trip_id}/messages/unread**
- Get count of unread messages
- Excludes user's own messages
- Returns: `{unread_count: number}`

### Frontend Implementation

#### API Functions
**File:** `frontend/src/api/trips.ts`

Added TypeScript interfaces and functions:

```typescript
export interface MessageSender {
  id: number;
  name: string;
  role: string;
}

export interface Message {
  id: number;
  sender: MessageSender;
  message: string;
  sent_at: string;
  read: boolean;
  is_mine: boolean;
}

export const postMessage = async (token: string, tripId: number, message: string): Promise<Message>
export const getMessages = async (token: string, tripId: number, limit?: number, since?: string): Promise<MessagesResponse>
export const markMessageRead = async (token: string, messageId: number): Promise<{ success: boolean }>
export const getUnreadCount = async (token: string, tripId: number): Promise<UnreadCountResponse>
```

### Security Features

1. **XSS Protection**
   - All messages sanitized with `html.escape()`
   - Prevents script injection
   - Plain text only (no HTML)

2. **Rate Limiting**
   - 20 messages per minute per user
   - Prevents spam and abuse
   - Returns 429 error when exceeded

3. **Access Control**
   - All endpoints verify trip access
   - Admin can access all trips
   - Others: only assigned trips (agent, parent, clinician)
   - 403 error for unauthorized access

4. **Input Validation**
   - Empty messages rejected (400)
   - Messages > 5000 chars rejected (400)
   - Whitespace trimmed automatically

### Testing Scenarios

**Test 1: Send Message as Agent**
```bash
curl -X POST http://localhost:8000/api/trips/1/messages \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "We are running 10 minutes late due to traffic."}'
```
Expected: 201 Created with message details

**Test 2: Get Messages as Parent**
```bash
curl http://localhost:8000/api/trips/1/messages \
  -H "Authorization: Bearer $PARENT_TOKEN"
```
Expected: 200 OK with messages array, correct `is_mine` flags

**Test 3: Access Control**
```bash
curl http://localhost:8000/api/trips/2/messages \
  -H "Authorization: Bearer $PARENT_TOKEN"
```
Expected: 403 Forbidden (not assigned to trip 2)

**Test 4: Validation - Empty Message**
```bash
curl -X POST http://localhost:8000/api/trips/1/messages \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{"message": "   "}'
```
Expected: 400 Bad Request - "Message cannot be empty"

**Test 5: Validation - Long Message**
```bash
curl -X POST http://localhost:8000/api/trips/1/messages \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{"message": "'$(python3 -c 'print("x" * 5001)')'"}'
```
Expected: 400 Bad Request - "Message too long"

**Test 6: Rate Limiting**
Send 21 messages rapidly:
Expected: First 20 succeed (201), 21st fails with 429 Too Many Requests

**Test 7: Mark as Read**
```bash
curl -X PUT http://localhost:8000/api/messages/1/read \
  -H "Authorization: Bearer $PARENT_TOKEN"
```
Expected: 200 OK with `{success: true}`

**Test 8: Unread Count**
```bash
curl http://localhost:8000/api/trips/1/messages/unread \
  -H "Authorization: Bearer $PARENT_TOKEN"
```
Expected: 200 OK with `{unread_count: 3}`

---

## Files Modified/Created

### Task 13 Files
**Backend:**
- `backend/app/database.py` - Added tracking_mode field
- `backend/app/tracking_mode.py` - NEW: Tracking mode logic
- `backend/app/main.py` - Added tracking mode endpoint
- `backend/pyproject.toml` - Added python-dateutil dependency

**Frontend:**
- `frontend/src/api/trips.ts` - Added tracking mode API
- `frontend/src/components/TripMap.tsx` - Added mode switching UI

### Task 14 Files
**Backend:**
- `backend/app/models.py` - Added message models
- `backend/app/rate_limiter.py` - NEW: Rate limiting module
- `backend/app/main.py` - Added 4 message endpoints

**Frontend:**
- `frontend/src/api/trips.ts` - Added message API functions

---

## Acceptance Criteria Status

### Task 13 ✅
- ✅ Automatic mode detection based on GPS staleness
- ✅ Flight tracking integration when GPS stale
- ✅ Visual indicators for each mode (icons, colors, descriptions)
- ✅ Smooth transitions between modes
- ✅ Edge case handling (intermittent GPS, flight delays, post-landing)
- ✅ WebSocket event for mode changes
- ✅ Role-based access control

### Task 14 ✅
- ✅ POST message to trip
- ✅ GET messages with ordering (oldest first)
- ✅ Sender name and role included
- ✅ `is_mine` flag for user's messages
- ✅ Role-based access control
- ✅ Empty message validation (400)
- ✅ Max length validation (5000 chars, 400)
- ✅ Mark message as read
- ✅ Get unread count
- ✅ Query param `since` filters correctly
- ✅ Trip isolation (messages don't leak between trips)
- ✅ XSS protection (html.escape)
- ✅ Rate limiting (20 msgs/min)
- ✅ Plain text only

---

## Known Limitations

### Task 13
1. **API Key Required**: Flight tracking requires AviationStack API key (returns 503 without it)
2. **In-Memory State**: Tracking mode stored in database but not cached
3. **Manual Polling**: Frontend fetches mode on mount, doesn't listen for WebSocket events yet

### Task 14
1. **In-Memory Rate Limiter**: Rate limits reset on server restart
2. **No Real-Time Updates**: Messages require manual refresh (WebSocket integration is Task 15)
3. **No UI Components**: API only, chat interface is Task 15
4. **Basic Read Status**: Single boolean flag, not per-recipient tracking

---

## Next Steps

### Immediate (Task 15)
- Build chat UI component
- Add WebSocket real-time message delivery
- Add message notifications
- Add typing indicators

### Future Enhancements
- Persistent rate limiting (Redis)
- Message editing/deletion
- File attachments
- Message reactions
- Read receipts per recipient
- Message search/filtering

---

## Deployment Notes

### Environment Variables
No new environment variables required for these tasks. Existing variables:
- `DATABASE_URL` - PostgreSQL connection
- `AVIATIONSTACK_API_KEY` - Optional, for flight tracking

### Database Migrations
Run `init_db()` to add:
- `tracking_mode` column to trips table
- No changes needed for messages table (already exists from Task 2)

### Dependencies
New backend dependencies:
- `python-dateutil==2.9.0.post0` (Task 13)

---

## Summary

Both Task 13 and Task 14 have been successfully implemented with full production-ready code:

**Task 13** provides intelligent automatic switching between GPS and flight tracking modes with clear visual indicators, making it easy for all user roles to understand how a trip is being tracked at any given moment.

**Task 14** provides a complete messaging API with proper security, validation, and rate limiting. The backend is fully functional and ready for the frontend chat UI (Task 15).

All code follows existing patterns, includes proper error handling, implements role-based access control, and is ready for production use.

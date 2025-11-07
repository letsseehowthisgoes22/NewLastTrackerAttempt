# API Requirements Documentation

This document lists all external APIs and services required for the IYT Transport Tracking System.

## Required APIs

### 1. AviationStack API (Flight Tracking)
**Status:** ✅ Implemented  
**Purpose:** Fetch live flight status for air transport tracking

#### Configuration
- **Environment Variable:** `AVIATION_STACK_API_KEY`
- **Location:** `backend/app/flight_tracking.py`
- **Required:** Optional (system works without it, returns 503 if missing)

#### API Details
- **Endpoint:** `http://api.aviationstack.com/v1/flights`
- **Authentication:** Query parameter `access_key`
- **Request Format:**
  ```python
  GET http://api.aviationstack.com/v1/flights?access_key={API_KEY}&flight_iata={FLIGHT_NUMBER}
  ```

#### Response Format
```json
{
  "flight_number": "UA1234",
  "airline": "United Airlines",
  "status": "active",
  "departure_airport": "LAX",
  "departure_gate": "12",
  "departure_time": "2025-11-10T10:00:00Z",
  "arrival_airport": "JFK",
  "arrival_gate": "45",
  "arrival_time": "2025-11-10T18:00:00Z",
  "current_position": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "altitude": 35000,
    "speed": 550
  }
}
```

#### Setup Instructions
1. Sign up at https://aviationstack.com/
2. Get API key from dashboard: https://aviationstack.com/dashboard
3. Add to `backend/.env`:
   ```
   AVIATION_STACK_API_KEY=your_api_key_here
   ```
4. Free tier: 100 requests/month
5. Paid plans start at $49.99/month (500 calls)

#### Alternative APIs
If AviationStack doesn't meet your needs:
- **FlightAware AeroAPI:** https://www.flightaware.com/aeroapi/
- **AirLabs:** https://airlabs.co/ (1,000 requests/month free)

---

### 2. Google Maps JavaScript API (Address Autocomplete)
**Status:** ✅ Implemented  
**Purpose:** Address autocomplete in trip creation/edit forms

#### Configuration
- **Environment Variable:** `VITE_GOOGLE_MAPS_API_KEY`
- **Location:** `frontend/src/components/EditTripForm.tsx`, `frontend/src/components/CreateTripForm.tsx`
- **Required:** Required for address autocomplete functionality

#### API Details
- **Endpoint:** Google Maps JavaScript API (loaded via `@react-google-maps/api`)
- **Authentication:** API key in script tag
- **Libraries Used:** `places` (for Autocomplete component)

#### Setup Instructions
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create a project or select existing
3. Enable "Maps JavaScript API" and "Places API"
4. Create API key in "Credentials"
5. Add to `frontend/.env`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   ```
6. Restrict API key to specific domains in production

#### Pricing
- **Free tier:** $200/month credit
- **Places API:** $17 per 1,000 requests after free tier
- **Maps JavaScript API:** Free for most use cases

---

### 3. OSRM Routing API (Route Visualization)
**Status:** ✅ Implemented  
**Purpose:** Calculate and display route polyline between pickup and dropoff

#### Configuration
- **Environment Variable:** None (uses public demo server)
- **Location:** `frontend/src/components/TripMap.tsx`
- **Required:** Optional (falls back to straight line if unavailable)

#### API Details
- **Endpoint:** `https://router.project-osrm.org/route/v1/driving/{coords}`
- **Authentication:** None (public demo server)
- **Request Format:**
  ```
  GET https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
  ```

#### Response Format
```json
{
  "code": "Ok",
  "routes": [{
    "distance": 123456.7,  // meters
    "duration": 4567.8,    // seconds
    "geometry": {
      "coordinates": [[lng1, lat1], [lng2, lat2], ...]
    }
  }]
}
```

#### Setup Instructions
- **No setup required** - uses public demo server
- **Production:** Consider self-hosting OSRM or using Mapbox Directions API for better reliability

#### Alternative APIs
- **Mapbox Directions API:** Requires API key, more reliable
- **Google Directions API:** Requires API key, more features
- **GraphHopper:** Self-hostable routing engine

---

### 4. WebSocket Server (Built-In)
**Status:** ✅ Implemented  
**Purpose:** Real-time location updates, chat messages, status changes

#### Configuration
- **Environment Variable:** None (uses Socket.IO built into backend)
- **Location:** `backend/app/websocket.py`, `backend/app/main.py`
- **Required:** Required for real-time features

#### Setup Instructions
- **No external service required** - uses python-socketio
- **Important:** Backend must be run with `socket_app` (not `app`):
  ```bash
  poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
  ```
- **Frontend Connection:** Uses `socket.io-client` to connect to backend

#### WebSocket Events
- `subscribe_trip` - Subscribe to trip updates
- `unsubscribe_trip` - Unsubscribe from trip updates
- `location_update` - Receive location updates
- `new_message` - Receive chat messages
- `status_changed` - Receive status change notifications
- `chat_takeover` - Admin chat takeover notifications

---

## Optional/Placeholder APIs

### GPS Hardware Tracker API (Future)
**Status:** ⏳ Placeholder  
**Purpose:** Integration with GPS tracking hardware devices

#### Notes
- Currently uses browser geolocation API for testing
- Future integration point for hardware GPS trackers
- API format will depend on chosen hardware provider

---

## Environment Variables Summary

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/iyt_transport

# JWT Secret
JWT_SECRET=your_jwt_secret_here

# AviationStack (Optional)
AVIATION_STACK_API_KEY=your_aviationstack_api_key_here
```

### Frontend (.env)
```bash
# API URL
VITE_API_URL=http://localhost:8000

# WebSocket URL (optional, defaults to VITE_API_URL)
VITE_WS_URL=http://localhost:8000

# Google Maps API Key (Required for address autocomplete)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

---

## API Integration Points

### Backend Endpoints Using External APIs

1. **GET /api/trips/{trip_id}/flight**
   - Uses: AviationStack API
   - Returns: Flight status and position
   - Error Handling: Returns 503 if API key missing

### Frontend Components Using External APIs

1. **EditTripForm.tsx / CreateTripForm.tsx**
   - Uses: Google Maps Places API (Autocomplete)
   - Purpose: Address autocomplete

2. **TripMap.tsx**
   - Uses: OSRM Routing API
   - Purpose: Route visualization between pickup/dropoff
   - Uses: WebSocket (built-in)
   - Purpose: Real-time location updates

---

## Testing APIs

### Test AviationStack API
```bash
curl "http://api.aviationstack.com/v1/flights?access_key=YOUR_KEY&flight_iata=UA1234"
```

### Test OSRM Routing
```bash
curl "https://router.project-osrm.org/route/v1/driving/-122.4194,37.7749;-74.0060,40.7128?overview=full&geometries=geojson"
```

### Test WebSocket
```javascript
// In browser console
const socket = io('http://localhost:8000');
socket.on('connect', () => console.log('Connected'));
socket.emit('subscribe_trip', { trip_id: 1, token: 'your_token' });
```

---

## Error Handling

### AviationStack API
- **Missing API Key:** Returns `None`, backend logs warning, frontend shows "Flight information temporarily unavailable"
- **Invalid Flight:** Returns 503 with message
- **API Timeout:** Returns 503 after 10 seconds

### OSRM Routing
- **API Failure:** Falls back to straight-line distance calculation
- **Invalid Coordinates:** Returns empty route polyline

### Google Maps API
- **Missing API Key:** Autocomplete component shows loading state indefinitely
- **Invalid Key:** Shows error in browser console, form still works with manual input

---

## Cost Estimates

### Free Tier Usage
- **AviationStack:** 100 requests/month (sufficient for testing)
- **Google Maps:** $200/month credit (sufficient for most use cases)
- **OSRM:** Free (public demo server)

### Production Costs (estimated)
- **AviationStack:** $49.99/month (500 calls) - $0.10 per call after
- **Google Maps:** $0-50/month (depending on usage)
- **OSRM:** Free if self-hosted, or $0-100/month for hosted service

---

## Security Considerations

1. **API Keys:**
   - Never commit API keys to git
   - Use environment variables
   - Restrict API keys to specific domains/IPs in production

2. **Rate Limiting:**
   - AviationStack: Respects API rate limits
   - Google Maps: Built-in rate limiting
   - OSRM: Public server has usage limits (consider self-hosting)

3. **WebSocket:**
   - Authentication required via JWT token
   - Room-based access control (users can only subscribe to authorized trips)

---

## Troubleshooting

### AviationStack API Not Working
1. Check API key is set in `backend/.env`
2. Verify API key is valid in AviationStack dashboard
3. Check API usage hasn't exceeded free tier
4. Test API key directly: `curl "http://api.aviationstack.com/v1/flights?access_key=YOUR_KEY&flight_iata=UA1234"`

### Google Maps Autocomplete Not Working
1. Check `VITE_GOOGLE_MAPS_API_KEY` is set in `frontend/.env`
2. Verify API key has "Places API" enabled
3. Check browser console for errors
4. Verify API key restrictions allow your domain

### WebSocket Not Connecting
1. Verify backend is running with `socket_app` (not `app`)
2. Check `VITE_WS_URL` or `VITE_API_URL` in frontend `.env`
3. Verify CORS is enabled in backend
4. Check browser console for connection errors

### Route Not Displaying
1. Check browser console for OSRM API errors
2. Verify coordinates are valid (lat: -90 to 90, lng: -180 to 180)
3. System will fall back to straight line if OSRM fails


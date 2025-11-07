# External Services & API Setup Guide

This document provides comprehensive instructions for obtaining and configuring all external services and APIs required for the IYT Transport Tracker application to function at 100% capacity.

## Overview

The IYT Transport Tracker requires the following external services for full functionality:

1. **PostgreSQL Database** - Core data storage
2. **Google Maps API** - Address autocomplete and geocoding
3. **React Leaflet / OpenStreetMap** - Real-time map display and GPS tracking
4. **AviationStack API** - Flight tracking for air transport
5. **WebSocket Server** - Real-time communication (built-in, no external service)
6. **SendGrid API** (Task 19 - Not yet implemented) - Email notifications
7. **Twilio API** (Task 19 - Not yet implemented) - SMS notifications

---

## 1. PostgreSQL Database

### Purpose
Core database for storing users, trips, locations, messages, documents, and all application data.

### Setup Instructions

**Option A: Local PostgreSQL Installation**

1. Install PostgreSQL:
   ```bash
   # macOS
   brew install postgresql@15
   brew services start postgresql@15
   
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   
   # Windows
   # Download installer from https://www.postgresql.org/download/windows/
   ```

2. Create database:
   ```bash
   createdb iyt_transport
   ```

3. Configure connection:
   ```bash
   # backend/.env
   DATABASE_URL=postgresql://username:password@localhost:5432/iyt_transport
   ```

**Option B: Hosted PostgreSQL (Recommended for Production)**

Popular providers:
- **Heroku Postgres** (https://www.heroku.com/postgres)
- **AWS RDS** (https://aws.amazon.com/rds/postgresql/)
- **Google Cloud SQL** (https://cloud.google.com/sql/docs/postgres)
- **DigitalOcean Managed Databases** (https://www.digitalocean.com/products/managed-databases-postgresql)
- **Supabase** (https://supabase.com/) - Free tier available

### Environment Variables
```bash
# backend/.env
DATABASE_URL=postgresql://username:password@host:port/database_name
```

### Database Initialization
After configuring DATABASE_URL, initialize the database schema:
```bash
cd backend
poetry run python -c "from app.database import init_db; init_db()"
```

This creates all required tables:
- `users` - User accounts and authentication
- `trips` - Transport trip records
- `locations` - GPS tracking data
- `messages` - Chat messages
- `documents` - Document metadata
- `document_access_log` - Audit trail for document access
- `trip_status_history` - Status change tracking (Task 18)
- `notification_preferences` - User notification settings (Task 19)
- `notification_log` - Notification delivery tracking (Task 19)

---

## 2. Google Maps API

### Purpose
Provides address autocomplete functionality in trip creation and editing forms, allowing users to search for pickup and dropoff locations with intelligent suggestions.

### Where It's Used
- **Frontend Components:**
  - `frontend/src/components/CreateTripForm.tsx` - Trip creation form
  - `frontend/src/components/EditTripForm.tsx` - Trip editing form
- **Features:**
  - Address autocomplete with Google Places suggestions
  - Geocoding (converting addresses to coordinates)

### Setup Instructions

1. **Create Google Cloud Project:**
   - Go to https://console.cloud.google.com/
   - Click "Select a project" → "New Project"
   - Enter project name (e.g., "IYT Transport Tracker")
   - Click "Create"

2. **Enable Required APIs:**
   - In Google Cloud Console, go to "APIs & Services" → "Library"
   - Search for and enable:
     - **Maps JavaScript API**
     - **Places API**
     - **Geocoding API**

3. **Create API Key:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the generated API key
   - **Important:** Click "Restrict Key" to secure it:
     - Under "Application restrictions":
       - For development: Select "HTTP referrers" and add `http://localhost:5173/*`
       - For production: Add your production domain (e.g., `https://yourdomain.com/*`)
     - Under "API restrictions":
       - Select "Restrict key"
       - Check: Maps JavaScript API, Places API, Geocoding API
     - Click "Save"

4. **Configure Environment Variable:**
   ```bash
   # frontend/.env
   VITE_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

### Pricing
- **Free Tier:** $200 monthly credit (covers ~28,000 autocomplete requests)
- **Pricing:** https://cloud.google.com/maps-platform/pricing
- **Cost Optimization:**
  - Enable billing alerts in Google Cloud Console
  - Use autocomplete session tokens (already implemented)
  - Restrict API key to prevent unauthorized use

### Testing
After configuration, test by:
1. Starting the frontend: `cd frontend && npm run dev`
2. Navigate to trip creation form
3. Start typing an address in pickup/dropoff fields
4. Verify Google Places suggestions appear

---

## 3. React Leaflet / OpenStreetMap

### Purpose
Displays real-time maps with GPS tracking markers, route visualization, and live location updates via WebSocket.

### Where It's Used
- **Frontend Components:**
  - `frontend/src/components/TripMap.tsx` - Main map component
  - `frontend/src/components/TripDetail.tsx` - Trip detail view with embedded map
- **Features:**
  - Real-time GPS location display
  - Color-coded markers (green=pickup, red=dropoff, blue=current, violet=waypoints)
  - Automatic map centering and bounds adjustment
  - WebSocket-based live location streaming
  - Flight path visualization for air transport

### Setup Instructions

**No API Key Required!** React Leaflet uses OpenStreetMap tiles which are free and open-source.

1. **Dependencies (Already Installed):**
   ```json
   {
     "react-leaflet": "^4.2.1",
     "leaflet": "^1.9.4"
   }
   ```

2. **Tile Provider:**
   - Default: OpenStreetMap (https://www.openstreetmap.org/)
   - Tile URL: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
   - Attribution: "© OpenStreetMap contributors"

3. **Optional: Custom Tile Providers**
   
   If you want different map styles, you can use alternative providers:
   
   **Mapbox (Requires API Key):**
   ```typescript
   // In TripMap.tsx, replace TileLayer url with:
   url="https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}"
   accessToken="pk.eyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
   id="mapbox/streets-v11"
   ```
   - Sign up: https://www.mapbox.com/
   - Free tier: 50,000 map loads/month
   
   **Thunderforest (Requires API Key):**
   ```typescript
   url="https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apikey}"
   apikey="your-thunderforest-api-key"
   ```
   - Sign up: https://www.thunderforest.com/
   - Free tier: 150,000 requests/month

### Pricing
- **OpenStreetMap:** Free (current implementation)
- **Mapbox:** Free tier available, then $0.50 per 1,000 loads
- **Thunderforest:** Free tier available, then paid plans

### Usage Policy
OpenStreetMap requires:
- Attribution: "© OpenStreetMap contributors" (already implemented)
- Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- Fair use: Don't exceed 250,000 tile requests per day without permission

### Testing
After starting the app:
1. Create or view a trip with location data
2. Verify map loads with markers
3. Test real-time location updates (requires GPS data streaming)

---

## 4. AviationStack API

### Purpose
Provides real-time flight tracking data for air transport trips, including flight status, departure/arrival times, and aircraft position.

### Where It's Used
- **Backend Module:**
  - `backend/app/flight_tracking.py` - Flight data fetching and processing
  - `backend/app/main.py` - Flight status endpoint (`GET /api/trips/{id}/flight-status`)
- **Features:**
  - Real-time flight status (scheduled, active, landed, cancelled, diverted)
  - Departure and arrival airport information
  - Flight number validation
  - Automatic tracking mode switching (GPS ↔ Flight)

### Setup Instructions

1. **Sign Up for AviationStack:**
   - Go to https://aviationstack.com/
   - Click "Get Free API Key"
   - Create account (email + password)
   - Verify email address

2. **Get API Key:**
   - Log in to dashboard: https://aviationstack.com/dashboard
   - Copy your API Access Key from the dashboard

3. **Configure Environment Variable:**
   ```bash
   # backend/.env
   AVIATION_STACK_API_KEY=your_aviationstack_api_key_here
   ```

4. **Verify Configuration:**
   ```bash
   cd backend
   poetry run python -c "from app.flight_tracking import get_flight_status; print(get_flight_status('AA100'))"
   ```

### Pricing
- **Free Tier:**
  - 100 API calls per month
  - Historical flight data (1 month)
  - Real-time flight status
  - Basic support
- **Paid Plans:**
  - Basic: $49.99/month (500 calls)
  - Professional: $149.99/month (10,000 calls)
  - Business: Custom pricing
- **Pricing Page:** https://aviationstack.com/product

### API Limitations (Free Tier)
- 100 requests/month (approximately 3 flights per day)
- Rate limit: 1 request per second
- No HTTPS support (HTTP only)
- 1 month historical data

### Alternative Flight Tracking APIs

If AviationStack doesn't meet your needs, consider:

**FlightAware AeroAPI:**
- Website: https://www.flightaware.com/commercial/aeroapi/
- Free tier: 1,000 queries/month
- More comprehensive data
- HTTPS support
- Better rate limits

**Aviation Edge:**
- Website: https://aviation-edge.com/
- Free tier: 1,000 calls/month
- Real-time flight tracking
- Airport and airline data

**AirLabs:**
- Website: https://airlabs.co/
- Free tier: 1,000 requests/month
- Real-time flight data
- Simple API

### Code Modification for Alternative APIs

To switch to a different flight API, modify `backend/app/flight_tracking.py`:

```python
# Example for FlightAware AeroAPI
import requests
import os

FLIGHTAWARE_API_KEY = os.getenv('FLIGHTAWARE_API_KEY')

def get_flight_status(flight_number: str):
    url = f"https://aeroapi.flightaware.com/aeroapi/flights/{flight_number}"
    headers = {"x-apikey": FLIGHTAWARE_API_KEY}
    response = requests.get(url, headers=headers)
    # Process response and return standardized format
    ...
```

### Testing
After configuration:
1. Start backend: `cd backend && poetry run uvicorn app.main:app --reload`
2. Test endpoint: `curl http://localhost:8000/api/trips/1/flight-status`
3. Verify flight data is returned

---

## 5. WebSocket Server (Built-In)

### Purpose
Enables real-time bidirectional communication for live GPS tracking, chat messages, status updates, and admin takeover notifications.

### Where It's Used
- **Backend Module:**
  - `backend/app/websocket.py` - Socket.IO server implementation
  - `backend/app/main.py` - WebSocket integration with FastAPI
- **Frontend Components:**
  - `frontend/src/components/TripMap.tsx` - Real-time location updates
  - `frontend/src/components/TripChat.tsx` - Real-time chat messages
- **Features:**
  - Real-time GPS location streaming
  - Live chat messaging
  - Trip status change notifications
  - Admin chat takeover events
  - Room-based message routing

### Setup Instructions

**No External Service Required!** WebSocket server is built into the application using Socket.IO.

1. **Backend Dependencies (Already Installed):**
   ```toml
   python-socketio = "^5.11.0"
   ```

2. **Frontend Dependencies (Already Installed):**
   ```json
   {
     "socket.io-client": "^4.8.1"
   }
   ```

3. **Configuration:**
   ```bash
   # frontend/.env
   VITE_WS_URL=http://localhost:8000  # Development
   # VITE_WS_URL=https://your-backend-domain.com  # Production
   ```

4. **CORS Configuration:**
   The backend is already configured to allow WebSocket connections:
   ```python
   # backend/app/websocket.py
   sio = socketio.AsyncServer(
       async_mode='asgi',
       cors_allowed_origins='*'  # Restrict in production
   )
   ```

### Production Deployment Considerations

**WebSocket Support Required:**
- Ensure your hosting provider supports WebSocket connections
- Common providers with WebSocket support:
  - **Heroku:** Supported on all dynos
  - **AWS Elastic Beanstalk:** Supported with ALB
  - **Google Cloud Run:** Supported
  - **DigitalOcean App Platform:** Supported
  - **Railway:** Supported
  - **Render:** Supported

**HTTPS/WSS Required in Production:**
- WebSocket connections over HTTPS use WSS protocol
- Ensure SSL/TLS certificate is configured
- Update VITE_WS_URL to use `wss://` instead of `ws://`

**Load Balancing:**
- If using multiple backend instances, configure sticky sessions
- Or use Redis adapter for Socket.IO:
  ```python
  # backend/app/websocket.py
  import socketio
  
  mgr = socketio.AsyncRedisManager('redis://localhost:6379')
  sio = socketio.AsyncServer(
      async_mode='asgi',
      client_manager=mgr,
      cors_allowed_origins='*'
  )
  ```

### Testing
1. Start backend: `cd backend && poetry run uvicorn app.main:socket_app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser console and verify WebSocket connection:
   ```
   Socket.IO connected: true
   ```
4. Test real-time features:
   - Send chat message → verify instant delivery
   - Update GPS location → verify map updates
   - Change trip status → verify notification appears

---

## 6. SendGrid API (Task 19 - Infrastructure Only)

### Purpose
Sends email notifications for trip events (started, completed, status changes, new messages).

### Current Status
**Infrastructure Ready, Service Not Integrated**
- Database tables created: `notification_preferences`, `notification_log`
- API endpoints implemented: `GET/PUT /api/users/me/notification-preferences`
- Email sending logic: **Not yet implemented**

### Setup Instructions (For Future Implementation)

1. **Sign Up for SendGrid:**
   - Go to https://sendgrid.com/
   - Click "Start for Free"
   - Create account and verify email

2. **Create API Key:**
   - Log in to SendGrid dashboard
   - Go to Settings → API Keys
   - Click "Create API Key"
   - Name: "IYT Transport Tracker"
   - Permissions: "Full Access" or "Mail Send" only
   - Copy the generated API key (shown only once!)

3. **Verify Sender Identity:**
   - Go to Settings → Sender Authentication
   - Choose "Single Sender Verification" (free) or "Domain Authentication" (recommended)
   - For Single Sender: Verify your email address
   - For Domain: Add DNS records to your domain

4. **Configure Environment Variables:**
   ```bash
   # backend/.env
   SENDGRID_API_KEY=SG.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   SENDGRID_FROM_NAME=IYT Transport Tracker
   ```

5. **Install SendGrid SDK:**
   ```bash
   cd backend
   poetry add sendgrid
   ```

6. **Implement Email Sending (Example):**
   ```python
   # backend/app/notifications.py (create this file)
   import os
   from sendgrid import SendGridAPIClient
   from sendgrid.helpers.mail import Mail
   
   SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY')
   SENDGRID_FROM_EMAIL = os.getenv('SENDGRID_FROM_EMAIL')
   
   async def send_trip_started_email(user_email: str, trip_id: int):
       message = Mail(
           from_email=SENDGRID_FROM_EMAIL,
           to_emails=user_email,
           subject='Your trip has started',
           html_content=f'<p>Trip #{trip_id} has started. Track it in real-time.</p>'
       )
       try:
           sg = SendGridAPIClient(SENDGRID_API_KEY)
           response = sg.send(message)
           return response.status_code == 202
       except Exception as e:
           print(f"Email send error: {e}")
           return False
   ```

### Pricing
- **Free Tier:**
  - 100 emails per day
  - Forever free
  - Basic email analytics
- **Paid Plans:**
  - Essentials: $19.95/month (50,000 emails)
  - Pro: $89.95/month (100,000 emails)
- **Pricing Page:** https://sendgrid.com/pricing/

### Alternative Email Services

**AWS SES (Simple Email Service):**
- Website: https://aws.amazon.com/ses/
- Free tier: 62,000 emails/month (if sending from EC2)
- Very low cost: $0.10 per 1,000 emails
- Requires AWS account

**Mailgun:**
- Website: https://www.mailgun.com/
- Free tier: 5,000 emails/month for 3 months
- Pay-as-you-go: $0.80 per 1,000 emails

**Postmark:**
- Website: https://postmarkapp.com/
- Free tier: 100 emails/month
- Focus on transactional emails
- Excellent deliverability

---

## 7. Twilio API (Task 19 - Infrastructure Only)

### Purpose
Sends SMS notifications for critical trip events (started, completed, status changes).

### Current Status
**Infrastructure Ready, Service Not Integrated**
- Database tables created: `notification_preferences`, `notification_log`
- API endpoints implemented: `GET/PUT /api/users/me/notification-preferences`
- SMS sending logic: **Not yet implemented**

### Setup Instructions (For Future Implementation)

1. **Sign Up for Twilio:**
   - Go to https://www.twilio.com/
   - Click "Sign up"
   - Create account and verify phone number

2. **Get Credentials:**
   - Log in to Twilio Console: https://console.twilio.com/
   - Find your Account SID and Auth Token on the dashboard
   - Copy both values

3. **Get Phone Number:**
   - In Twilio Console, go to Phone Numbers → Manage → Buy a number
   - Choose a number with SMS capabilities
   - Purchase number (free trial includes $15 credit)
   - Copy the phone number (format: +1234567890)

4. **Configure Environment Variables:**
   ```bash
   # backend/.env
   TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_PHONE_NUMBER=+1234567890
   ```

5. **Install Twilio SDK:**
   ```bash
   cd backend
   poetry add twilio
   ```

6. **Implement SMS Sending (Example):**
   ```python
   # backend/app/notifications.py (add to existing file)
   import os
   from twilio.rest import Client
   
   TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
   TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
   TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER')
   
   async def send_trip_started_sms(user_phone: str, trip_id: int):
       try:
           client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
           message = client.messages.create(
               body=f'Your trip #{trip_id} has started. Track it in real-time.',
               from_=TWILIO_PHONE_NUMBER,
               to=user_phone
           )
           return message.sid is not None
       except Exception as e:
           print(f"SMS send error: {e}")
           return False
   ```

### Pricing
- **Free Trial:**
  - $15 credit
  - Can send ~500 SMS messages
  - Trial numbers have "Sent from a Twilio trial account" prefix
- **Pay-As-You-Go:**
  - US/Canada: $0.0079 per SMS sent
  - Phone number rental: $1.15/month
- **Pricing Page:** https://www.twilio.com/sms/pricing

### Alternative SMS Services

**AWS SNS (Simple Notification Service):**
- Website: https://aws.amazon.com/sns/
- Pricing: $0.00645 per SMS (US)
- No monthly fees
- Requires AWS account

**Vonage (formerly Nexmo):**
- Website: https://www.vonage.com/communications-apis/sms/
- Free trial: €2 credit
- Pricing: $0.0072 per SMS (US)

**Plivo:**
- Website: https://www.plivo.com/
- Free trial: $10 credit
- Pricing: $0.0065 per SMS (US)

---

## Environment Variables Summary

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database_name

# Authentication
JWT_SECRET=your-secret-key-change-in-production-use-256-bit-random-string
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Flight Tracking
AVIATION_STACK_API_KEY=your_aviationstack_api_key_here

# Email Notifications (Task 19 - Not yet implemented)
SENDGRID_API_KEY=SG.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=IYT Transport Tracker

# SMS Notifications (Task 19 - Not yet implemented)
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Frontend (.env)
```bash
# Backend API
VITE_API_URL=http://localhost:8000  # Development
# VITE_API_URL=https://your-backend-domain.com  # Production

# WebSocket
VITE_WS_URL=http://localhost:8000  # Development
# VITE_WS_URL=https://your-backend-domain.com  # Production

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## Quick Start Checklist

### Minimum Required for Basic Functionality
- [ ] PostgreSQL database configured
- [ ] JWT_SECRET set to secure random string
- [ ] Frontend VITE_API_URL pointing to backend
- [ ] Frontend VITE_WS_URL pointing to backend

### Required for Full Trip Management
- [ ] Google Maps API key configured
- [ ] Google Maps API enabled (Maps JavaScript, Places, Geocoding)

### Required for Flight Tracking
- [ ] AviationStack API key configured
- [ ] Flight tracking tested with sample flight number

### Required for Real-Time Features
- [ ] WebSocket server running (built-in, no setup needed)
- [ ] CORS configured for WebSocket connections

### Optional (Task 19 - Not Yet Implemented)
- [ ] SendGrid API key configured (for email notifications)
- [ ] Twilio credentials configured (for SMS notifications)

---

## Cost Estimation

### Free Tier (Development/Small Scale)
- **PostgreSQL:** Free (local) or $0-7/month (hosted free tiers)
- **Google Maps:** $200/month credit (free for ~28,000 autocomplete requests)
- **React Leaflet/OSM:** Free (unlimited)
- **AviationStack:** Free (100 requests/month)
- **WebSocket:** Free (built-in)
- **SendGrid:** Free (100 emails/day)
- **Twilio:** $15 trial credit, then ~$1.15/month + $0.0079/SMS

**Total Monthly Cost (Free Tier):** $0-15/month

### Production Scale (1,000 users, 500 trips/month)
- **PostgreSQL:** $15-50/month (managed hosting)
- **Google Maps:** $0-50/month (within free tier for moderate usage)
- **React Leaflet/OSM:** Free
- **AviationStack:** $49.99/month (Basic plan, 500 calls)
- **WebSocket:** Included in backend hosting
- **SendGrid:** $19.95/month (50,000 emails)
- **Twilio:** $1.15/month + ~$40/month (5,000 SMS)

**Total Monthly Cost (Production):** $125-210/month

---

## Security Best Practices

1. **Never Commit API Keys:**
   - Add `.env` to `.gitignore` (already done)
   - Use `.env.example` for documentation only
   - Rotate keys if accidentally committed

2. **Restrict API Keys:**
   - Google Maps: Restrict to specific domains/IPs
   - AviationStack: Monitor usage in dashboard
   - SendGrid: Use "Mail Send" permission only
   - Twilio: Enable geo-permissions to prevent fraud

3. **Use Environment Variables:**
   - Never hardcode API keys in source code
   - Use different keys for development and production
   - Store production keys in secure secret management (AWS Secrets Manager, HashiCorp Vault, etc.)

4. **Monitor Usage:**
   - Set up billing alerts in Google Cloud Console
   - Monitor AviationStack usage in dashboard
   - Track SendGrid/Twilio usage to prevent overages

5. **HTTPS in Production:**
   - Use HTTPS for all API requests
   - Use WSS for WebSocket connections
   - Configure SSL/TLS certificates

---

## Troubleshooting

### Google Maps Not Loading
- **Check API key:** Verify VITE_GOOGLE_MAPS_API_KEY is set correctly
- **Check API restrictions:** Ensure domain is whitelisted in Google Cloud Console
- **Check browser console:** Look for API key errors or CORS issues
- **Verify APIs enabled:** Maps JavaScript API, Places API, Geocoding API must all be enabled

### Flight Tracking Not Working
- **Check API key:** Verify AVIATION_STACK_API_KEY is set correctly
- **Check rate limits:** Free tier limited to 100 requests/month
- **Check flight number format:** Must be valid IATA format (e.g., "AA100", "UA456")
- **Check API status:** Visit https://aviationstack.com/documentation for API status

### WebSocket Connection Failed
- **Check VITE_WS_URL:** Must match backend URL
- **Check CORS:** Backend must allow frontend origin
- **Check firewall:** Ensure WebSocket port is open
- **Check hosting:** Verify hosting provider supports WebSocket connections

### Map Tiles Not Loading
- **Check internet connection:** OpenStreetMap requires internet access
- **Check tile server status:** Visit https://status.openstreetmap.org/
- **Check rate limits:** Don't exceed 250,000 tile requests/day
- **Try alternative tile provider:** Switch to Mapbox or Thunderforest if OSM is down

### Email/SMS Not Sending (Task 19)
- **Not yet implemented:** Email/SMS sending logic needs to be added
- **Check credentials:** Verify SendGrid/Twilio API keys are correct
- **Check sender verification:** SendGrid requires verified sender identity
- **Check phone number format:** Twilio requires E.164 format (+1234567890)

---

## Support Resources

### PostgreSQL
- Documentation: https://www.postgresql.org/docs/
- Community: https://www.postgresql.org/community/

### Google Maps
- Documentation: https://developers.google.com/maps/documentation
- Support: https://developers.google.com/maps/support
- Pricing Calculator: https://mapsplatformtransition.withgoogle.com/

### React Leaflet
- Documentation: https://react-leaflet.js.org/
- GitHub: https://github.com/PaulLeCam/react-leaflet
- OpenStreetMap: https://www.openstreetmap.org/

### AviationStack
- Documentation: https://aviationstack.com/documentation
- Support: support@aviationstack.com
- Dashboard: https://aviationstack.com/dashboard

### SendGrid
- Documentation: https://docs.sendgrid.com/
- Support: https://support.sendgrid.com/
- Status: https://status.sendgrid.com/

### Twilio
- Documentation: https://www.twilio.com/docs
- Support: https://support.twilio.com/
- Console: https://console.twilio.com/

---

## Next Steps

1. **Set up PostgreSQL database** (required immediately)
2. **Configure Google Maps API** (required for trip creation)
3. **Test basic functionality** (authentication, trip CRUD, maps)
4. **Configure AviationStack API** (optional, for flight tracking)
5. **Deploy to production** (configure production environment variables)
6. **Implement Task 19 notification sending** (SendGrid/Twilio integration)
7. **Monitor usage and costs** (set up billing alerts)

---

## Questions or Issues?

If you encounter any issues setting up external services:

1. Check the troubleshooting section above
2. Review the service's documentation and status page
3. Verify environment variables are set correctly
4. Check browser console and backend logs for error messages
5. Ensure all required APIs are enabled in service dashboards

For application-specific issues, refer to:
- `docs/handover/2025-11-07-handover-tasks-15-17.md` - Task implementation details
- `README.md` - General application setup
- Backend logs: Check terminal running `uvicorn` for errors
- Frontend logs: Check browser console (F12) for errors

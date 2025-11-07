import socketio
from app.auth import verify_token
from app.database import get_db_connection

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Store connected clients by trip_id
connected_clients = {}  # { trip_id: [sid1, sid2, ...] }

def has_trip_access(user: dict, trip: dict) -> bool:
    """Check if user has access to this trip"""
    if user["role"] == "admin":
        return True
    
    user_id = user["id"]
    return (
        trip["assigned_agent_id"] == user_id or
        trip["assigned_parent_id"] == user_id or
        trip["assigned_clinician_id"] == user_id
    )

@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    print(f'Client connected: {sid}')
    await sio.emit('connected', {'message': 'Connected to server'}, to=sid)

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    print(f'Client disconnected: {sid}')
    # Remove from all rooms
    for trip_id, clients in list(connected_clients.items()):
        if sid in clients:
            clients.remove(sid)
            if len(clients) == 0:
                del connected_clients[trip_id]

@sio.event
async def subscribe_trip(sid, data):
    """Client subscribes to updates for a specific trip"""
    try:
        trip_id = data.get('trip_id')
        token = data.get('token')
        
        if not trip_id or not token:
            await sio.emit('error', {'message': 'Missing trip_id or token'}, to=sid)
            return
        
        # Verify token
        try:
            payload = verify_token(token)
            user_id = payload.get("user_id")
            user_role = payload.get("role")
            
            if not user_id:
                await sio.emit('error', {'message': 'Invalid token'}, to=sid)
                return
            
            user = {"id": user_id, "role": user_role}
        except Exception as e:
            await sio.emit('error', {'message': f'Authentication failed: {str(e)}'}, to=sid)
            return
        
        # Get trip from database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
        trip = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not trip:
            await sio.emit('error', {'message': 'Trip not found'}, to=sid)
            return
        
        # Check access
        if not has_trip_access(user, trip):
            await sio.emit('error', {'message': 'Access denied'}, to=sid)
            return
        
        # Add to room for this trip
        await sio.enter_room(sid, f'trip_{trip_id}')
        
        if trip_id not in connected_clients:
            connected_clients[trip_id] = []
        if sid not in connected_clients[trip_id]:
            connected_clients[trip_id].append(sid)
        
        print(f'Client {sid} subscribed to trip {trip_id}')
        await sio.emit('subscribed', {'trip_id': trip_id}, to=sid)
        
        # Send current location immediately if available
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) as seconds_ago
            FROM location_updates 
            WHERE trip_id = %s 
            ORDER BY timestamp DESC 
            LIMIT 1
        """, (trip_id,))
        latest_location = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if latest_location:
            await sio.emit('location_update', {
                'latitude': float(latest_location['latitude']),
                'longitude': float(latest_location['longitude']),
                'accuracy': float(latest_location['accuracy']) if latest_location['accuracy'] else None,
                'timestamp': latest_location['timestamp'].isoformat(),
                'seconds_ago': int(latest_location['seconds_ago'])
            }, to=sid)
    
    except Exception as e:
        print(f'Error in subscribe_trip: {e}')
        await sio.emit('error', {'message': f'Subscription failed: {str(e)}'}, to=sid)

@sio.event
async def unsubscribe_trip(sid, data):
    """Client unsubscribes from trip updates"""
    try:
        trip_id = data.get('trip_id')
        if not trip_id:
            return
        
        await sio.leave_room(sid, f'trip_{trip_id}')
        
        if trip_id in connected_clients and sid in connected_clients[trip_id]:
            connected_clients[trip_id].remove(sid)
            if len(connected_clients[trip_id]) == 0:
                del connected_clients[trip_id]
        
        print(f'Client {sid} unsubscribed from trip {trip_id}')
        await sio.emit('unsubscribed', {'trip_id': trip_id}, to=sid)
    
    except Exception as e:
        print(f'Error in unsubscribe_trip: {e}')

async def broadcast_location_update(trip_id: int, location_data: dict):
    """Broadcast location update to all subscribers of a trip"""
    try:
        await sio.emit('location_update', {
            'latitude': location_data['latitude'],
            'longitude': location_data['longitude'],
            'accuracy': location_data.get('accuracy'),
            'timestamp': location_data['timestamp']
        }, room=f'trip_{trip_id}')
        print(f'Broadcasted location update for trip {trip_id} to room')
    except Exception as e:
        print(f'Error broadcasting location update: {e}')

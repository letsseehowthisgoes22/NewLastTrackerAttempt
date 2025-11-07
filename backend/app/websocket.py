import socketio
import asyncio
from datetime import datetime
from app.auth import verify_token
from app.database import get_db_connection
from app.rate_limiter import rate_limiter
import html

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Store connected clients by trip_id
connected_clients = {}  # { trip_id: [sid1, sid2, ...] }

typing_users = {}  # { trip_id: { user_id: {'name': str, 'timestamp': datetime} } }

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

@sio.event
async def send_message(sid, data):
    """Receive new message via WebSocket and broadcast to all subscribers"""
    try:
        trip_id = data.get('trip_id')
        message_text = data.get('message')
        token = data.get('token')
        
        if not trip_id or not message_text or not token:
            await sio.emit('error', {'message': 'Missing required fields'}, to=sid)
            return
        
        # Verify token
        try:
            payload = verify_token(token)
            user_id = payload.get("user_id")
            user_role = payload.get("role")
            
            if not user_id:
                await sio.emit('error', {'message': 'Invalid token'}, to=sid)
                return
        except Exception as e:
            await sio.emit('error', {'message': f'Authentication failed: {str(e)}'}, to=sid)
            return
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, role, first_name, last_name FROM users WHERE id = %s",
            (user_id,)
        )
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            conn.close()
            await sio.emit('error', {'message': 'User not found'}, to=sid)
            return
        
        # Get trip and check access
        cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
        trip = cursor.fetchone()
        
        if not trip:
            cursor.close()
            conn.close()
            await sio.emit('error', {'message': 'Trip not found'}, to=sid)
            return
        
        if not has_trip_access(user, trip):
            cursor.close()
            conn.close()
            await sio.emit('error', {'message': 'Access denied'}, to=sid)
            return
        
        client_ip = f"ws_{user_id}"
        if not rate_limiter.check_rate_limit(client_ip):
            cursor.close()
            conn.close()
            await sio.emit('error', {'message': 'Rate limit exceeded'}, to=sid)
            return
        
        message_text = html.escape(message_text.strip())
        
        if len(message_text) > 5000:
            cursor.close()
            conn.close()
            await sio.emit('error', {'message': 'Message too long (max 5000 characters)'}, to=sid)
            return
        
        sent_at = datetime.now()
        cursor.execute("""
            INSERT INTO messages (trip_id, sender_id, message_text, sent_at, read_by_recipient)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (trip_id, user_id, message_text, sent_at, False))
        message_id = cursor.fetchone()['id']
        conn.commit()
        cursor.close()
        conn.close()
        
        # Broadcast to all users subscribed to this trip
        user_name = f"{user['first_name']} {user['last_name']}" if user['first_name'] and user['last_name'] else user['email']
        await sio.emit('new_message', {
            'id': message_id,
            'trip_id': trip_id,
            'sender': {
                'id': user['id'],
                'name': user_name,
                'role': user['role']
            },
            'message': message_text,
            'sent_at': sent_at.isoformat(),
            'read': False,
            'is_mine': False  # Will be set to True on client side for sender
        }, room=f'trip_{trip_id}')
        
        if trip_id in typing_users and user_id in typing_users[trip_id]:
            del typing_users[trip_id][user_id]
            await broadcast_typing_status(trip_id)
        
        print(f'Message sent in trip {trip_id} by user {user_id}')
    
    except Exception as e:
        print(f'Error in send_message: {e}')
        await sio.emit('error', {'message': f'Failed to send message: {str(e)}'}, to=sid)

@sio.event
async def user_typing(sid, data):
    """User started typing - broadcast to others"""
    try:
        trip_id = data.get('trip_id')
        token = data.get('token')
        
        if not trip_id or not token:
            return
        
        # Verify token
        try:
            payload = verify_token(token)
            user_id = payload.get("user_id")
            
            if not user_id:
                return
        except Exception:
            return
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT first_name, last_name, email FROM users WHERE id = %s",
            (user_id,)
        )
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not user:
            return
        
        if trip_id not in typing_users:
            typing_users[trip_id] = {}
        
        user_name = f"{user['first_name']} {user['last_name']}" if user['first_name'] and user['last_name'] else user['email']
        typing_users[trip_id][user_id] = {
            'name': user_name,
            'timestamp': datetime.now()
        }
        
        await broadcast_typing_status(trip_id)
    
    except Exception as e:
        print(f'Error in user_typing: {e}')

@sio.event
async def user_stopped_typing(sid, data):
    """User stopped typing"""
    try:
        trip_id = data.get('trip_id')
        token = data.get('token')
        
        if not trip_id or not token:
            return
        
        # Verify token
        try:
            payload = verify_token(token)
            user_id = payload.get("user_id")
            
            if not user_id:
                return
        except Exception:
            return
        
        if trip_id in typing_users and user_id in typing_users[trip_id]:
            del typing_users[trip_id][user_id]
            await broadcast_typing_status(trip_id)
    
    except Exception as e:
        print(f'Error in user_stopped_typing: {e}')

async def broadcast_typing_status(trip_id):
    """Broadcast who is currently typing"""
    try:
        if trip_id not in typing_users or not typing_users[trip_id]:
            typing_list = []
        else:
            typing_list = [
                {'user_id': user_id, 'name': user_data['name']}
                for user_id, user_data in typing_users[trip_id].items()
            ]
        
        await sio.emit('typing_status', {
            'trip_id': trip_id,
            'typing_users': typing_list
        }, room=f'trip_{trip_id}')
    
    except Exception as e:
        print(f'Error broadcasting typing status: {e}')

@sio.event
async def mark_messages_read(sid, data):
    """Mark all messages in trip as read by this user"""
    try:
        trip_id = data.get('trip_id')
        token = data.get('token')
        
        if not trip_id or not token:
            return
        
        # Verify token
        try:
            payload = verify_token(token)
            user_id = payload.get("user_id")
            
            if not user_id:
                return
        except Exception:
            return
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE messages 
            SET read_by_recipient = TRUE 
            WHERE trip_id = %s AND sender_id != %s AND read_by_recipient = FALSE
        """, (trip_id, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        
        await sio.emit('messages_read', {
            'trip_id': trip_id,
            'reader_id': user_id
        }, room=f'trip_{trip_id}')
    
    except Exception as e:
        print(f'Error in mark_messages_read: {e}')

async def cleanup_stale_typing():
    """Remove typing indicators older than 10 seconds"""
    while True:
        try:
            await asyncio.sleep(5)
            
            now = datetime.now()
            for trip_id in list(typing_users.keys()):
                for user_id in list(typing_users[trip_id].keys()):
                    user_data = typing_users[trip_id][user_id]
                    age = (now - user_data['timestamp']).seconds
                    
                    if age > 10:
                        del typing_users[trip_id][user_id]
                        await broadcast_typing_status(trip_id)
        except Exception as e:
            print(f'Error in cleanup_stale_typing: {e}')

@sio.event
async def connect(sid, environ):
    """Handle client connection and start cleanup task if not running"""
    print(f'Client connected: {sid}')
    await sio.emit('connected', {'message': 'Connected to server'}, to=sid)
    
    if not hasattr(sio, '_cleanup_task_started'):
        sio._cleanup_task_started = True
        asyncio.create_task(cleanup_stale_typing())

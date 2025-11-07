from datetime import datetime
from typing import Optional, Literal
from app.database import get_db_connection
from app.flight_tracking import fetch_flight_status

TrackingMode = Literal['gps', 'flight', 'unknown']

def determine_tracking_mode(trip_id: int) -> TrackingMode:
    """
    Decide whether to use GPS or flight tracking based on:
    - GPS staleness (>5 minutes = stale)
    - Flight status (active, landed, scheduled)
    - Time since landing
    
    Returns: 'gps', 'flight', or 'unknown'
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
    trip = cursor.fetchone()
    
    if not trip:
        cursor.close()
        conn.close()
        return 'unknown'
    
    cursor.execute("""
        SELECT * FROM location_updates 
        WHERE trip_id = %s AND source = 'gps'
        ORDER BY timestamp DESC 
        LIMIT 1
    """, (trip_id,))
    latest_gps = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if latest_gps:
        gps_age_seconds = (datetime.now() - latest_gps['timestamp']).total_seconds()
    else:
        gps_age_seconds = 999999
    
    if gps_age_seconds < 300:
        return 'gps'
    
    if trip['flight_number'] and gps_age_seconds >= 300:
        flight_info = fetch_flight_status(trip['flight_number'])
        
        if flight_info:
            if flight_info['status'] in ['active', 'en-route']:
                return 'flight'
            
            if flight_info['status'] == 'landed':
                if flight_info.get('arrival_time'):
                    try:
                        from dateutil.parser import parse
                        landing_time = parse(flight_info['arrival_time'])
                        minutes_since_landing = (datetime.now() - landing_time).total_seconds() / 60
                        
                        if minutes_since_landing < 30:
                            return 'flight'
                        else:
                            return 'unknown'
                    except Exception:
                        return 'flight'
                else:
                    return 'flight'
    
    return 'unknown'

def update_trip_tracking_mode(trip_id: int) -> Optional[TrackingMode]:
    """
    Update the tracking mode for a trip in the database
    Returns the new mode if changed, None if unchanged
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT tracking_mode FROM trips WHERE id = %s", (trip_id,))
    result = cursor.fetchone()
    
    if not result:
        cursor.close()
        conn.close()
        return None
    
    old_mode = result['tracking_mode']
    new_mode = determine_tracking_mode(trip_id)
    
    if old_mode != new_mode:
        cursor.execute(
            "UPDATE trips SET tracking_mode = %s WHERE id = %s",
            (new_mode, trip_id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return new_mode
    
    cursor.close()
    conn.close()
    return None

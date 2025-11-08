import os
import requests
from typing import Optional, Dict, Any
from datetime import datetime

AVIATION_STACK_API_KEY = os.getenv('AVIATION_STACK_API_KEY')

def fetch_flight_status(flight_number: str) -> Optional[Dict[str, Any]]:
    """
    Fetch current status of a flight from AviationStack API
    
    Args:
        flight_number: IATA flight number (e.g., 'UA1234')
    
    Returns:
        dict with flight info or None if not found/error
    """
    if not AVIATION_STACK_API_KEY:
        print('Warning: AVIATION_STACK_API_KEY not configured')
        return None
    
    if not flight_number:
        return None
    
    normalized_flight = flight_number.replace(" ", "").strip().upper()
    if not normalized_flight:
        return None
    
    url = 'http://api.aviationstack.com/v1/flights'
    params = {
        'access_key': AVIATION_STACK_API_KEY,
        'flight_iata': normalized_flight
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get('error'):
            error_info = data['error']
            print(f'AviationStack API error: {error_info.get("message", "Unknown error")}')
            return None
        
        if data.get('data') and len(data['data']) > 0:
            flight = data['data'][0]
            
            flight_info = {
                'flight_number': flight.get('flight', {}).get('iata', normalized_flight),
                'airline': flight.get('airline', {}).get('name', 'Unknown'),
                'status': flight.get('flight_status', 'unknown'),
                'departure_airport': flight.get('departure', {}).get('airport', 'Unknown'),
                'departure_gate': flight.get('departure', {}).get('gate'),
                'departure_time': flight.get('departure', {}).get('actual') or flight.get('departure', {}).get('scheduled'),
                'arrival_airport': flight.get('arrival', {}).get('airport', 'Unknown'),
                'arrival_gate': flight.get('arrival', {}).get('gate'),
                'arrival_time': flight.get('arrival', {}).get('actual') or flight.get('arrival', {}).get('estimated'),
                'aircraft_lat': flight.get('live', {}).get('latitude') if flight.get('live') else None,
                'aircraft_lng': flight.get('live', {}).get('longitude') if flight.get('live') else None,
                'aircraft_altitude': flight.get('live', {}).get('altitude') if flight.get('live') else None,
                'aircraft_speed': flight.get('live', {}).get('speed_horizontal') if flight.get('live') else None
            }
            
            return flight_info
        else:
            print(f'No flight data found for {flight_number}')
            return None
            
    except requests.exceptions.Timeout:
        print(f'Timeout fetching flight status for {flight_number}')
        return None
    except requests.exceptions.RequestException as e:
        print(f'Failed to fetch flight status for {flight_number}: {e}')
        return None
    except Exception as e:
        print(f'Unexpected error fetching flight status: {e}')
        return None

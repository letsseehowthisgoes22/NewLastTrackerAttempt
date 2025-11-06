import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLatestLocation, getLocationHistory } from '../api/trips';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const vehicleIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface TripMapProps {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupLocation: string;
  dropoffLocation: string;
  tripId?: number;
  isLive?: boolean;
}

function FitBounds({ pickupLat, pickupLng, dropoffLat, dropoffLng }: { 
  pickupLat: number; 
  pickupLng: number; 
  dropoffLat: number; 
  dropoffLng: number; 
}) {
  const map = useMap();
  
  useEffect(() => {
    const bounds = L.latLngBounds(
      [pickupLat, pickupLng],
      [dropoffLat, dropoffLng]
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, pickupLat, pickupLng, dropoffLat, dropoffLng]);
  
  return null;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'polling';

function LiveLocationUpdater({ 
  tripId, 
  isLive,
  onLocationUpdate,
  onConnectionStatusChange 
}: { 
  tripId: number;
  isLive: boolean;
  onLocationUpdate: (location: { lat: number; lng: number } | null, timestamp: string | null) => void;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
}) {
  const { token } = useAuth();
  const map = useMap();
  const socketRef = useRef<Socket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [usePolling, setUsePolling] = useState(false);

  const fetchLocation = async () => {
    try {
      const data = await getLatestLocation(token!, tripId);
      if (data.latitude && data.longitude) {
        const location = { lat: data.latitude, lng: data.longitude };
        onLocationUpdate(location, data.timestamp);
        map.panTo([data.latitude, data.longitude]);
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error('Failed to fetch location:', error);
      }
    }
  };

  const startPolling = () => {
    console.log('Starting polling fallback');
    setUsePolling(true);
    onConnectionStatusChange('polling');
    
    fetchLocation();
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    pollingIntervalRef.current = setInterval(fetchLocation, 10000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!token || !tripId || !isLive) {
      stopPolling();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    onConnectionStatusChange('connecting');

    const socket = io('http://localhost:8000', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      onConnectionStatusChange('connected');
      setUsePolling(false);
      stopPolling();

      socket.emit('subscribe_trip', {
        trip_id: tripId,
        token: token
      });
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to trip:', data.trip_id);
    });

    socket.on('location_update', (data) => {
      console.log('Received location update via WebSocket:', data);
      const location = { lat: data.latitude, lng: data.longitude };
      onLocationUpdate(location, data.timestamp);
      map.panTo([data.latitude, data.longitude]);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (!usePolling) {
        startPolling();
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      onConnectionStatusChange('disconnected');
      if (isLive && !usePolling) {
        startPolling();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      if (!usePolling) {
        startPolling();
      }
    });

    return () => {
      if (socket) {
        socket.emit('unsubscribe_trip', { trip_id: tripId });
        socket.disconnect();
      }
      stopPolling();
    };
  }, [tripId, token, isLive, map]);

  return null;
}

export const TripMap: React.FC<TripMapProps> = ({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupLocation,
  dropoffLocation,
  tripId,
  isLive = false,
}) => {
  const { token } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationHistory, setLocationHistory] = useState<Array<[number, number]>>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const centerLat = (pickupLat + dropoffLat) / 2;
  const centerLng = (pickupLng + dropoffLng) / 2;

  useEffect(() => {
    if (!isLive || !tripId || !token) return;

    const fetchHistory = async () => {
      try {
        const data = await getLocationHistory(token, tripId, 100);
        if (data.locations && data.locations.length > 0) {
          const history = data.locations.reverse().map(loc => [loc.latitude, loc.longitude] as [number, number]);
          setLocationHistory(history);
        }
      } catch (error) {
        console.error('Failed to fetch location history:', error);
      }
    };

    fetchHistory();
  }, [isLive, tripId, token]);

  const handleLocationUpdate = (location: { lat: number; lng: number } | null, timestamp: string | null) => {
    if (location) {
      setCurrentLocation(location);
      setLastUpdate(timestamp ? new Date(timestamp) : new Date());
      
      setLocationHistory(prev => {
        const newPoint: [number, number] = [location.lat, location.lng];
        if (prev.length > 0) {
          const lastPoint = prev[prev.length - 1];
          if (lastPoint[0] === newPoint[0] && lastPoint[1] === newPoint[1]) {
            return prev;
          }
        }
        return [...prev, newPoint];
      });
    }
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hours ago`;
  };

  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
        return { icon: '🟢', text: 'Live (WebSocket)', color: 'text-green-600' };
      case 'polling':
        return { icon: '🟡', text: 'Live (Polling)', color: 'text-yellow-600' };
      case 'connecting':
        return { icon: '🟡', text: 'Connecting...', color: 'text-yellow-600' };
      case 'disconnected':
        return { icon: '🔴', text: 'Disconnected', color: 'text-red-600' };
      default:
        return { icon: '⚪', text: 'Unknown', color: 'text-gray-600' };
    }
  };

  return (
    <div className="w-full rounded-lg overflow-hidden border shadow-md">
      <div className="h-[400px]">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Pickup Marker (Green) */}
          <Marker position={[pickupLat, pickupLng]} icon={pickupIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Pickup Location</strong>
                <br />
                {pickupLocation}
              </div>
            </Popup>
          </Marker>
          
          {/* Dropoff Marker (Red) */}
          <Marker position={[dropoffLat, dropoffLng]} icon={dropoffIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Dropoff Location</strong>
                <br />
                {dropoffLocation}
              </div>
            </Popup>
          </Marker>

          {/* Agent Location Marker (Blue) - only show if live tracking and location exists */}
          {isLive && currentLocation && (
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={vehicleIcon}>
              <Popup>
                <div className="text-sm">
                  <strong>Transport Agent</strong>
                  <br />
                  Current Location
                  {lastUpdate && (
                    <>
                      <br />
                      <span className="text-xs text-gray-500">
                        Updated {getTimeAgo(lastUpdate)}
                      </span>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Breadcrumb Trail - only show if live tracking and history exists */}
          {isLive && locationHistory.length > 1 && (
            <Polyline
              positions={locationHistory}
              color="#4285F4"
              weight={3}
              opacity={0.7}
            />
          )}
          
          {/* Auto-fit bounds to show both markers */}
          <FitBounds 
            pickupLat={pickupLat} 
            pickupLng={pickupLng} 
            dropoffLat={dropoffLat} 
            dropoffLng={dropoffLng} 
          />

          {/* Live location updater */}
          {isLive && tripId && (
            <LiveLocationUpdater 
              tripId={tripId} 
              isLive={isLive}
              onLocationUpdate={handleLocationUpdate}
              onConnectionStatusChange={setConnectionStatus}
            />
          )}
        </MapContainer>
      </div>

      {/* Live tracking indicator */}
      {isLive && (
        <div className="bg-gray-50 px-4 py-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span>{getConnectionStatusDisplay().icon}</span>
              <span className={`font-medium ${getConnectionStatusDisplay().color}`}>
                {getConnectionStatusDisplay().text}
              </span>
            </div>
            {lastUpdate && (
              <span className="text-gray-600">
                Last updated: {getTimeAgo(lastUpdate)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

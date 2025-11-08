import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLatestLocation, getLocationHistory, getFlightInfo, FlightInfo, getTrackingMode } from '../api/trips';
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

const airplaneIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
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
  locationSharingEnabled?: boolean;
  onSharingStatusChange?: (enabled: boolean) => void;
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
  locationSharingEnabled,
  onLocationUpdate,
  onConnectionStatusChange,
  onLocationSharingStatusChange
}: { 
  tripId: number;
  isLive: boolean;
  locationSharingEnabled: boolean;
  onLocationUpdate: (location: { lat: number; lng: number } | null, timestamp: string | null) => void;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  onLocationSharingStatusChange: (enabled: boolean) => void;
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
      if (error.response?.status === 403) {
        console.warn('Location sharing disabled; stopping live updates.');
        onConnectionStatusChange('disconnected');
        onLocationSharingStatusChange(false);
        stopPolling();
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      } else if (error.response?.status !== 404) {
        console.error('Failed to fetch location:', error);
      }
    }
  };

  const startPolling = () => {
    if (!locationSharingEnabled) return;
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
    if (!locationSharingEnabled) {
      stopPolling();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      onConnectionStatusChange('disconnected');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSharingEnabled]);

  useEffect(() => {
    if (!token || !tripId || !isLive || !locationSharingEnabled) {
      stopPolling();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    onConnectionStatusChange('connecting');

    const WS_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(WS_URL, {
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

    socket.on('location_sharing_status', (payload: { trip_id: number; enabled: boolean }) => {
      if (payload.trip_id === tripId) {
        onLocationSharingStatusChange(payload.enabled);
        if (!payload.enabled) {
          onConnectionStatusChange('disconnected');
          stopPolling();
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }
        }
      }
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

      // Attempt to reconnect automatically after short delay
      setTimeout(() => {
        if (socket && socket.disconnected) {
          console.log('Attempting to reconnect WebSocket...');
          socket.connect();
        }
      }, 1000);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      if (!usePolling) {
        startPolling();
      }
    });

    return () => {
      if (socket) {
        socket.off('location_sharing_status');
        socket.emit('unsubscribe_trip', { trip_id: tripId });
        socket.disconnect();
      }
      stopPolling();
    };
  }, [tripId, token, isLive, map, locationSharingEnabled]);

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
  locationSharingEnabled = true,
  onSharingStatusChange,
}) => {
  const { token } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationHistory, setLocationHistory] = useState<Array<[number, number]>>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [flightInfo, setFlightInfo] = useState<FlightInfo | null>(null);
  const [flightInfoError, setFlightInfoError] = useState<string | null>(null);
  const [trackingMode, setTrackingMode] = useState<'gps' | 'flight' | 'unknown'>('gps');
  const [routePolyline, setRoutePolyline] = useState<Array<[number, number]>>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [traveledDistance, setTraveledDistance] = useState<number>(0);
  const [routeProgress, setRouteProgress] = useState<number>(0);
  const [sharingEnabled, setSharingEnabled] = useState<boolean>(locationSharingEnabled);
  const updateSharingState = (enabled: boolean) => {
    setSharingEnabled((prev) => {
      if (prev === enabled) {
        return prev;
      }
      onSharingStatusChange?.(enabled);
      return enabled;
    });
  };

  // Convert and validate coordinates (handles both number and string from backend)
  const convertToNumber = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return isNaN(value) ? null : value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };
  
  const validPickupLat = convertToNumber(pickupLat);
  const validPickupLng = convertToNumber(pickupLng);
  const validDropoffLat = convertToNumber(dropoffLat);
  const validDropoffLng = convertToNumber(dropoffLng);

  // Don't render if coordinates are invalid
  if (!validPickupLat || !validPickupLng || !validDropoffLat || !validDropoffLng) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-gray-500">Map unavailable: Invalid coordinates</p>
      </div>
    );
  }

  const centerLat = (validPickupLat + validDropoffLat) / 2;
  const centerLng = (validPickupLng + validDropoffLng) / 2;

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    updateSharingState(locationSharingEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSharingEnabled]);

  useEffect(() => {
    if (!sharingEnabled) {
      setCurrentLocation(null);
      setLocationHistory([]);
      setConnectionStatus('disconnected');
    }
  }, [sharingEnabled]);

  useEffect(() => {
    // Always fetch route when component mounts or coordinates change
    if (!validPickupLat || !validPickupLng || !validDropoffLat || !validDropoffLng) return;

    const fetchRoute = async () => {
      try {
        // Use OSRM demo server for routing
        const url = `https://router.project-osrm.org/route/v1/driving/${validPickupLng},${validPickupLat};${validDropoffLng},${validDropoffLat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]);
          setRoutePolyline(coordinates);
          setRouteDistance(route.distance / 1000); // Convert to km
          setRouteDuration(Math.round(route.duration / 60)); // Convert to minutes
        }
      } catch (error) {
        console.error('Failed to fetch route:', error);
        // Fallback: simple straight line
        setRoutePolyline([[validPickupLat, validPickupLng], [validDropoffLat, validDropoffLng]]);
        const distance = calculateDistance(validPickupLat, validPickupLng, validDropoffLat, validDropoffLng);
        setRouteDistance(distance);
      }
    };

    fetchRoute();
  }, [validPickupLat, validPickupLng, validDropoffLat, validDropoffLng]);

  // Calculate traveled distance and progress
  useEffect(() => {
    if (locationHistory.length > 1 && routeDistance) {
      let totalTraveled = 0;
      for (let i = 1; i < locationHistory.length; i++) {
        const [lat1, lng1] = locationHistory[i - 1];
        const [lat2, lng2] = locationHistory[i];
        totalTraveled += calculateDistance(lat1, lng1, lat2, lng2);
      }
      setTraveledDistance(totalTraveled);
      setRouteProgress(Math.min((totalTraveled / routeDistance) * 100, 100));
    } else if (locationHistory.length === 0) {
      setTraveledDistance(0);
      setRouteProgress(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationHistory, routeDistance]);

  useEffect(() => {
    if (!isLive || !tripId || !token || !sharingEnabled) return;

    const fetchHistory = async () => {
      try {
        const data = await getLocationHistory(token, tripId, 100);
        if (data.locations && data.locations.length > 0) {
          const history = data.locations.reverse().map(loc => [loc.latitude, loc.longitude] as [number, number]);
          setLocationHistory(history);
        }
      } catch (error: any) {
        if (error.response?.status === 403) {
          updateSharingState(false);
        } else {
          console.error('Failed to fetch location history:', error);
        }
      }
    };

    const fetchFlight = async () => {
      try {
        const data = await getFlightInfo(token, tripId);
        setFlightInfo(data);
        setFlightInfoError(null);
      } catch (error: any) {
        if (error.response?.status === 404) {
          setFlightInfoError(null);
        } else if (error.response?.status === 503) {
          setFlightInfoError('Flight information temporarily unavailable');
        } else {
          console.error('Failed to fetch flight info:', error);
        }
      }
    };

    const fetchTrackingMode = async () => {
      try {
        const data = await getTrackingMode(token, tripId);
        setTrackingMode(data.mode);
      } catch (error: any) {
        console.error('Failed to fetch tracking mode:', error);
      }
    };

    fetchHistory();
    fetchFlight();
    fetchTrackingMode();
  }, [isLive, tripId, token, sharingEnabled]);

  const handleLocationUpdate = (location: { lat: number; lng: number } | null, timestamp: string | null) => {
    if (!sharingEnabled || !location) {
      return;
    }

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

  const getTrackingModeDisplay = () => {
    switch (trackingMode) {
      case 'gps':
        return { icon: '📍', text: 'GPS Tracking', color: 'text-green-600', description: 'Real-time location from transport agent' };
      case 'flight':
        return { icon: '✈️', text: 'Flight Tracking', color: 'text-blue-600', description: 'Tracking via flight number' };
      case 'unknown':
        return { icon: '⚠️', text: 'Location Unavailable', color: 'text-orange-600', description: 'Waiting for location update...' };
      default:
        return { icon: '⚪', text: 'Unknown', color: 'text-gray-600', description: '' };
    }
  };

  const getCurrentIcon = () => {
    return trackingMode === 'flight' ? airplaneIcon : vehicleIcon;
  };

  return (
    <div className="w-full rounded-lg overflow-hidden border shadow-md">
      <div className="relative h-[400px]">
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
          <Marker position={[validPickupLat, validPickupLng]} icon={pickupIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Pickup Location</strong>
                <br />
                {pickupLocation}
              </div>
            </Popup>
          </Marker>
          
          {/* Dropoff Marker (Red) */}
          <Marker position={[validDropoffLat, validDropoffLng]} icon={dropoffIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Dropoff Location</strong>
                <br />
                {dropoffLocation}
              </div>
            </Popup>
          </Marker>

          {/* Agent Location Marker - only show if live tracking and location exists */}
          {isLive && currentLocation && (
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={getCurrentIcon()}>
              <Popup>
                <div className="text-sm">
                  <strong>{trackingMode === 'flight' ? 'Aircraft' : 'Transport Agent'}</strong>
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

          {/* Route Polyline - shows planned route between pickup and dropoff */}
          {routePolyline.length > 0 && (
            <Polyline
              positions={routePolyline}
              color="#9CA3AF"
              weight={4}
              opacity={0.5}
              dashArray="10, 5"
            />
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
            pickupLat={validPickupLat} 
            pickupLng={validPickupLng} 
            dropoffLat={validDropoffLat} 
            dropoffLng={validDropoffLng} 
          />

          {/* Live location updater */}
          {isLive && tripId && sharingEnabled && (
            <LiveLocationUpdater 
              tripId={tripId} 
              isLive={isLive}
              locationSharingEnabled={sharingEnabled}
              onLocationUpdate={handleLocationUpdate}
              onConnectionStatusChange={setConnectionStatus}
              onLocationSharingStatusChange={updateSharingState}
            />
          )}
        </MapContainer>

        {!sharingEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm text-center px-6">
            <p className="font-semibold text-gray-700">Location sharing is disabled</p>
            <p className="text-sm text-gray-500 mt-2">
              Enable location sharing to view live transport updates and vehicle progress.
            </p>
          </div>
        )}
      </div>

      {/* Route information and progress */}
      {routeDistance && sharingEnabled && (
        <div className="bg-blue-50 px-4 py-2 border-t">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex-1">
              <div className="font-medium text-blue-900">Route Information</div>
              <div className="text-xs text-blue-800 mt-1">
                Total Distance: {routeDistance.toFixed(1)} km
                {routeDuration && ` • Estimated Time: ${routeDuration} min`}
              </div>
            </div>
          </div>
          {isLive && sharingEnabled && (
            <>
              <div className="mt-2 mb-1">
                <div className="flex justify-between text-xs text-blue-800 mb-1">
                  <span>Progress</span>
                  <span>{routeProgress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${routeProgress}%` }}
                  />
                </div>
              </div>
              <div className="text-xs text-blue-800 mt-1">
                Traveled: {traveledDistance.toFixed(1)} km / {routeDistance.toFixed(1)} km
                {currentLocation && routeDistance && (
                  <span className="ml-2">
                    • Remaining: {(routeDistance - traveledDistance).toFixed(1)} km
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tracking mode indicator */}
      {isLive && sharingEnabled && (
        <div className="bg-gray-50 px-4 py-2 border-t">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex items-center gap-2">
              <span>{getTrackingModeDisplay().icon}</span>
              <div>
                <span className={`font-medium ${getTrackingModeDisplay().color}`}>
                  {getTrackingModeDisplay().text}
                </span>
                <div className="text-xs text-gray-500">
                  {getTrackingModeDisplay().description}
                </div>
              </div>
            </div>
          </div>
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

      {/* Flight information card */}
      {flightInfo && (
        <div className="bg-blue-50 px-4 py-3 border-t">
          <div className="flex items-start gap-3">
            <div className="text-2xl">✈️</div>
            <div className="flex-1">
              <div className="font-semibold text-blue-900 mb-1">
                {flightInfo.flight_number} - {flightInfo.airline}
              </div>
              <div className="text-sm text-blue-800 mb-2">
                Status: <span className={`font-medium ${
                  flightInfo.status === 'active' ? 'text-green-700' :
                  flightInfo.status === 'landed' ? 'text-gray-700' :
                  flightInfo.status === 'scheduled' ? 'text-blue-700' :
                  'text-orange-700'
                }`}>
                  {flightInfo.status.charAt(0).toUpperCase() + flightInfo.status.slice(1)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium text-blue-900">Departure</div>
                  <div className="text-blue-800">{flightInfo.departure_airport}</div>
                  {flightInfo.departure_gate && (
                    <div className="text-xs text-blue-700">Gate: {flightInfo.departure_gate}</div>
                  )}
                  {flightInfo.departure_time && (
                    <div className="text-xs text-blue-700">
                      {new Date(flightInfo.departure_time).toLocaleString()}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium text-blue-900">Arrival</div>
                  <div className="text-blue-800">{flightInfo.arrival_airport}</div>
                  {flightInfo.arrival_gate && (
                    <div className="text-xs text-blue-700">Gate: {flightInfo.arrival_gate}</div>
                  )}
                  {flightInfo.arrival_time && (
                    <div className="text-xs text-blue-700">
                      {new Date(flightInfo.arrival_time).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              {flightInfo.current_position && (
                <div className="mt-2 text-xs text-blue-700">
                  {flightInfo.current_position.altitude && (
                    <span className="mr-3">Altitude: {flightInfo.current_position.altitude}ft</span>
                  )}
                  {flightInfo.current_position.speed && (
                    <span>Speed: {flightInfo.current_position.speed}mph</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flight info error */}
      {flightInfoError && (
        <div className="bg-yellow-50 px-4 py-2 border-t">
          <div className="text-sm text-yellow-800">
            ⚠️ {flightInfoError}
          </div>
        </div>
      )}
    </div>
  );
};

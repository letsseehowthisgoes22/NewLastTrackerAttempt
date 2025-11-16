import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TripMap.css';
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

// Moving vehicle icon - uses a more dynamic color and will be animated
// Unused - commented out to fix TypeScript error
// const vehicleIcon = new L.Icon({
//   iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
//   shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
//   iconSize: [32, 32], // Slightly larger for visibility
//   iconAnchor: [16, 16],
//   popupAnchor: [1, -34],
//   shadowSize: [41, 41]
// });

// Create a pulsing animated dot marker for the moving agent
const createPulsingMarker = () => {
  return L.divIcon({
    className: 'pulsing-marker',
    html: `
      <div class="pulse-container">
        <div class="pulse-ring"></div>
        <div class="pulse-ring-delay"></div>
        <div class="moving-dot"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
};

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

// Unused function removed to fix TypeScript error
// function FitBounds({ pickupLat, pickupLng, dropoffLat, dropoffLng }: { 
//   pickupLat: number; 
//   pickupLng: number; 
//   dropoffLat: number; 
//   dropoffLng: number; 
// }) {
//   const map = useMap();
//   
//   useEffect(() => {
//     const bounds = L.latLngBounds(
//       [pickupLat, pickupLng],
//       [dropoffLat, dropoffLng]
//     );
//     map.fitBounds(bounds, { padding: [50, 50] });
//   }, [map, pickupLat, pickupLng, dropoffLat, dropoffLng]);
//   
//   return null;
// }

function CenterOnAgent({ 
  currentLocation, 
  fallbackToRoute,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng
}: { 
  currentLocation: { lat: number; lng: number } | null;
  fallbackToRoute: boolean;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}) {
  const map = useMap();
  
  useEffect(() => {
    if (currentLocation) {
      // Center on agent location with a reasonable zoom level for tracking
      map.setView([currentLocation.lat, currentLocation.lng], 15, { animate: true });
    } else if (fallbackToRoute) {
      // Fallback: center on route
      const bounds = L.latLngBounds(
        [pickupLat, pickupLng],
        [dropoffLat, dropoffLng]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, currentLocation, fallbackToRoute, pickupLat, pickupLng, dropoffLat, dropoffLng]);
  
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

  // Default center (used only for initial map load, will be overridden by CenterOnAgent)
  // Prioritize agent location if available, otherwise use route center
  const defaultCenterLat = currentLocation ? currentLocation.lat : (validPickupLat + validDropoffLat) / 2;
  const defaultCenterLng = currentLocation ? currentLocation.lng : (validPickupLng + validDropoffLng) / 2;

  // Calculate distance between two coordinates using Haversine formula (returns km)
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

  // Convert km to miles
  const kmToMiles = (km: number): number => {
    return km * 0.621371;
  };

  // Format minutes into hours and minutes
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${mins} min`;
  };

  // Find the closest point on a polyline to a given point
  const findClosestPointOnRoute = (
    point: { lat: number; lng: number },
    route: Array<[number, number]>
  ): { closestPoint: [number, number] | null; distanceAlongRoute: number; distanceToRoute: number } => {
    if (route.length === 0 || !point) {
      return { closestPoint: null, distanceAlongRoute: 0, distanceToRoute: Infinity };
    }

    let minDistance = Infinity;
    let closestSegmentIndex = 0;
    let closestPointOnSegment: [number, number] | null = null;
    let totalDistanceToClosest = 0;

    // Find the closest point on the route polyline
    for (let i = 0; i < route.length - 1; i++) {
      const [lat1, lng1] = route[i];
      const [lat2, lng2] = route[i + 1];

      // Calculate distance from point to line segment
      // const segmentDistance = calculateDistance(lat1, lng1, lat2, lng2);
      
      // Project point onto the line segment
      const A = point.lat - lat1;
      const B = point.lng - lng1;
      const C = lat2 - lat1;
      const D = lng2 - lng1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = lenSq !== 0 ? dot / lenSq : -1;

      let closestLat: number, closestLng: number;
      if (param < 0) {
        closestLat = lat1;
        closestLng = lng1;
      } else if (param > 1) {
        closestLat = lat2;
        closestLng = lng2;
      } else {
        closestLat = lat1 + param * C;
        closestLng = lng1 + param * D;
      }

      const distToSegment = calculateDistance(point.lat, point.lng, closestLat, closestLng);

      if (distToSegment < minDistance) {
        minDistance = distToSegment;
        closestSegmentIndex = i;
        closestPointOnSegment = [closestLat, closestLng];
        
        // Calculate distance along route from pickup to this closest point
        let distanceAlongRoute = 0;
        for (let j = 0; j <= closestSegmentIndex; j++) {
          if (j < closestSegmentIndex) {
            distanceAlongRoute += calculateDistance(route[j][0], route[j][1], route[j + 1][0], route[j + 1][1]);
          } else if (j === closestSegmentIndex && closestPointOnSegment) {
            // Add distance from segment start to closest point
            distanceAlongRoute += calculateDistance(route[j][0], route[j][1], closestPointOnSegment[0], closestPointOnSegment[1]);
          }
        }
        totalDistanceToClosest = distanceAlongRoute;
      }
    }

    return {
      closestPoint: closestPointOnSegment,
      distanceAlongRoute: totalDistanceToClosest,
      distanceToRoute: minDistance
    };
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

  // Calculate traveled distance and progress based on distance along the route
  useEffect(() => {
    if (currentLocation && routePolyline.length > 0 && routeDistance) {
      // Find closest point on route and calculate distance along route from pickup
      const routeInfo = findClosestPointOnRoute(currentLocation, routePolyline);
      
      // Only count progress if agent is reasonably close to the route (within 5km/3 miles)
      // This prevents showing progress when agent is on the other side of the country
      const MAX_DISTANCE_FROM_ROUTE = 5; // km
      
      if (routeInfo.distanceToRoute <= MAX_DISTANCE_FROM_ROUTE) {
        setTraveledDistance(routeInfo.distanceAlongRoute);
        setRouteProgress(Math.min((routeInfo.distanceAlongRoute / routeDistance) * 100, 100));
      } else {
        // Agent is too far from route, don't update progress
        // Keep previous values or set to 0 if this is the first location
        if (traveledDistance === 0) {
          setTraveledDistance(0);
          setRouteProgress(0);
        }
      }
    } else if (!currentLocation || routePolyline.length === 0) {
      setTraveledDistance(0);
      setRouteProgress(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, routePolyline, routeDistance]);

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

  // Update tracking mode to GPS when we receive location updates
  useEffect(() => {
    if (currentLocation && trackingMode === 'unknown') {
      setTrackingMode('gps');
    }
  }, [currentLocation, trackingMode]);

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
    // If we have a current location, show GPS tracking even if mode is unknown
    // This prevents showing "Location Unavailable" when location is actually available
    if (currentLocation && trackingMode === 'unknown') {
      return { icon: '📍', text: 'GPS Tracking', color: 'text-green-600', description: 'Real-time location from transport agent' };
    }
    
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

  // Unused function removed to fix TypeScript error
  // const getCurrentIcon = () => {
  //   return trackingMode === 'flight' ? airplaneIcon : vehicleIcon;
  // };

  return (
    <div className="w-full rounded-lg border shadow-md mb-6 relative z-0">
      <div className="relative h-[400px] overflow-hidden rounded-t-lg" style={{ height: '400px', minHeight: '400px' }}>
        <MapContainer
          center={[defaultCenterLat, defaultCenterLng]}
          zoom={currentLocation ? 15 : 10}
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

          {/* Agent Location Marker - animated pulsing dot for moving vehicle */}
          {isLive && currentLocation && (
            <Marker 
              position={[currentLocation.lat, currentLocation.lng]} 
              icon={trackingMode === 'flight' ? airplaneIcon : createPulsingMarker()}
            >
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
              color="#2563EB"
              weight={6}
              opacity={0.8}
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
          
          {/* Center on agent location if available, otherwise fit to route */}
          <CenterOnAgent
            currentLocation={currentLocation}
            fallbackToRoute={!currentLocation}
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
        <div className="bg-blue-50 px-6 py-5 border-t relative z-0">
          <div className="space-y-5">
            <div>
              <div className="font-medium text-blue-900 mb-3 text-base">Route Information</div>
              <div className="text-sm text-blue-800 space-y-3">
                <div className="font-medium">Total Distance: {kmToMiles(routeDistance).toFixed(1)} miles</div>
                {routeDuration && (
                  <div className="font-medium">Estimated Time: {formatDuration(routeDuration)}</div>
                )}
              </div>
            </div>
            {isLive && sharingEnabled && (
              <div className="pt-4 border-t border-blue-300">
                <div className="flex justify-between items-center text-sm text-blue-800 mb-4">
                  <span className="font-semibold text-base">Progress</span>
                  <span className="font-bold text-base">{routeProgress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-3 mb-4">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${routeProgress}%` }}
                  />
                </div>
                <div className="text-sm text-blue-800 space-y-3">
                  <div className="font-medium">
                    Traveled: {kmToMiles(traveledDistance).toFixed(1)} miles / {kmToMiles(routeDistance).toFixed(1)} miles
                  </div>
                  {currentLocation && routeDistance && (
                    <div className="font-medium">
                      Remaining: {kmToMiles(Math.max(0, routeDistance - traveledDistance)).toFixed(1)} miles
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tracking mode indicator */}
      {isLive && sharingEnabled && (
        <div className="bg-gray-50 px-6 py-5 border-t relative z-0">
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <span className="text-xl flex-shrink-0">{getTrackingModeDisplay().icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${getTrackingModeDisplay().color} mb-2 text-base`}>
                  {getTrackingModeDisplay().text}
                </div>
                <div className="text-sm text-gray-600">
                  {getTrackingModeDisplay().description}
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getConnectionStatusDisplay().icon}</span>
                  <span className={`text-sm font-semibold ${getConnectionStatusDisplay().color}`}>
                    {getConnectionStatusDisplay().text}
                  </span>
                </div>
                {lastUpdate && (
                  <span className="text-sm text-gray-600">
                    Last updated: {getTimeAgo(lastUpdate)}
                  </span>
                )}
              </div>
            </div>
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

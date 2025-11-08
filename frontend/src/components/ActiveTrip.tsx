import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrip, updateTrip, postLocation, setLocationSharing } from '../api/trips';
import { Trip } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TripMap } from './TripMap';

export const ActiveTrip = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationToggleLoading, setLocationToggleLoading] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchTrip = async () => {
      if (!token || !id) return;

      try {
        const data = await getTrip(token, parseInt(id));
        setTrip(data);
        
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load trip details');
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();

    return () => {
      stopTracking();
    };
  }, [token, id]);

  useEffect(() => {
    if (!trip) return;

    const privilegedUser = user?.role === 'admin' || user?.role === 'agent';
    const sharingEnabled = trip.location_sharing_enabled !== false;
    const shouldTrack = privilegedUser && trip.status === 'in_progress' && sharingEnabled;

    if (shouldTrack && !isTracking) {
      startTracking();
    } else if ((!shouldTrack || !sharingEnabled) && isTracking) {
      stopTracking();
    }

    if (!sharingEnabled) {
      setCurrentLocation(null);
      setLastUpdate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, user?.role, isTracking]);

  const sendLocationToBackend = async (latitude: number, longitude: number, accuracy?: number) => {
    if (!token || !id || trip?.location_sharing_enabled === false) return;

    try {
      await postLocation(token, parseInt(id), {
        latitude,
        longitude,
        accuracy,
      });
      setLastUpdate(new Date());
      setCurrentLocation({ lat: latitude, lng: longitude });
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError(err.response?.data?.detail || 'Location sharing is currently disabled for this trip.');
        stopTracking();
      } else {
        console.error('Failed to send location:', err);
      }
    }
  };

  const startTracking = () => {
    if (isTracking) return;
    if (trip?.location_sharing_enabled === false) return;
    if (user?.role !== 'admin' && user?.role !== 'agent') return;

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsTracking(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        sendLocationToBackend(latitude, longitude, accuracy);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setError(`Location error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    watchIdRef.current = watchId;

    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          sendLocationToBackend(latitude, longitude, accuracy);
        },
        (error) => {
          console.error('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000,
        }
      );
    }, 30000); // 30 seconds

    intervalIdRef.current = intervalId;
  };

  const stopTracking = () => {
    if (!isTracking) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    setIsTracking(false);
  };

  const handleStartTrip = async () => {
    if (!token || !trip) return;

    try {
      const updatedTrip = await updateTrip(token, trip.id, { status: 'in_progress' });
      setTrip(updatedTrip);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start trip');
    }
  };

  const handleEndTrip = async () => {
    if (!token || !trip) return;

    try {
      stopTracking();
      await updateTrip(token, trip.id, { status: 'completed' });
      navigate('/trips');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to end trip');
    }
  };

  const handleToggleLocationSharing = async () => {
    if (!token || !trip) return;

    const nextValue = !locationSharingOn;
    setLocationToggleLoading(true);
    setError('');

    try {
      const response = await setLocationSharing(token, trip.id, nextValue);
      setTrip((prev) => (prev ? { ...prev, location_sharing_enabled: response.location_sharing_enabled } : prev));
      if (!response.location_sharing_enabled) {
        stopTracking();
        setCurrentLocation(null);
        setLastUpdate(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update location sharing');
    } finally {
      setLocationToggleLoading(false);
    }
  };

  const getTimeSinceLastUpdate = () => {
    if (!lastUpdate) return 'No updates yet';
    
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hours ago`;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p>Loading trip details...</p>
      </div>
    );
  }

  if (error && !trip) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/trips')} className="mt-4">
          Back to Trips
        </Button>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p>Loading trip...</p>
      </div>
    );
  }

  const showInlineError = error && trip;

  // Check if user has access to this trip
  const hasAccess = user?.role === 'admin' || 
                    user?.role === 'agent' || 
                    (user?.role === 'parent' && trip.assigned_parent_id === user?.id) ||
                    (user?.role === 'clinician' && trip.assigned_clinician_id === user?.id);
  const locationSharingOn = trip.location_sharing_enabled !== false;

  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>You do not have access to this trip.</AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/trips')} className="mt-4">
          Back to Trips
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Button onClick={() => navigate('/trips')} variant="outline" className="mb-4">
        ← Back to Trips
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>
                {trip.status === 'in_progress' ? 'Trip Active' : 'Trip Details'}
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">Trip ID: {trip.id}</p>
            </div>
            <Badge className={trip.status === 'in_progress' ? 'bg-green-500' : 'bg-blue-500'}>
              {trip.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showInlineError && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-2">Client Information</h3>
            <p className="text-sm text-gray-900">{trip.client_name}</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Destination</h3>
            <p className="text-sm text-gray-900">{trip.dropoff_location}</p>
          </div>

          {/* Embedded Map - shows for all users with access */}
          {(() => {
            // Convert coordinates to numbers (handles both number and string from backend)
            const convertToNumber = (value: number | string | null | undefined): number | null => {
              if (value === null || value === undefined) return null;
              if (typeof value === 'number') return isNaN(value) ? null : value;
              if (typeof value === 'string') {
                const parsed = parseFloat(value);
                return isNaN(parsed) ? null : parsed;
              }
              return null;
            };
            
            const pickupLat = convertToNumber(trip.pickup_lat);
            const pickupLng = convertToNumber(trip.pickup_lng);
            const dropoffLat = convertToNumber(trip.dropoff_lat);
            const dropoffLng = convertToNumber(trip.dropoff_lng);
            
            const hasValidCoords = 
              pickupLat !== null &&
              pickupLng !== null &&
              dropoffLat !== null &&
              dropoffLng !== null;
            
            return hasValidCoords ? (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Route Map</h3>
                <div className="w-full" style={{ height: '400px', minHeight: '400px' }}>
                  <TripMap
                    pickupLat={pickupLat}
                    pickupLng={pickupLng}
                    dropoffLat={dropoffLat}
                    dropoffLng={dropoffLng}
                    pickupLocation={trip.pickup_location}
                    dropoffLocation={trip.dropoff_location}
                    tripId={trip.id}
                    isLive={trip.status === 'in_progress'}
                    locationSharingEnabled={locationSharingOn}
                    onSharingStatusChange={(enabled) =>
                      setTrip((prev) => (prev ? { ...prev, location_sharing_enabled: enabled } : prev))
                    }
                  />
                </div>
              </div>
            ) : null;
          })()}

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className={`text-2xl ${locationSharingOn ? 'text-green-500' : 'text-gray-400'}`}>📍</span>
              <div>
                <h3 className="text-lg font-semibold">Location Sharing</h3>
                <p className="text-sm text-gray-600">
                  {locationSharingOn
                    ? lastUpdate
                      ? `Last update ${getTimeSinceLastUpdate()}.`
                      : 'Waiting for the first location update.'
                    : 'Location sharing is currently disabled for all viewers.'}
                </p>
                {locationSharingOn && currentLocation && (
                  <p className="text-xs text-gray-500 mt-1">
                    Current: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
                  </p>
                )}
                {isTracking && locationSharingOn && (
                  <p className="text-xs text-green-600 mt-1">
                    This device is actively sending location updates.
                  </p>
                )}
              </div>
            </div>

            {(user?.role === 'admin' || user?.role === 'agent') && (
              <Button
                onClick={handleToggleLocationSharing}
                variant={locationSharingOn ? 'outline' : 'default'}
                className="w-full md:w-auto"
                disabled={locationToggleLoading}
              >
                {locationToggleLoading
                  ? 'Updating location sharing...'
                  : locationSharingOn
                    ? 'Disable Location Sharing'
                    : 'Enable Location Sharing'}
              </Button>
            )}
          </div>

          <div className="border-t pt-4">
            {trip.status === 'scheduled' && (user?.role === 'admin' || user?.role === 'agent') && (
              <Button onClick={handleStartTrip} className="w-full" size="lg">
                Start Trip
              </Button>
            )}
            
            {trip.status === 'in_progress' && user?.role === 'admin' && (
              <Button onClick={handleEndTrip} className="w-full" size="lg" variant="destructive">
                End Trip
              </Button>
            )}

            {trip.status === 'completed' && (
              <Alert>
                <AlertDescription>This trip has been completed.</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

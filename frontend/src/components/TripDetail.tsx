import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrip, updateTrip, setLocationSharing, postLocation, updateMilestone } from '../api/trips';
import { Trip } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DocumentsSection } from './DocumentsSection';
import { TripMap } from './TripMap';
import TripChat from './TripChat';
import './TripChat.css';

export const TripDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [locationToggleLoading, setLocationToggleLoading] = useState(false);
  const [milestoneSubmitting, setMilestoneSubmitting] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const [isTracking, setIsTracking] = useState(false);

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

    // Cleanup: stop tracking when component unmounts
    return () => {
      stopLocationTracking();
    };
  }, [token, id]);

  // Notifications moved to dedicated page

  // Start/stop location tracking based on trip status and location sharing
  useEffect(() => {
    if (!trip || !id || !token) return;

    const isAgent = user?.role === 'admin' || user?.role === 'agent';
    const shouldTrack = isAgent && 
                       trip.status === 'in_progress' && 
                       trip.location_sharing_enabled !== false;

    if (shouldTrack && !isTracking) {
      startLocationTracking();
    } else if (!shouldTrack && isTracking) {
      stopLocationTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.status, trip?.location_sharing_enabled, user?.role, isTracking]);

  const sendLocationToBackend = async (latitude: number, longitude: number, accuracy?: number) => {
    if (!token || !id || trip?.location_sharing_enabled === false) return;

    try {
      await postLocation(token, parseInt(id), {
        latitude,
        longitude,
        accuracy,
      });
      console.log('Location sent to backend:', { latitude, longitude, accuracy });
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError(err.response?.data?.detail || 'Location sharing is currently disabled for this trip.');
        stopLocationTracking();
      } else {
        console.error('Failed to send location:', err);
      }
    }
  };

  const startLocationTracking = () => {
    if (isTracking) return;
    if (trip?.location_sharing_enabled === false) return;
    if (user?.role !== 'admin' && user?.role !== 'agent') return;

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    console.log('Starting location tracking...');
    setIsTracking(true);

    // Request permission and get initial location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        sendLocationToBackend(latitude, longitude, accuracy);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setError(`Location permission denied: ${error.message}. Please allow location access in your browser settings.`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    // Watch position for continuous updates
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        sendLocationToBackend(latitude, longitude, accuracy);
      },
      (error) => {
        console.error('Geolocation watch error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setError('Location permission denied. Please allow location access in your browser settings.');
          stopLocationTracking();
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    watchIdRef.current = watchId;

    // Also send location every 30 seconds as backup
    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          sendLocationToBackend(latitude, longitude, accuracy);
        },
        (error) => {
          console.error('Geolocation interval error:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      );
    }, 30000); // 30 seconds

    intervalIdRef.current = intervalId;
  };

  const stopLocationTracking = () => {
    if (!isTracking) return;

    console.log('Stopping location tracking...');
    setIsTracking(false);

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500';
      case 'in_progress':
        return 'bg-green-500';
      case 'completed':
        return 'bg-gray-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p>Loading trip details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p>Trip not found</p>
        <Button onClick={() => navigate('/trips')} className="mt-4">
          Back to Trips
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-800 py-8">
      <div className="max-w-7xl mx-auto px-4">
      <div className="flex justify-between items-center mb-4">
        <Button onClick={() => navigate('/trips')} variant="outline">
          ← Back to Trips
        </Button>
        <div className="flex gap-2">
          {(user?.role === 'admin' || user?.role === 'agent') && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/trips/${trip.id}/notifications`)}>
                Notification Settings
              </Button>
              <Button onClick={() => navigate(`/trips/${trip.id}/edit`)}>
                Edit Trip
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="shadow-2xl border-0">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Trip Details</CardTitle>
              <CardDescription>Trip ID: {trip.id}</CardDescription>
            </div>
            <Badge className={getStatusBadgeColor(trip.status)}>
              {trip.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Client info (full width on top) */}
          <div className="grid grid-cols-1 gap-6 items-start">
            <div className="col-span-1">
              <h3 className="text-lg font-semibold mb-4 text-center">Client Information</h3>
              <div className="mb-6">
                <div className="text-xl font-bold text-blue-600 bg-blue-50 px-6 py-3 rounded-lg inline-block border-2 border-blue-300">
                  {trip.client_name}
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-4">
                {trip.client_age && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Age</dt>
                    <dd className="text-sm text-gray-900">{trip.client_age}</dd>
                  </div>
                )}
                {trip.client_build && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Build</dt>
                    <dd className="text-sm text-gray-900">{trip.client_build}</dd>
                  </div>
                )}
                {(trip.parent_guardian_name || trip.parent_guardian_relationship) && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Parent/Guardian</dt>
                    <dd className="text-sm text-gray-900">
                      {trip.parent_guardian_name || 'Not specified'}
                      {trip.parent_guardian_relationship && (
                        <span className="text-gray-500 ml-2">({trip.parent_guardian_relationship})</span>
                      )}
                    </dd>
                  </div>
                )}
                {trip.transport_relevant_medical_info && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-2">Transport Relevant Medical Information</dt>
                    <dd className="text-sm text-gray-900 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-md whitespace-pre-wrap">
                      {trip.transport_relevant_medical_info}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Trip Details</h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Pickup Location</dt>
                <dd className="text-sm text-gray-900">{trip.pickup_location}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Dropoff Location</dt>
                <dd className="text-sm text-gray-900">{trip.dropoff_location}</dd>
              </div>
            </dl>
            
            {/* Map + Milestones side-by-side */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4">Route Map</h3>
                {(() => {
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
                
                // Debug logging for trip ID 3
                if (trip.id === 3) {
                  console.log('Trip ID 3 Map Debug:', {
                    trip_id: trip.id,
                    client_name: trip.client_name,
                    pickup_lat: trip.pickup_lat,
                    pickup_lng: trip.pickup_lng,
                    dropoff_lat: trip.dropoff_lat,
                    dropoff_lng: trip.dropoff_lng,
                    pickup_location: trip.pickup_location,
                    dropoff_location: trip.dropoff_location,
                    converted: {
                      pickupLat,
                      pickupLng,
                      dropoffLat,
                      dropoffLng
                    }
                  });
                }
                
                const hasValidCoords = 
                  pickupLat !== null &&
                  pickupLng !== null &&
                  dropoffLat !== null &&
                  dropoffLng !== null;
                
                if (!hasValidCoords) {
                  return (
                    <div className="w-full border-2 border-dashed border-gray-300 rounded-lg" style={{ height: '400px', minHeight: '400px' }}>
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <p className="text-lg mb-2">📍 Map Unavailable</p>
                          <p className="text-sm">Pickup or dropoff coordinates are missing.</p>
                          <p className="text-xs mt-2">Pickup: {trip.pickup_lat ? `${trip.pickup_lat}, ${trip.pickup_lng}` : 'Not set'}</p>
                          <p className="text-xs">Dropoff: {trip.dropoff_lat ? `${trip.dropoff_lat}, ${trip.dropoff_lng}` : 'Not set'}</p>
                          {trip.pickup_location && (
                            <p className="text-xs mt-2 text-blue-600">Pickup Address: {trip.pickup_location}</p>
                          )}
                          {trip.dropoff_location && (
                            <p className="text-xs text-blue-600">Dropoff Address: {trip.dropoff_location}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <TripMap
                    pickupLat={pickupLat}
                    pickupLng={pickupLng}
                    dropoffLat={dropoffLat}
                    dropoffLng={dropoffLng}
                    pickupLocation={trip.pickup_location}
                    dropoffLocation={trip.dropoff_location}
                    tripId={trip.id}
                    isLive={trip.status === 'in_progress'}
                    locationSharingEnabled={trip.location_sharing_enabled !== false}
                    onSharingStatusChange={(enabled) =>
                      setTrip((prev) => prev ? { ...prev, location_sharing_enabled: enabled } : null)
                    }
                  />
                );
              })()}
              </div>

              {/* Milestones panel - right of map, sticky on desktop */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-4">
                  <h3 className="text-lg font-semibold mb-4">Milestones</h3>
                  <div className="flex flex-col gap-3">
                    {[
                      { id: 1, label: 'Began Route to Pickup', key: 'm1_began_route_to_pickup' as const },
                      { id: 2, label: 'Arrived at Pickup', key: 'm2_arrived_pickup' as const },
                      { id: 3, label: 'En Route to Destination', key: 'm3_en_route_to_destination' as const },
                      { id: 4, label: 'Arrived at Dropoff location', key: 'm4_arrived_dropoff' as const },
                      { id: 5, label: 'Client Transport Complete', key: 'm5_transport_complete' as const },
                    ].map((m) => {
                      const done = (trip as any)?.[m.key] === true;
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3 bg-white shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full ring-2 ${done ? 'bg-green-500 ring-green-200' : 'bg-red-500 ring-red-200'}`} />
                            <span className={`font-medium ${done ? 'text-green-700' : 'text-red-700'}`}>{m.label}</span>
                          </div>
                          {(user?.role === 'admin' || user?.role === 'agent') && trip.status !== 'completed' && (
                            <Button
                              size="sm"
                              variant={done ? 'outline' : 'default'}
                              disabled={milestoneSubmitting === m.id}
                              onClick={async () => {
                                if (!token || !trip) return;
                                setError('');
                                setMilestoneSubmitting(m.id);
                                try {
                                  // require confirm if skipping previous
                                  let confirmFlag = false;
                                  if (m.id > 1) {
                                    const prevKey = ([
                                      'm1_began_route_to_pickup',
                                      'm2_arrived_pickup',
                                      'm3_en_route_to_destination',
                                      'm4_arrived_dropoff',
                                      'm5_transport_complete'
                                    ] as const)[m.id - 2];
                                    const prevDone = (trip as any)?.[prevKey] === true;
                                    if (!prevDone) {
                                      confirmFlag = window.confirm(`You selected "${m.label}" but the previous milestone is not completed. Mark anyway?`);
                                    }
                                  }
                                  await updateMilestone(token, trip.id, { milestone: m.id as any, completed: !done, confirm: confirmFlag });
                                  const updated = await getTrip(token, trip.id);
                                  setTrip(updated);
                                } catch (err: any) {
                                  setError(err.response?.data?.detail || 'Failed to update milestone');
                                } finally {
                                  setMilestoneSubmitting(null);
                                }
                              }}
                            >
                              {milestoneSubmitting === m.id ? 'Saving...' : done ? 'Mark Incomplete' : 'Mark Complete'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trip Tracking Controls - immediately after map */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">Trip Tracking Controls</h3>
            
            {trip.status === 'scheduled' && (user?.role === 'admin' || user?.role === 'agent') && (
              <div className="space-y-4">
                <Button 
                  onClick={async () => {
                    if (!token || !trip) return;
                    try {
                      const updatedTrip = await updateTrip(token, trip.id, { status: 'in_progress' });
                      setTrip(updatedTrip);
                    } catch (err: any) {
                      setError(err.response?.data?.detail || 'Failed to start trip');
                    }
                  }}
                  className="w-full"
                  size="lg"
                >
                  Start Trip
                </Button>
              </div>
            )}
            
            {trip.status === 'in_progress' && (user?.role === 'admin' || user?.role === 'agent') && (
              <div className="space-y-4">
                {/* Begin/Pause Trip Tracking */}
                {trip.location_sharing_enabled === false ? (
                  <Button
                    onClick={async () => {
                      if (!token || !trip) return;
                      setLocationToggleLoading(true);
                      setError('');
                      try {
                        const response = await setLocationSharing(token, trip.id, true);
                        setTrip((prev) => (prev ? { ...prev, location_sharing_enabled: response.location_sharing_enabled } : null));
                        // Location tracking will start automatically via useEffect
                      } catch (err: any) {
                        setError(err.response?.data?.detail || 'Failed to begin trip tracking');
                      } finally {
                        setLocationToggleLoading(false);
                      }
                    }}
                    className="w-full"
                    size="lg"
                    disabled={locationToggleLoading}
                  >
                    {locationToggleLoading ? 'Starting...' : '📍 Begin Trip Tracking'}
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      if (!token || !trip) return;
                      setLocationToggleLoading(true);
                      setError('');
                      try {
                        const response = await setLocationSharing(token, trip.id, false);
                        setTrip((prev) => (prev ? { ...prev, location_sharing_enabled: response.location_sharing_enabled } : null));
                      } catch (err: any) {
                        setError(err.response?.data?.detail || 'Failed to pause trip tracking');
                      } finally {
                        setLocationToggleLoading(false);
                      }
                    }}
                    variant="outline"
                    className="w-full"
                    size="lg"
                    disabled={locationToggleLoading}
                  >
                    {locationToggleLoading ? 'Pausing...' : '⏸ Pause Trip Tracking'}
                  </Button>
                )}
                
                {/* End Trip - Admin only */}
                {user?.role === 'admin' && (
                  <Button
                    onClick={async () => {
                      if (!token || !trip) return;
                      if (!confirm('Are you sure you want to end this trip? This action cannot be undone.')) {
                        return;
                      }
                      try {
                        await updateTrip(token, trip.id, { status: 'completed' });
                        navigate('/trips');
                      } catch (err: any) {
                        setError(err.response?.data?.detail || 'Failed to end trip');
                      }
                    }}
                    className="w-full"
                    size="lg"
                    variant="destructive"
                  >
                    🛑 End Trip
                  </Button>
                )}
              </div>
            )}

            {trip.status === 'completed' && (
              <div className="pt-4">
                <Alert>
                  <AlertDescription>This trip has been completed.</AlertDescription>
                </Alert>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Trip Messages (Chat) - right after tracking controls */}
      <div className="mt-6"><TripChat tripId={trip.id} /></div>

      {/* Info sections below chat */}
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-6">
          {/* Scheduled Times */}
          <div className="border-b pb-6">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Scheduled Start</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.scheduled_start)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Scheduled End</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.scheduled_end)}</dd>
              </div>
              {trip.actual_start && (
                <div className="space-y-1">
                  <dt className="text-sm font-medium text-gray-500">Actual Start</dt>
                  <dd className="text-sm text-gray-900">{formatDate(trip.actual_start)}</dd>
                </div>
              )}
              {trip.actual_end && (
                <div className="space-y-1">
                  <dt className="text-sm font-medium text-gray-500">Actual End</dt>
                  <dd className="text-sm text-gray-900">{formatDate(trip.actual_end)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Transport Contacts */}
          <div className="border-b pb-6 relative z-10">
            <h3 className="text-lg font-semibold mb-4">Transport Contacts</h3>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Transport Agent</dt>
                <dd className="text-sm text-gray-900">
                  {trip.agent_name || 'Not assigned'}
                  {user?.role === 'admin' && trip.agent_passcode && (
                    <div className="text-xs text-gray-500 mt-1">Passcode: {trip.agent_passcode}</div>
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Parent/Guardian</dt>
                <dd className="text-sm text-gray-900">{trip.parent_name || 'Not assigned'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Provider Details</dt>
                <dd className="text-sm text-gray-900">
                  {trip.assigned_clinician_name || trip.clinician_name || 'Not specified'}
                  {trip.clinician_phone && <div className="text-xs text-gray-500 mt-1">{trip.clinician_phone}</div>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Additional Information */}
          {trip.additional_info && (
            <div className="border-b pb-6">
              <h3 className="text-lg font-semibold mb-4">Additional Information</h3>
              <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{trip.additional_info}</p>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Metadata</h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Created At</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.created_at)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>
      <div className="mt-6"><DocumentsSection tripId={trip.id} /></div>
      <footer className="mt-10 text-center text-xs text-white/70 py-6">
        IYT Compass © 2025. All rights reserved.
      </footer>
      </div>
    </div>
  );
};

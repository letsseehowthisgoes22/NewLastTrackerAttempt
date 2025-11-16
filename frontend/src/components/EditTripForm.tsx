import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrip, updateTrip, deleteTrip } from '../api/trips';
import { Trip, TripUpdate } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';

const libraries: ('places')[] = ['places'];

const normalize = (value: string | null | undefined) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const EditTripForm = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pickupAutocomplete, setPickupAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [dropoffAutocomplete, setDropoffAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const [trip, setTrip] = useState<Trip | null>(null);
  const [formData, setFormData] = useState<TripUpdate>({
    client_name: null,
    client_age: null,
    client_build: null,
    transport_relevant_medical_info: null,
    parent_guardian_name: null,
    parent_guardian_relationship: null,
    pickup_location: null,
    dropoff_location: null,
    pickup_lat: null,
    pickup_lng: null,
    dropoff_lat: null,
    dropoff_lng: null,
    scheduled_start: null,
    scheduled_end: null,
    flight_number: null,
    airline: null,
    agent_name: null,
    agent_passcode: null,
    parent_name: null,
    parent_passcode: null,
    clinician_passcode: null,
    clinician_name: null,
    clinician_phone: null,
    clinician_email: null,
    additional_info: null,
    status: null,
  });

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'agent') {
      navigate('/');
      return;
    }

    const fetchTrip = async () => {
      if (!token || !id) return;
      try {
        const tripData = await getTrip(token, parseInt(id));
        setTrip(tripData);
        setFormData({
          client_name: tripData.client_name,
          client_age: tripData.client_age,
          client_build: tripData.client_build,
          transport_relevant_medical_info: tripData.transport_relevant_medical_info,
          parent_guardian_name: tripData.parent_guardian_name,
          parent_guardian_relationship: tripData.parent_guardian_relationship,
          pickup_location: tripData.pickup_location,
          dropoff_location: tripData.dropoff_location,
          pickup_lat: tripData.pickup_lat,
          pickup_lng: tripData.pickup_lng,
          dropoff_lat: tripData.dropoff_lat,
          dropoff_lng: tripData.dropoff_lng,
          scheduled_start: tripData.scheduled_start
            ? new Date(tripData.scheduled_start).toISOString().slice(0, 16)
            : null,
          scheduled_end: tripData.scheduled_end
            ? new Date(tripData.scheduled_end).toISOString().slice(0, 16)
            : null,
          flight_number: tripData.flight_number,
          airline: tripData.airline,
          agent_name: tripData.agent_name,
          agent_passcode: tripData.agent_passcode ?? '',
          parent_name: tripData.parent_name,
          parent_passcode: tripData.parent_passcode ?? '',
          clinician_passcode: tripData.clinician_passcode ?? '',
          clinician_name: tripData.clinician_name,
          clinician_phone: tripData.clinician_phone,
          clinician_email: tripData.clinician_email,
          additional_info: tripData.additional_info,
          status: tripData.status,
        });
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load trip data');
      } finally {
        setLoadingTrip(false);
      }
    };

    fetchTrip();
  }, [token, id, navigate, user]);

  const onPickupLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setPickupAutocomplete(autocomplete);
  };

  const onPickupPlaceChanged = () => {
    if (!pickupAutocomplete) return;
    const place = pickupAutocomplete.getPlace();
    // Only update coordinates if a valid place was selected
    // Allow manual text editing without requiring place selection
    if (place?.geometry?.location) {
      const location = place.geometry.location;
      setFormData((prev) => ({
        ...prev,
        pickup_location: place.formatted_address || prev.pickup_location,
        pickup_lat: location.lat(),
        pickup_lng: location.lng(),
      }));
    }
  };

  const onDropoffLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setDropoffAutocomplete(autocomplete);
  };

  const onDropoffPlaceChanged = () => {
    if (!dropoffAutocomplete) return;
    const place = dropoffAutocomplete.getPlace();
    // Only update coordinates if a valid place was selected
    // Allow manual text editing without requiring place selection
    if (place?.geometry?.location) {
      const location = place.geometry.location;
      setFormData((prev) => ({
        ...prev,
        dropoff_location: place.formatted_address || prev.dropoff_location,
        dropoff_lat: location.lat(),
        dropoff_lng: location.lng(),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!token || !id) throw new Error('Not authenticated');

      const payload: TripUpdate = {
        ...formData,
        client_age: formData.client_age || null,
        client_build: normalize(formData.client_build),
        transport_relevant_medical_info: normalize(formData.transport_relevant_medical_info),
        parent_guardian_name: normalize(formData.parent_guardian_name),
        parent_guardian_relationship: normalize(formData.parent_guardian_relationship),
        agent_name: normalize(formData.agent_name),
        parent_name: normalize(formData.parent_name),
        clinician_name: normalize(formData.clinician_name),
        clinician_phone: normalize(formData.clinician_phone),
        clinician_email: normalize(formData.clinician_email),
        additional_info: normalize(formData.additional_info),
        flight_number: normalize(formData.flight_number),
        airline: normalize(formData.airline),
      };

      const agentPasscode = normalize(formData.agent_passcode);
      if (agentPasscode !== null) {
        payload.agent_passcode = agentPasscode;
      }

      const parentPasscode = normalize(formData.parent_passcode);
      if (parentPasscode !== null) {
        payload.parent_passcode = parentPasscode;
      }

      const clinicianPasscode = normalize(formData.clinician_passcode);
      if (clinicianPasscode !== null) {
        payload.clinician_passcode = clinicianPasscode;
      }

      await updateTrip(token, parseInt(id), payload);
      navigate(`/trips/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update trip');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrip = async () => {
    if (!token || !id || user?.role !== 'admin') return;
    
    setDeleting(true);
    setError('');
    
    try {
      await deleteTrip(token, parseInt(id));
      navigate('/trips');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete trip');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'agent') {
    return null;
  }

  if (loadingTrip || !trip) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-800 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <p className="text-gray-700">Loading trip data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-800 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Card className="shadow-2xl border-0">
        <CardHeader>
          <CardTitle>Edit Trip</CardTitle>
          <CardDescription>Update the transport trip details</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="client_name">Client Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name || ''}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client_age">Age</Label>
                <Input
                  id="client_age"
                  type="number"
                  min="0"
                  max="120"
                  value={formData.client_age || ''}
                  onChange={(e) => setFormData({ ...formData, client_age: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Age"
                />
              </div>
              <div>
                <Label htmlFor="client_build">Build</Label>
                <Input
                  id="client_build"
                  value={formData.client_build || ''}
                  onChange={(e) => setFormData({ ...formData, client_build: e.target.value || null })}
                  placeholder="e.g., Small, Medium, Large, etc."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="transport_relevant_medical_info">Transport Relevant Medical Information</Label>
              <Textarea
                id="transport_relevant_medical_info"
                value={formData.transport_relevant_medical_info || ''}
                onChange={(e) => setFormData({ ...formData, transport_relevant_medical_info: e.target.value || null })}
                placeholder="Enter any medical information relevant to transport (allergies, mobility needs, medications, etc.)"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="parent_guardian_name">Parent/Guardian Name</Label>
                <Input
                  id="parent_guardian_name"
                  value={formData.parent_guardian_name || ''}
                  onChange={(e) => setFormData({ ...formData, parent_guardian_name: e.target.value || null })}
                  placeholder="Full name"
                />
              </div>
              <div>
                <Label htmlFor="parent_guardian_relationship">Relationship to Client</Label>
                <Input
                  id="parent_guardian_relationship"
                  value={formData.parent_guardian_relationship || ''}
                  onChange={(e) => setFormData({ ...formData, parent_guardian_relationship: e.target.value || null })}
                  placeholder="e.g., Mother, Father, Grandmother, etc."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pickup_location">Pickup Location *</Label>
              {isLoaded ? (
                <Autocomplete onLoad={onPickupLoad} onPlaceChanged={onPickupPlaceChanged}>
                  <Input
                    id="pickup_location"
                    value={formData.pickup_location || ''}
                    onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                    placeholder="Start typing an address..."
                    required
                  />
                </Autocomplete>
              ) : (
                <Input
                  id="pickup_location"
                  value={formData.pickup_location || ''}
                  onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                  placeholder="Loading Google Maps..."
                  required
                />
              )}
            </div>

            <div>
              <Label htmlFor="dropoff_location">Dropoff Location *</Label>
              {isLoaded ? (
                <Autocomplete onLoad={onDropoffLoad} onPlaceChanged={onDropoffPlaceChanged}>
                  <Input
                    id="dropoff_location"
                    value={formData.dropoff_location || ''}
                    onChange={(e) => setFormData({ ...formData, dropoff_location: e.target.value })}
                    placeholder="Start typing an address..."
                    required
                  />
                </Autocomplete>
              ) : (
                <Input
                  id="dropoff_location"
                  value={formData.dropoff_location || ''}
                  onChange={(e) => setFormData({ ...formData, dropoff_location: e.target.value })}
                  placeholder="Loading Google Maps..."
                  required
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduled_start">Scheduled Start *</Label>
                <Input
                  id="scheduled_start"
                  type="datetime-local"
                  value={formData.scheduled_start || ''}
                  onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="scheduled_end">Scheduled End</Label>
                <Input
                  id="scheduled_end"
                  type="datetime-local"
                  value={formData.scheduled_end || ''}
                  onChange={(e) => setFormData({ ...formData, scheduled_end: e.target.value ? e.target.value : null })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="flight_number">Flight Number</Label>
                <Input
                  id="flight_number"
                  value={formData.flight_number || ''}
                  onChange={(e) => setFormData({ ...formData, flight_number: e.target.value })}
                  placeholder="e.g., UA1234"
                />
              </div>
              <div>
                <Label htmlFor="airline">Airline</Label>
                <Input
                  id="airline"
                  value={formData.airline || ''}
                  onChange={(e) => setFormData({ ...formData, airline: e.target.value })}
                  placeholder="e.g., United Airlines"
                />
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Role Access & Passcodes</p>
              <p className="text-xs text-gray-500">
                Update the display name and passcode for each role. Leave passcode blank to keep the existing one.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="agent_name">Agent Name</Label>
                  <Input
                    id="agent_name"
                    value={formData.agent_name || ''}
                    onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                    placeholder="Transport Agent"
                  />
                </div>
                <div>
                  <Label htmlFor="agent_passcode">Agent Passcode</Label>
                  <Input
                    id="agent_passcode"
                    value={formData.agent_passcode || ''}
                    onChange={(e) => setFormData({ ...formData, agent_passcode: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parent_name">Parent/Guardian Name</Label>
                  <Input
                    id="parent_name"
                    value={formData.parent_name || ''}
                    onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="parent_passcode">Parent/Guardian Passcode</Label>
                  <Input
                    id="parent_passcode"
                    value={formData.parent_passcode || ''}
                    onChange={(e) => setFormData({ ...formData, parent_passcode: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinician_name">Provider/Clinician Name</Label>
                  <Input
                    id="clinician_name"
                    value={formData.clinician_name || ''}
                    onChange={(e) => setFormData({ ...formData, clinician_name: e.target.value })}
                    placeholder="Dr. Taylor"
                  />
                </div>
                <div>
                  <Label htmlFor="clinician_passcode">Provider/Clinician Passcode</Label>
                  <Input
                    id="clinician_passcode"
                    value={formData.clinician_passcode || ''}
                    onChange={(e) => setFormData({ ...formData, clinician_passcode: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="clinician_phone">Provider Phone</Label>
                <Input
                  id="clinician_phone"
                  value={formData.clinician_phone || ''}
                  onChange={(e) => setFormData({ ...formData, clinician_phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <Label htmlFor="clinician_email">Provider Email</Label>
                <Input
                  id="clinician_email"
                  type="email"
                  value={formData.clinician_email || ''}
                  onChange={(e) => setFormData({ ...formData, clinician_email: e.target.value })}
                  placeholder="provider@email.com"
                />
              </div>
              <div>
                <Label htmlFor="additional_info">Additional Info</Label>
                <Input
                  id="additional_info"
                  value={formData.additional_info || ''}
                  onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
                  placeholder="Notes or special instructions"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Trip'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/trips/${id}`)}>
                Cancel
              </Button>
            </div>
          </form>

          {user?.role === 'admin' && (
            <div className="mt-8 pt-8 border-t border-red-200">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-2">Admin Actions</p>
                  
                  <div className="space-y-3">
                    {/* Delete Trip Button */}
                    <div>
                      {!showDeleteConfirm ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={deleting}
                        >
                          {deleting ? 'Deleting...' : 'Delete Trip'}
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteTrip}
                            disabled={deleting}
                          >
                            {deleting ? 'Deleting...' : 'Confirm Delete Trip'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleting}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-red-600 mt-1">
                        Warning: This will permanently delete this trip and all associated data
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createTrip } from '../api/trips';
import { TripCreate } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';

const libraries: ('places')[] = ['places'];

const normalize = (value: string | null | undefined) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const CreateTripForm = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [pickupAutocomplete, setPickupAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [dropoffAutocomplete, setDropoffAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  const [formData, setFormData] = useState<TripCreate>({
    client_name: '',
    pickup_location: '',
    dropoff_location: '',
    pickup_lat: null,
    pickup_lng: null,
    dropoff_lat: null,
    dropoff_lng: null,
    scheduled_start: '',
    scheduled_end: null,
    flight_number: null,
    airline: null,
    agent_name: '',
    agent_passcode: '',
    parent_name: '',
    parent_passcode: '',
    clinician_passcode: '',
    clinician_name: '',
    clinician_phone: null,
    clinician_email: null,
    additional_info: null,
  });

  const onPickupLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setPickupAutocomplete(autocomplete);
  };

  const onPickupPlaceChanged = () => {
    if (!pickupAutocomplete) return;
    const place = pickupAutocomplete.getPlace();
    if (!place?.geometry?.location) return;
    const location = place.geometry.location;
    setFormData((prev) => ({
      ...prev,
      pickup_location: place.formatted_address || '',
      pickup_lat: location.lat(),
      pickup_lng: location.lng(),
    }));
  };

  const onDropoffLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setDropoffAutocomplete(autocomplete);
  };

  const onDropoffPlaceChanged = () => {
    if (!dropoffAutocomplete) return;
    const place = dropoffAutocomplete.getPlace();
    if (!place?.geometry?.location) return;
    const location = place.geometry.location;
    setFormData((prev) => ({
      ...prev,
      dropoff_location: place.formatted_address || '',
      dropoff_lat: location.lat(),
      dropoff_lng: location.lng(),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!token) throw new Error('Not authenticated');

      const agentPasscode = normalize(formData.agent_passcode);
      const parentPasscode = normalize(formData.parent_passcode);

      if (!agentPasscode) {
        throw new Error('Agent passcode is required');
      }
      if (!parentPasscode) {
        throw new Error('Parent passcode is required');
      }

      const payload: TripCreate = {
        ...formData,
        agent_name: normalize(formData.agent_name),
        agent_passcode: agentPasscode,
        parent_name: normalize(formData.parent_name),
        parent_passcode: parentPasscode,
        clinician_passcode: normalize(formData.clinician_passcode),
        clinician_name: normalize(formData.clinician_name),
        clinician_phone: normalize(formData.clinician_phone),
        clinician_email: normalize(formData.clinician_email),
        additional_info: normalize(formData.additional_info),
        flight_number: normalize(formData.flight_number),
        airline: normalize(formData.airline),
      };

      if (!payload.agent_name) {
        throw new Error('Agent name is required');
      }
      if (!payload.parent_name) {
        throw new Error('Parent/guardian name is required');
      }

      await createTrip(token, payload);
      navigate('/trips');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Trip</CardTitle>
          <CardDescription>Define the transport details and assign access codes.</CardDescription>
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
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="pickup_location">Pickup Location *</Label>
              {isLoaded ? (
                <Autocomplete onLoad={onPickupLoad} onPlaceChanged={onPickupPlaceChanged}>
                  <Input
                    id="pickup_location"
                    value={formData.pickup_location}
                    onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                    placeholder="Start typing an address..."
                    required
                  />
                </Autocomplete>
              ) : (
                <Input
                  id="pickup_location"
                  value={formData.pickup_location}
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
                    value={formData.dropoff_location}
                    onChange={(e) => setFormData({ ...formData, dropoff_location: e.target.value })}
                    placeholder="Start typing an address..."
                    required
                  />
                </Autocomplete>
              ) : (
                <Input
                  id="dropoff_location"
                  value={formData.dropoff_location}
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
                  value={formData.scheduled_start}
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
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_end: e.target.value ? e.target.value : null })
                  }
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
                Enter the name you want displayed and the passcode you will give each person. Passcodes can be
                reused and rotated whenever needed.
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
                    placeholder="e.g., agent2025"
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
                    placeholder="e.g., family123"
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
                    placeholder="e.g., provider89"
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
                {loading ? 'Creating...' : 'Create Trip'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/trips')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

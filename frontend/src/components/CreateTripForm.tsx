import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createTrip, getUsersByRole } from '../api/trips';
import { User, TripCreate } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';

const libraries: ("places")[] = ["places"];

export const CreateTripForm = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<User[]>([]);
  const [parents, setParents] = useState<User[]>([]);
  const [clinicians, setClinicians] = useState<User[]>([]);
  
  const [pickupAutocomplete, setPickupAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [dropoffAutocomplete, setDropoffAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

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
    assigned_agent_id: null,
    assigned_parent_id: null,
    assigned_clinician_id: null,
    clinician_name: null,
    clinician_phone: null,
    clinician_email: null,
    additional_info: null,
  });

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    const fetchUsers = async () => {
      if (!token) return;
      
      try {
        const [agentsData, parentsData, cliniciansData] = await Promise.all([
          getUsersByRole(token, 'agent'),
          getUsersByRole(token, 'parent'),
          getUsersByRole(token, 'clinician'),
        ]);
        setAgents(agentsData);
        setParents(parentsData);
        setClinicians(cliniciansData);
      } catch (err) {
        setError('Failed to load users');
      }
    };

    fetchUsers();
  }, [token, user, navigate]);

  const onPickupLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setPickupAutocomplete(autocomplete);
  };

  const onPickupPlaceChanged = () => {
    if (pickupAutocomplete) {
      const place = pickupAutocomplete.getPlace();
      if (place.geometry?.location) {
        setFormData(prev => ({
          ...prev,
          pickup_location: place.formatted_address || '',
          pickup_lat: place.geometry!.location!.lat(),
          pickup_lng: place.geometry!.location!.lng(),
        }));
      }
    }
  };

  const onDropoffLoad = (autocomplete: google.maps.places.Autocomplete) => {
    setDropoffAutocomplete(autocomplete);
  };

  const onDropoffPlaceChanged = () => {
    if (dropoffAutocomplete) {
      const place = dropoffAutocomplete.getPlace();
      if (place.geometry?.location) {
        setFormData(prev => ({
          ...prev,
          dropoff_location: place.formatted_address || '',
          dropoff_lat: place.geometry!.location!.lat(),
          dropoff_lng: place.geometry!.location!.lng(),
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!token) {
        throw new Error('Not authenticated');
      }

      await createTrip(token, formData);
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
          <CardDescription>Fill in the details to create a new transport trip</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                <Autocomplete
                  onLoad={onPickupLoad}
                  onPlaceChanged={onPickupPlaceChanged}
                >
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
                <Autocomplete
                  onLoad={onDropoffLoad}
                  onPlaceChanged={onDropoffPlaceChanged}
                >
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
                  onChange={(e) => setFormData({ ...formData, scheduled_end: e.target.value || null })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="flight_number">Flight Number</Label>
                <Input
                  id="flight_number"
                  value={formData.flight_number || ''}
                  onChange={(e) => setFormData({ ...formData, flight_number: e.target.value || null })}
                  placeholder="e.g., UA1234"
                />
              </div>

              <div>
                <Label htmlFor="airline">Airline</Label>
                <Input
                  id="airline"
                  value={formData.airline || ''}
                  onChange={(e) => setFormData({ ...formData, airline: e.target.value || null })}
                  placeholder="e.g., United Airlines"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="assigned_agent_id">Assign Agent</Label>
              <Select
                value={formData.assigned_agent_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, assigned_agent_id: value ? parseInt(value) : null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id.toString()}>
                      {agent.first_name} {agent.last_name} ({agent.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="assigned_parent_id">Assign Parent/Guardian</Label>
              <Select
                value={formData.assigned_parent_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, assigned_parent_id: value ? parseInt(value) : null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent/guardian" />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id.toString()}>
                      {parent.first_name} {parent.last_name} ({parent.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="assigned_clinician_id">Assign Clinician (Optional)</Label>
              <Select
                value={formData.assigned_clinician_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, assigned_clinician_id: value ? parseInt(value) : null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a clinician" />
                </SelectTrigger>
                <SelectContent>
                  {clinicians.map((clinician) => (
                    <SelectItem key={clinician.id} value={clinician.id.toString()}>
                      {clinician.first_name} {clinician.last_name} ({clinician.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="clinician_name">Clinician Name</Label>
                <Input
                  id="clinician_name"
                  value={formData.clinician_name || ''}
                  onChange={(e) => setFormData({ ...formData, clinician_name: e.target.value || null })}
                  placeholder="Dr. Smith"
                />
              </div>

              <div>
                <Label htmlFor="clinician_phone">Clinician Phone</Label>
                <Input
                  id="clinician_phone"
                  value={formData.clinician_phone || ''}
                  onChange={(e) => setFormData({ ...formData, clinician_phone: e.target.value || null })}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <Label htmlFor="clinician_email">Clinician Email</Label>
                <Input
                  id="clinician_email"
                  type="email"
                  value={formData.clinician_email || ''}
                  onChange={(e) => setFormData({ ...formData, clinician_email: e.target.value || null })}
                  placeholder="doctor@clinic.com"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="additional_info">Additional Information</Label>
              <textarea
                id="additional_info"
                className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.additional_info || ''}
                onChange={(e) => setFormData({ ...formData, additional_info: e.target.value || null })}
                placeholder="Any additional notes or special instructions..."
              />
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

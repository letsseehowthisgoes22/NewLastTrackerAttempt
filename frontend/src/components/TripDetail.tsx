import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrip } from '../api/trips';
import { Trip } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const TripDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

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
  }, [token, id]);

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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p>Loading trip details...</p>
      </div>
    );
  }

  if (error) {
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
        <p>Trip not found</p>
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
              <CardTitle>Trip Details</CardTitle>
              <CardDescription>Trip ID: {trip.id}</CardDescription>
            </div>
            <Badge className={getStatusBadgeColor(trip.status)}>
              {trip.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Client Information</h3>
            <dl className="grid grid-cols-1 gap-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Client Name</dt>
                <dd className="text-sm text-gray-900">{trip.client_name}</dd>
              </div>
            </dl>
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
              <div>
                <dt className="text-sm font-medium text-gray-500">Scheduled Start</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.scheduled_start)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Scheduled End</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.scheduled_end)}</dd>
              </div>
              {trip.actual_start && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Actual Start</dt>
                  <dd className="text-sm text-gray-900">{formatDate(trip.actual_start)}</dd>
                </div>
              )}
              {trip.actual_end && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Actual End</dt>
                  <dd className="text-sm text-gray-900">{formatDate(trip.actual_end)}</dd>
                </div>
              )}
            </dl>
          </div>

          {(trip.flight_number || trip.airline) && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-3">Flight Information</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trip.flight_number && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Flight Number</dt>
                    <dd className="text-sm text-gray-900">{trip.flight_number}</dd>
                  </div>
                )}
                {trip.airline && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Airline</dt>
                    <dd className="text-sm text-gray-900">{trip.airline}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Assigned Personnel</h3>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Transport Agent</dt>
                <dd className="text-sm text-gray-900">{trip.agent_name || 'Not assigned'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Parent/Guardian</dt>
                <dd className="text-sm text-gray-900">{trip.parent_name || 'Not assigned'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Clinician</dt>
                <dd className="text-sm text-gray-900">{trip.clinician_name || 'Not assigned'}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Additional Information</h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Created At</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-900">{formatDate(trip.updated_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t pt-6">
            <p className="text-sm text-gray-600">
              Future features will include real-time location tracking, document uploads, and messaging capabilities.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

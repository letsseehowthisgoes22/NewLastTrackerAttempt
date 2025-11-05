import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrips } from '../api/trips';
import { Trip } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const TripsList = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchTrips = async () => {
      if (!token) return;

      try {
        const data = await getTrips(token);
        setTrips(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load trips');
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, [token]);

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMs < 0) {
      const absDays = Math.abs(diffDays);
      const absHours = Math.abs(diffHours);
      if (absDays > 0) return `${absDays} day${absDays !== 1 ? 's' : ''} ago`;
      if (absHours > 0) return `${absHours} hour${absHours !== 1 ? 's' : ''} ago`;
      return 'Just now';
    }

    if (diffDays > 0) return `Starts in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    if (diffHours > 0) return `Starts in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    if (diffMinutes > 0) return `Starts in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    return 'Starting soon';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p>Loading trips...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>
                {user?.role === 'admin' ? 'All Trips' : 'My Trips'}
              </CardTitle>
              <CardDescription>
                {user?.role === 'admin' 
                  ? 'Manage all transport trips in the system'
                  : 'View trips assigned to you'}
              </CardDescription>
            </div>
            {user?.role === 'admin' && (
              <Button onClick={() => navigate('/trips/create')}>
                Create Trip
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {trips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No trips found.</p>
              {user?.role === 'admin' && (
                <Button 
                  onClick={() => navigate('/trips/create')} 
                  className="mt-4"
                  variant="outline"
                >
                  Create Your First Trip
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trips.map((trip) => (
                <Card key={trip.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{trip.client_name}</CardTitle>
                      <Badge className={getStatusBadgeColor(trip.status)}>
                        {trip.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm text-gray-500">
                      {getRelativeTime(trip.scheduled_start)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Pickup:</span>
                        <p className="text-gray-600 truncate">{trip.pickup_location}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Dropoff:</span>
                        <p className="text-gray-600 truncate">{trip.dropoff_location}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Date:</span>
                        <p className="text-gray-600">{formatDate(trip.scheduled_start)}</p>
                      </div>
                      {user?.role === 'admin' && trip.agent_name && (
                        <div>
                          <span className="font-medium text-gray-700">Agent:</span>
                          <p className="text-gray-600">{trip.agent_name}</p>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/trips/${trip.id}`);
                      }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

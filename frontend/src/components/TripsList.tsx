import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTrips } from '../api/trips';
import { Trip } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Dropoff</TableHead>
                    <TableHead>Scheduled Start</TableHead>
                    <TableHead>Status</TableHead>
                    {user?.role === 'admin' && <TableHead>Agent</TableHead>}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((trip) => (
                    <TableRow key={trip.id} className="cursor-pointer hover:bg-gray-50">
                      <TableCell className="font-medium">{trip.client_name}</TableCell>
                      <TableCell className="max-w-xs truncate">{trip.pickup_location}</TableCell>
                      <TableCell className="max-w-xs truncate">{trip.dropoff_location}</TableCell>
                      <TableCell>{formatDate(trip.scheduled_start)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusBadgeColor(trip.status)}>
                          {trip.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      {user?.role === 'admin' && (
                        <TableCell>{trip.agent_name || 'Unassigned'}</TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/trips/${trip.id}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

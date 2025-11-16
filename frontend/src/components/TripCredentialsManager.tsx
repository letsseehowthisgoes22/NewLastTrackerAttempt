import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTrips, updateTripCredentials } from '../api/trips';
import { Trip } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CredentialSet {
  agent_name: string;
  agent_passcode: string;
  parent_name: string;
  parent_passcode: string;
  clinician_name: string;
  clinician_passcode: string;
}

export const TripCredentialsManager = () => {
  const { token, user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCredentials, setEditingCredentials] = useState<CredentialSet>({
    agent_name: '',
    agent_passcode: '',
    parent_name: '',
    parent_passcode: '',
    clinician_name: '',
    clinician_passcode: '',
  });

  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetchTrips();
  }, [token, user]);

  const fetchTrips = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getTrips(token);
      setTrips(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (trip: Trip) => {
    setEditingId(trip.id);
    setEditingCredentials({
      agent_name: trip.agent_name || '',
      agent_passcode: trip.agent_passcode || '',
      parent_name: trip.parent_name || '',
      parent_passcode: trip.parent_passcode || '',
      clinician_name: trip.clinician_name || '',
      clinician_passcode: trip.clinician_passcode || '',
    });
    setError('');
    setSuccess('');
  };

  const handleSave = async (tripId: number) => {
    if (!token) return;
    setError('');
    setSuccess('');
    try {
      await updateTripCredentials(token, tripId, editingCredentials);
      setSuccess('Credentials updated successfully');
      setEditingId(null);
      await fetchTrips();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update credentials');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setError('');
    setSuccess('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Access denied. Admin only.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Trip Credentials Management</CardTitle>
          <CardDescription>
            View and edit login credentials (names and passcodes) for all trips. 
            Each role (Agent, Parent, Clinician) uses a dropdown login, but different passcodes create different user profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(error || success) && (
            <div className="mb-4">
              {error && (
                <Alert variant="destructive" className="mb-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="mb-2 bg-green-50 border-green-200">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">Loading trips...</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No trips found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip ID</TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Clinician</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-medium">{trip.id}</TableCell>
                      <TableCell>{trip.client_name}</TableCell>
                      <TableCell>{formatDate(trip.scheduled_start)}</TableCell>
                      <TableCell>
                        <Badge variant={trip.status === 'completed' ? 'secondary' : 'default'}>
                          {trip.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editingId === trip.id ? (
                          <div className="space-y-1">
                            <Input
                              value={editingCredentials.agent_name}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, agent_name: e.target.value })
                              }
                              placeholder="Agent name"
                              className="h-8 text-xs"
                            />
                            <Input
                              type="password"
                              value={editingCredentials.agent_passcode}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, agent_passcode: e.target.value })
                              }
                              placeholder="Passcode"
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : (
                          <div className="text-xs">
                            <div className="font-medium">{trip.agent_name || 'Not set'}</div>
                            <div className="text-gray-500 font-mono">
                              {trip.agent_passcode || 'No passcode'}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === trip.id ? (
                          <div className="space-y-1">
                            <Input
                              value={editingCredentials.parent_name}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, parent_name: e.target.value })
                              }
                              placeholder="Parent name"
                              className="h-8 text-xs"
                            />
                            <Input
                              type="password"
                              value={editingCredentials.parent_passcode}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, parent_passcode: e.target.value })
                              }
                              placeholder="Passcode"
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : (
                          <div className="text-xs">
                            <div className="font-medium">{trip.parent_name || 'Not set'}</div>
                            <div className="text-gray-500 font-mono">
                              {trip.parent_passcode || 'No passcode'}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === trip.id ? (
                          <div className="space-y-1">
                            <Input
                              value={editingCredentials.clinician_name}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, clinician_name: e.target.value })
                              }
                              placeholder="Clinician name"
                              className="h-8 text-xs"
                            />
                            <Input
                              type="password"
                              value={editingCredentials.clinician_passcode}
                              onChange={(e) =>
                                setEditingCredentials({ ...editingCredentials, clinician_passcode: e.target.value })
                              }
                              placeholder="Passcode"
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : (
                          <div className="text-xs">
                            <div className="font-medium">{trip.clinician_name || 'Not set'}</div>
                            <div className="text-gray-500 font-mono">
                              {trip.clinician_passcode || 'No passcode'}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === trip.id ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleSave(trip.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancel}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleEdit(trip)}>
                            Edit
                          </Button>
                        )}
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


import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNotificationSettings, saveNotificationSettings, NotificationRecipient } from '../api/trips';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TripNotificationSettings() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!token || !id) return;
      try {
        const data = await getNotificationSettings(token, parseInt(id));
        setRecipients(Array.isArray(data.recipients) ? data.recipients : []);
      } catch (e: any) {
        setError(e.response?.data?.detail || 'Failed to load recipients');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, id]);

  if (!token || !user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-800 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <p className="text-gray-700">Loading notification settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-800 py-8">
      <div className="max-w-4xl mx-auto px-4">
      <div className="flex justify-between items-center mb-4">
        <Button onClick={() => navigate(`/trips/${id}`)} variant="outline">
          ← Back to Trip
        </Button>
        <div className="text-lg font-semibold">Notification Settings</div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Add recipients for specific events. If no recipients are listed, no notifications are sent for that event.
      </p>

      <div className="space-y-6">
        {(['trip_started','sixty_miles','complete'] as const).map((eventKey) => {
          const labelMap: Record<string, string> = {
            trip_started: 'Trip Started',
            sixty_miles: '60 Miles Away',
            complete: 'Transport Complete'
          };
          const rows = recipients.filter(r => r.event === eventKey);
          return (
            <div key={eventKey} className="rounded-lg border p-4 bg-white">
              <div className="font-semibold mb-2">{labelMap[eventKey]}</div>
              <div className="space-y-2">
                {rows.length === 0 && <div className="text-sm text-gray-500">No recipients</div>}
                {rows.map((r, idx) => (
                  <div key={r.id ?? `${eventKey}-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                    <input className="border rounded px-2 py-1 md:col-span-1" placeholder="Name" value={r.name ?? ''} onChange={(e) => {
                      const next = recipients.slice();
                      const i = next.indexOf(r);
                      next[i] = { ...r, name: e.target.value };
                      setRecipients(next);
                    }} />
                    <input className="border rounded px-2 py-1 md:col-span-2" placeholder="Email" value={r.email ?? ''} onChange={(e) => {
                      const next = recipients.slice();
                      const i = next.indexOf(r);
                      next[i] = { ...r, email: e.target.value };
                      setRecipients(next);
                    }} />
                    <input className="border rounded px-2 py-1 md:col-span-1" placeholder="Phone" value={r.phone ?? ''} onChange={(e) => {
                      const next = recipients.slice();
                      const i = next.indexOf(r);
                      next[i] = { ...r, phone: e.target.value };
                      setRecipients(next);
                    }} />
                    <div className="flex items-center gap-3 md:col-span-1">
                      <label className="text-sm flex items-center gap-1">
                        <input type="checkbox" checked={r.send_email} onChange={(e) => {
                          const next = recipients.slice();
                          const i = next.indexOf(r);
                          next[i] = { ...r, send_email: e.target.checked };
                          setRecipients(next);
                        }} />
                        Email
                      </label>
                      <label className="text-sm flex items-center gap-1">
                        <input type="checkbox" checked={r.send_sms} onChange={(e) => {
                          const next = recipients.slice();
                          const i = next.indexOf(r);
                          next[i] = { ...r, send_sms: e.target.checked };
                          setRecipients(next);
                        }} />
                        SMS
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const next = recipients.filter(x => x !== r);
                          setRecipients(next);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => {
                  setRecipients(prev => [...prev, { event: eventKey, name: '', email: '', phone: '', send_email: true, send_sms: false }]);
                }}>
                  Add Recipient
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-6">
        <Button
          onClick={async () => {
            if (!token || !id) return;
            setSaving(true);
            setError('');
            try {
              await saveNotificationSettings(token, parseInt(id), recipients);
            } catch (e: any) {
              setError(e.response?.data?.detail || 'Failed to save recipients');
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </div>
      </div>
    </div>
  );
}



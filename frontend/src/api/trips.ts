import axios from 'axios';
import { Trip, TripCreate, TripUpdate, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://10.201.82.252:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createTrip = async (token: string, tripData: TripCreate): Promise<Trip> => {
  const response = await api.post<Trip>('/api/trips', tripData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getTrips = async (token: string): Promise<Trip[]> => {
  const response = await api.get<Trip[]>('/api/trips', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getTrip = async (token: string, tripId: number): Promise<Trip> => {
  const response = await api.get<Trip>(`/api/trips/${tripId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const updateTrip = async (token: string, tripId: number, tripData: TripUpdate): Promise<Trip> => {
  const response = await api.put<Trip>(`/api/trips/${tripId}`, tripData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationResponse {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  seconds_ago?: number;
}

export const postLocation = async (token: string, tripId: number, location: LocationUpdate): Promise<any> => {
  const response = await api.post(`/api/trips/${tripId}/location`, location, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getLatestLocation = async (token: string, tripId: number): Promise<LocationResponse> => {
  const response = await api.get<LocationResponse>(`/api/trips/${tripId}/location/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getLocationHistory = async (token: string, tripId: number, limit: number = 100): Promise<{ locations: LocationResponse[] }> => {
  const response = await api.get(`/api/trips/${tripId}/location/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: { limit },
  });
  return response.data;
};

export const deleteTrip = async (token: string, tripId: number): Promise<void> => {
  await api.delete(`/api/trips/${tripId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const setLocationSharing = async (token: string, tripId: number, enabled: boolean): Promise<{ success: boolean; location_sharing_enabled: boolean }> => {
  const response = await api.post<{ success: boolean; location_sharing_enabled: boolean }>(
    `/api/trips/${tripId}/location-sharing`,
    { enabled },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getUsersByRole = async (token: string, role: string): Promise<User[]> => {
  const response = await api.get<User[]>(`/api/users?role=${role}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export interface FlightInfo {
  flight_number: string;
  airline: string;
  status: string;
  departure_airport: string;
  departure_gate?: string;
  departure_time?: string;
  arrival_airport: string;
  arrival_gate?: string;
  arrival_time?: string;
  current_position?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
  };
}

export const getFlightInfo = async (token: string, tripId: number): Promise<FlightInfo> => {
  const response = await api.get<FlightInfo>(`/api/trips/${tripId}/flight`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export interface TrackingMode {
  mode: 'gps' | 'flight' | 'unknown';
  timestamp: string;
}

export const getTrackingMode = async (token: string, tripId: number): Promise<TrackingMode> => {
  const response = await api.get<TrackingMode>(`/api/trips/${tripId}/tracking-mode`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export interface MessageSender {
  id: number;
  name: string;
  role: string;
}

export interface Message {
  id: number;
  sender: MessageSender;
  message: string;
  sent_at: string;
  read: boolean;
  is_mine: boolean;
}

export interface MessagesResponse {
  messages: Message[];
  count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export const postMessage = async (token: string, tripId: number, message: string): Promise<Message> => {
  const response = await api.post<Message>(`/api/trips/${tripId}/messages`, 
    { message },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getMessages = async (
  token: string, 
  tripId: number, 
  limit?: number, 
  since?: string
): Promise<MessagesResponse> => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (since) params.append('since', since);
  
  const response = await api.get<MessagesResponse>(
    `/api/trips/${tripId}/messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const markMessageRead = async (token: string, messageId: number): Promise<{ success: boolean }> => {
  const response = await api.put<{ success: boolean }>(`/api/messages/${messageId}/read`, 
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getUnreadCount = async (token: string, tripId: number): Promise<UnreadCountResponse> => {
  const response = await api.get<UnreadCountResponse>(`/api/trips/${tripId}/messages/unread`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const takeoverChat = async (token: string, tripId: number): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>(
    `/api/trips/${tripId}/chat/takeover`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const releaseChat = async (token: string, tripId: number): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>(
    `/api/trips/${tripId}/chat/release`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const clearTripMessages = async (token: string, tripId: number): Promise<{ message: string }> => {
  const response = await api.delete<{ message: string }>(
    `/api/trips/${tripId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

// ----- Milestones & Notifications -----

export interface MilestoneUpdatePayload {
  milestone: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  confirm?: boolean;
}

export interface NotificationRecipient {
  id?: number;
  event: 'trip_started' | 'sixty_miles' | 'complete';
  name?: string;
  email?: string;
  phone?: string;
  send_email: boolean;
  send_sms: boolean;
}

export interface NotificationSettingsResponse {
  trip_id: number;
  recipients: NotificationRecipient[];
}

export const updateMilestone = async (
  token: string,
  tripId: number,
  payload: MilestoneUpdatePayload
): Promise<any> => {
  const response = await api.put(
    `/api/trips/${tripId}/milestones`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getNotificationSettings = async (
  token: string,
  tripId: number
): Promise<NotificationSettingsResponse> => {
  const response = await api.get<NotificationSettingsResponse>(
    `/api/trips/${tripId}/notifications`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const saveNotificationSettings = async (
  token: string,
  tripId: number,
  recipients: NotificationRecipient[]
): Promise<NotificationSettingsResponse> => {
  const response = await api.put<NotificationSettingsResponse>(
    `/api/trips/${tripId}/notifications`,
    recipients,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export interface StatusHistoryRecord {
  id: number;
  old_status: string;
  new_status: string;
  changed_by: string;
  changed_at: string;
  notes: string;
}

export interface StatusHistoryResponse {
  history: StatusHistoryRecord[];
}

export const updateTripStatus = async (
  token: string, 
  tripId: number, 
  status: string, 
  notes: string = ""
): Promise<{ success: boolean; trip_id: number; status: string }> => {
  const response = await api.put<{ success: boolean; trip_id: number; status: string }>(
    `/api/trips/${tripId}/status`,
    { status, notes },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getStatusHistory = async (token: string, tripId: number): Promise<StatusHistoryResponse> => {
  const response = await api.get<StatusHistoryResponse>(`/api/trips/${tripId}/status-history`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export interface TripCredentials {
  agent_name: string;
  agent_passcode: string;
  parent_name: string;
  parent_passcode: string;
  clinician_name: string;
  clinician_passcode: string;
}

export const updateTripCredentials = async (token: string, tripId: number, credentials: TripCredentials): Promise<Trip> => {
  const response = await api.put<Trip>(`/api/trips/${tripId}/credentials`, credentials, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

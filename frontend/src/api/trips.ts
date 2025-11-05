import axios from 'axios';
import { Trip, TripCreate, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

export const updateTrip = async (token: string, tripId: number, tripData: Partial<TripCreate>): Promise<Trip> => {
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

export const getUsersByRole = async (token: string, role: string): Promise<User[]> => {
  const response = await api.get<User[]>(`/api/users?role=${role}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

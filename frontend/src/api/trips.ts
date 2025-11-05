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

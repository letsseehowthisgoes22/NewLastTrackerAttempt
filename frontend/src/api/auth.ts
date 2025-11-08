import axios from 'axios';
import { LoginResponse, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://10.201.82.252:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const loginWithEmail = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/api/auth/login', { email, password });
  return response.data;
};

const roleEmailMap: Record<string, string> = {
  admin: 'admin@iyt.com',
  agent: 'agent@iyt.com',
};

const buildVirtualEmail = (role: string, passcode: string) => {
  const normalizedRole = role.toLowerCase();
  const safePasscode = passcode.trim().toLowerCase();
  return `${normalizedRole}+${safePasscode}@iyt.com`;
};

export const loginWithRolePasscode = async (role: string, passcode: string): Promise<LoginResponse> => {
  const normalizedRole = role.toLowerCase();
  const email = roleEmailMap[normalizedRole] ?? buildVirtualEmail(normalizedRole, passcode);
  return loginWithEmail(email, passcode);
};

export const getMe = async (token: string): Promise<User> => {
  const response = await api.get<User>('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const logout = async (token: string): Promise<void> => {
  await api.post('/api/auth/logout', {}, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

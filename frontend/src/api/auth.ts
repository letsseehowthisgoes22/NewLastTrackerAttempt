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
  parent: 'parent@iyt.com',
  clinician: 'clinician@iyt.com',
};

const buildVirtualEmail = (role: string, passcode: string) => {
  const normalizedRole = role.toLowerCase();
  const safePasscode = passcode.trim().toLowerCase();
  return `${normalizedRole}+${safePasscode}@iyt.com`;
};

export const loginWithRolePasscode = async (role: string, passcode: string): Promise<LoginResponse> => {
  const normalizedRole = role.toLowerCase();
  const safePasscode = passcode.trim();

  if (!safePasscode) {
    throw new Error('Passcode is required');
  }

  // Always try virtual email first (trip-specific users)
  // This ensures custom passcodes per trip work correctly
  const virtualEmail = buildVirtualEmail(normalizedRole, safePasscode);
  
  try {
    // Try virtual email first (for trip-specific passcodes like "Batman123")
    return await loginWithEmail(virtualEmail, safePasscode);
  } catch (error: any) {
    // If virtual email login fails, try hardcoded test user (for default passcodes like "agent123")
    // Only try hardcoded if it's a 401/403 error (authentication failed)
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      const hardcodedEmail = roleEmailMap[normalizedRole];
      if (hardcodedEmail) {
        try {
          return await loginWithEmail(hardcodedEmail, safePasscode);
        } catch (hardcodedError) {
          // Both failed, throw the original virtual email error
          throw error;
        }
      }
    }
    // If it's not an auth error or no hardcoded user, throw the original error
    throw error;
  }
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

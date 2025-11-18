import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import { loginWithRolePasscode, getMe } from '../api/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifyStoredAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          // Verify the token is still valid by calling the backend
          const currentUser = await getMe(storedToken);
          // If successful, restore the session
          setToken(storedToken);
          setUser(currentUser);
          // Update stored user data in case it changed
          localStorage.setItem('user', JSON.stringify(currentUser));
          
          // CRITICAL: Immediately enforce location rules on session restore
          // If user is NOT an agent, block location tracking
          if (currentUser.role !== 'agent') {
            console.log('[Auth] Session restored - user is not an agent, blocking location tracking');
            sessionStorage.setItem('location_tracking_blocked', 'true');
            sessionStorage.setItem('location_blocked_reason', `User role: ${currentUser.role}`);
          } else {
            sessionStorage.removeItem('location_tracking_blocked');
            sessionStorage.removeItem('location_blocked_reason');
          }
        } catch (error) {
          // Token is invalid or expired, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
          sessionStorage.removeItem('location_tracking_blocked');
          sessionStorage.removeItem('location_blocked_reason');
        }
      }
      setIsLoading(false);
    };

    verifyStoredAuth();
  }, []);

  const login = async (role: string, passcode: string) => {
    try {
      const response = await loginWithRolePasscode(role, passcode);
      setToken(response.token);
      setUser(response.user);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      
      // CRITICAL: Immediately enforce location rules on login
      // If user is NOT an agent, stop any active geolocation tracking immediately
      if (response.user.role !== 'agent') {
        console.log('[Auth] User is not an agent, stopping any active location tracking');
        
        // Clear any active geolocation watches (if navigator.geolocation exists)
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          // We can't enumerate active watches, but we can set a flag
          // Components should check this flag before requesting location
          // Store a flag in sessionStorage to prevent location requests
          sessionStorage.setItem('location_tracking_blocked', 'true');
          sessionStorage.setItem('location_blocked_reason', `User role: ${response.user.role}`);
        }
      } else {
        // Agent users can track location - clear any blocking flags
        sessionStorage.removeItem('location_tracking_blocked');
        sessionStorage.removeItem('location_blocked_reason');
      }
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('location_tracking_blocked');
    sessionStorage.removeItem('location_blocked_reason');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

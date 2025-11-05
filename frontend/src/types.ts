export interface User {
  id: number;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

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

export interface Trip {
  id: number;
  client_name: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  scheduled_start: string;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  flight_number: string | null;
  airline: string | null;
  assigned_agent_id: number | null;
  assigned_parent_id: number | null;
  assigned_clinician_id: number | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
  agent_name: string | null;
  parent_name: string | null;
  clinician_name: string | null;
}

export interface TripCreate {
  client_name: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  scheduled_start: string;
  scheduled_end: string | null;
  flight_number: string | null;
  airline: string | null;
  assigned_agent_id: number | null;
  assigned_parent_id: number | null;
  assigned_clinician_id: number | null;
}

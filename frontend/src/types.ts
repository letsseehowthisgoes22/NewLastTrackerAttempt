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
  login: (role: string, passcode: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

export interface Trip {
  id: number;
  client_name: string;
  client_age: number | null;
  client_build: string | null;
  transport_relevant_medical_info: string | null;
  parent_guardian_name: string | null;
  parent_guardian_relationship: string | null;
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
  agent_name: string | null;
  agent_passcode?: string | null;
  parent_name: string | null;
  parent_passcode?: string | null;
  clinician_passcode?: string | null;
  clinician_name: string | null;
  clinician_phone: string | null;
  clinician_email: string | null;
  additional_info: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
  assigned_clinician_name: string | null;
  chat_admin_takeover?: boolean;
  chat_taken_over_by?: number | null;
  chat_takeover_at?: string | null;
  location_sharing_enabled?: boolean;
  // milestones
  m1_began_route_to_pickup?: boolean;
  m2_arrived_pickup?: boolean;
  m3_en_route_to_destination?: boolean;
  m4_arrived_dropoff?: boolean;
  m5_transport_complete?: boolean;
  milestone_updated_at?: string | null;
  notified_sixty_miles?: boolean;
}

export type MilestoneNumber = 1 | 2 | 3 | 4 | 5;

export interface NotificationRecipient {
  id?: number;
  event: 'trip_started' | 'sixty_miles' | 'complete';
  name?: string;
  email?: string;
  phone?: string;
  send_email: boolean;
  send_sms: boolean;
}

export interface TripCreate {
  client_name: string;
  client_age: number | null;
  client_build: string | null;
  transport_relevant_medical_info: string | null;
  parent_guardian_name: string | null;
  parent_guardian_relationship: string | null;
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
  agent_name: string | null;
  agent_passcode: string | null;
  parent_name: string | null;
  parent_passcode: string | null;
  clinician_passcode: string | null;
  clinician_name: string | null;
  clinician_phone: string | null;
  clinician_email: string | null;
  additional_info: string | null;
  location_sharing_enabled?: boolean | null;
}

export interface TripUpdate {
  client_name?: string | null;
  client_age?: number | null;
  client_build?: string | null;
  transport_relevant_medical_info?: string | null;
  parent_guardian_name?: string | null;
  parent_guardian_relationship?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  flight_number?: string | null;
  airline?: string | null;
  agent_name?: string | null;
  agent_passcode?: string | null;
  parent_name?: string | null;
  parent_passcode?: string | null;
  clinician_passcode?: string | null;
  clinician_name?: string | null;
  clinician_phone?: string | null;
  clinician_email?: string | null;
  additional_info?: string | null;
  status?: string | null;
  location_sharing_enabled?: boolean | null;
}

export interface Document {
  id: number;
  trip_id: number;
  uploaded_by_id: number | null;
  filename: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  uploader_name: string | null;
}

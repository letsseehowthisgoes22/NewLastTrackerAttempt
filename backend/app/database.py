import os
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/iyt_transport")

def get_db_connection():
    """Get a database connection"""
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    return conn

def init_db():
    """Initialize database schema"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            phone VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id SERIAL PRIMARY KEY,
            client_name VARCHAR(255) NOT NULL,
            pickup_location VARCHAR(255) NOT NULL,
            dropoff_location VARCHAR(255) NOT NULL,
            pickup_lat DECIMAL(10, 8),
            pickup_lng DECIMAL(11, 8),
            dropoff_lat DECIMAL(10, 8),
            dropoff_lng DECIMAL(11, 8),
            scheduled_start TIMESTAMP NOT NULL,
            scheduled_end TIMESTAMP,
            actual_start TIMESTAMP,
            actual_end TIMESTAMP,
            status VARCHAR(50) DEFAULT 'scheduled',
            flight_number VARCHAR(50),
            airline VARCHAR(100),
            assigned_agent_id INTEGER REFERENCES users(id),
            assigned_parent_id INTEGER REFERENCES users(id),
            assigned_clinician_id INTEGER REFERENCES users(id),
            clinician_name VARCHAR(255),
            clinician_phone VARCHAR(50),
            clinician_email VARCHAR(255),
            additional_info TEXT,
            created_by_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            location_sharing_enabled BOOLEAN DEFAULT TRUE
        );
    """)
    
    cursor.execute("""
        ALTER TABLE trips 
        ADD COLUMN IF NOT EXISTS clinician_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS clinician_phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS clinician_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS additional_info TEXT,
        ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(50) DEFAULT 'gps',
        ADD COLUMN IF NOT EXISTS chat_admin_takeover BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS chat_taken_over_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS chat_takeover_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS client_age INTEGER,
        ADD COLUMN IF NOT EXISTS client_build VARCHAR(100),
        ADD COLUMN IF NOT EXISTS transport_relevant_medical_info TEXT,
        ADD COLUMN IF NOT EXISTS parent_guardian_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS parent_guardian_relationship VARCHAR(100);
    """)

    # Milestones and 60-mile notification flags
    cursor.execute("""
        ALTER TABLE trips 
        ADD COLUMN IF NOT EXISTS m1_began_route_to_pickup BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS m2_arrived_pickup BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS m3_en_route_to_destination BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS m4_arrived_dropoff BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS m5_transport_complete BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS milestone_updated_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS notified_sixty_miles BOOLEAN DEFAULT FALSE;
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS location_updates (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
            agent_id INTEGER REFERENCES users(id),
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            accuracy DECIMAL(10, 2),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            source VARCHAR(50) DEFAULT 'gps'
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
            uploaded_by_id INTEGER REFERENCES users(id),
            filename VARCHAR(255) NOT NULL,
            file_url VARCHAR(500) NOT NULL,
            file_type VARCHAR(50),
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES users(id),
            message_text TEXT NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_by_recipient BOOLEAN DEFAULT FALSE
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS client_notes (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
            created_by_id INTEGER REFERENCES users(id),
            note_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trip_status_history (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
            changed_by_id INTEGER REFERENCES users(id),
            old_status VARCHAR(50),
            new_status VARCHAR(50),
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notification_preferences (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) UNIQUE,
            email_trip_started BOOLEAN DEFAULT TRUE,
            email_trip_completed BOOLEAN DEFAULT TRUE,
            email_new_message BOOLEAN DEFAULT TRUE,
            email_status_changed BOOLEAN DEFAULT TRUE,
            sms_trip_started BOOLEAN DEFAULT FALSE,
            sms_trip_completed BOOLEAN DEFAULT TRUE,
            sms_new_message BOOLEAN DEFAULT FALSE,
            sms_status_changed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notification_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            trip_id INTEGER REFERENCES trips(id),
            notification_type VARCHAR(50),
            event_type VARCHAR(50),
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN,
            error_message TEXT
        );
    """)
    
    # Per-trip recipients for milestone events
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notification_recipients (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            event VARCHAR(50) NOT NULL, -- 'trip_started' | 'sixty_miles' | 'complete'
            name VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(50),
            send_email BOOLEAN DEFAULT TRUE,
            send_sms BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (trip_id, event, email, phone)
        );
    """)
    
    # Default notification templates for each event type
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notification_templates (
            id SERIAL PRIMARY KEY,
            event VARCHAR(50) UNIQUE NOT NULL, -- 'trip_started' | 'sixty_miles' | 'complete'
            subject_template TEXT NOT NULL,
            body_html_template TEXT NOT NULL,
            body_text_template TEXT NOT NULL,
            is_default BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Insert default templates if they don't exist
    cursor.execute("""
        INSERT INTO notification_templates (event, subject_template, body_html_template, body_text_template)
        VALUES 
            ('trip_started', 'IYT Compass: Trip Started for {client_name}', '<p>Trip for <strong>{client_name}</strong> has begun en route to destination.</p>', 'Trip for {client_name} has begun en route to destination.'),
            ('sixty_miles', 'IYT Compass: 60 Miles from Destination - {client_name}', '<p>The agent is within 60 miles of the destination for <strong>{client_name}</strong>.</p>', 'The agent is within 60 miles of the destination for {client_name}.'),
            ('complete', 'IYT Compass: Transport Complete for {client_name}', '<p>Transport for <strong>{client_name}</strong> is complete.</p>', 'Transport for {client_name} is complete.')
        ON CONFLICT (event) DO NOTHING;
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_trips_agent ON trips(assigned_agent_id);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_trips_parent ON trips(assigned_parent_id);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_trips_clinician ON trips(assigned_clinician_id);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_location_trip ON location_updates(trip_id, timestamp DESC);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_documents_trip ON documents(trip_id);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id, sent_at);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_status_history_trip ON trip_status_history(trip_id, changed_at DESC);
    """)
    
    cursor.execute("""
        INSERT INTO users (email, password, role, first_name, last_name) 
        VALUES
            ('admin@iyt.com', 'admin123', 'admin', 'Admin', 'User'),
            ('agent@iyt.com', 'agent123', 'agent', 'Transport', 'Agent'),
            ('parent@iyt.com', 'parent123', 'parent', 'Parent', 'User'),
            ('clinician@iyt.com', 'clinician123', 'clinician', 'Dr', 'Smith')
        ON CONFLICT (email) DO NOTHING;
    """)
    
    cursor.execute("""
        INSERT INTO trips (client_name, pickup_location, dropoff_location, scheduled_start, assigned_agent_id, assigned_parent_id, created_by_id)
        SELECT 'John Doe', '123 Main St, Los Angeles, CA', '456 Oak Ave, San Francisco, CA', '2025-11-10 09:00:00', 
               (SELECT id FROM users WHERE email = 'agent@iyt.com'),
               (SELECT id FROM users WHERE email = 'parent@iyt.com'),
               (SELECT id FROM users WHERE email = 'admin@iyt.com')
        WHERE NOT EXISTS (SELECT 1 FROM trips WHERE client_name = 'John Doe');
    """)
    
    conn.commit()
    cursor.close()
    conn.close()
    print("Database initialized successfully!")

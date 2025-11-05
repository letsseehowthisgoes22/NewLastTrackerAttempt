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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    cursor.execute("""
        ALTER TABLE trips 
        ADD COLUMN IF NOT EXISTS clinician_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS clinician_phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS clinician_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS additional_info TEXT;
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

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
        INSERT INTO users (email, password, role, first_name, last_name) 
        VALUES
            ('admin@iyt.com', 'admin123', 'admin', 'Admin', 'User'),
            ('agent@iyt.com', 'agent123', 'agent', 'Transport', 'Agent'),
            ('parent@iyt.com', 'parent123', 'parent', 'Parent', 'User'),
            ('clinician@iyt.com', 'clinician123', 'clinician', 'Dr', 'Smith')
        ON CONFLICT (email) DO NOTHING;
    """)
    
    conn.commit()
    cursor.close()
    conn.close()
    print("Database initialized successfully!")

#!/bin/bash

# Local Development Environment Setup Script
# IYT Compass - Transport Tracking Application

echo "🚀 Setting up local development environment..."
echo ""

# Check if we're in the right directory
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Frontend .env.development
echo "📝 Creating frontend/.env.development..."
cat > frontend/.env.development << 'EOF'
# Local Development Environment Variables
# This file is for LOCAL development only - completely isolated from production

# Backend API URL (FastAPI runs on port 8000 locally)
VITE_API_URL=http://localhost:8000

# WebSocket URL (defaults to VITE_API_URL if not set)
VITE_WS_URL=http://localhost:8000

# Google Maps API Key (required for address autocomplete)
# Get your key from: https://console.cloud.google.com/
# Make sure to restrict it to http://localhost:5173/* for development
VITE_GOOGLE_MAPS_API_KEY=AIzaSyApqAzsIpHvp2ekouOOm8NzM2elKfrvJzw
EOF

# Backend .env.development
echo "📝 Creating backend/.env.development..."
cat > backend/.env.development << 'EOF'
# Local Development Environment Variables
# This file is for LOCAL development only - completely isolated from production

# Database connection (local PostgreSQL)
# Format: postgresql://username:password@host:port/database_name
# Update this with your local PostgreSQL credentials
# Default uses your system username (no password for local development)
DATABASE_URL=postgresql://$(whoami)@localhost:5432/iyt_transport_dev

# JWT Secret (use a strong random string - generate with: openssl rand -hex 32)
# This should be DIFFERENT from production
JWT_SECRET=local_dev_jwt_secret_change_me_openssl_rand_hex_32

# JWT Algorithm
JWT_ALGORITHM=HS256

# AviationStack API Key (for flight tracking)
# Get your key from: https://aviationstack.com/
AVIATIONSTACK_API_KEY=58ff5459d54a5321e967da782fed23b2

# CORS Origins (comma-separated)
# Frontend runs on http://localhost:5173 locally
CORS_ORIGINS=http://localhost:5173
EOF

echo ""
echo "✅ Environment files created!"
echo ""
echo "⚠️  IMPORTANT: Next steps:"
echo ""
echo "1. Frontend Google Maps API key is already configured ✓"
echo "2. Edit backend/.env.development and:"
echo "   - Update DATABASE_URL with your PostgreSQL credentials"
echo "   - Generate a secure JWT_SECRET with: openssl rand -hex 32"
echo "   - AviationStack API key is already configured ✓"
echo ""
echo "3. Copy .env.development to .env for local use:"
echo "   - Frontend: cp frontend/.env.development frontend/.env.local"
echo "   - Backend: cp backend/.env.development backend/.env"
echo ""
echo "4. Follow LOCAL_DEVELOPMENT.md for complete setup instructions"
echo ""


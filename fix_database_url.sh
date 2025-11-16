#!/bin/bash
# Fix DATABASE_URL in backend .env files to use correct username

USERNAME=$(whoami)
DB_URL="postgresql://${USERNAME}@localhost:5432/iyt_transport_dev"

if [ -f "backend/.env.development" ]; then
    sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" backend/.env.development
    echo "✅ Updated backend/.env.development"
fi

if [ -f "backend/.env" ]; then
    sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" backend/.env
    echo "✅ Updated backend/.env"
fi

echo ""
echo "DATABASE_URL set to: ${DB_URL}"
echo ""

#!/bin/bash
set -e

cd ~/green-web/backend

echo "Pull latest backend..."
git pull origin main


echo "Deploy backend with Docker..."
docker compose down
docker compose up -d --build


echo "Docker status..."
docker ps


echo "Docker logs..."
docker compose logs --tail=100


echo "Reload Nginx..."
sudo nginx -t
sudo systemctl reload nginx


echo "Deploy backend selesai."
#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/green-web/backend}"
RUN_BACKEND_SEED="${RUN_BACKEND_SEED:-false}"
RUN_TEST_SEED="${RUN_TEST_SEED:-false}"

cd "$APP_DIR"

echo "Pull latest backend..."
git pull origin main

echo "Deploy backend with Docker..."
docker compose up -d --build

echo "Run database migration once..."
docker compose exec -T backend npm run migrate

if [ "$RUN_BACKEND_SEED" = "true" ]; then
  echo "Run backend seed..."
  docker compose exec -T backend npm run seed
fi

if [ "$RUN_TEST_SEED" = "true" ]; then
  echo "Run test seed..."
  docker compose exec -T backend npm run seed:test
fi

echo "Docker status..."
docker compose ps

echo "Backend logs..."
docker compose logs --tail=100 backend


echo "Reload Nginx..."
sudo nginx -t
sudo systemctl reload nginx


echo "Deploy backend selesai."

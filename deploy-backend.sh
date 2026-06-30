#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/green-web/backend}"
RUN_MIGRATE="${RUN_MIGRATE:-false}"
RUN_BACKEND_SEED="${RUN_BACKEND_SEED:-false}"
RUN_TEST_SEED="${RUN_TEST_SEED:-false}"

cd "$APP_DIR"

echo "Reset local changes..."
git fetch origin main
git reset --hard origin/main
git clean -fd

echo "Deploy backend with Docker..."
docker compose up -d --build

if [ "$RUN_MIGRATE" = "true" ]; then
  echo "Run database migration..."
  docker compose exec -T backend npm run migrate
else
  echo "Skip database migration."
fi

if [ "$RUN_BACKEND_SEED" = "true" ]; then
  echo "Run backend seed..."
  docker compose exec -T backend npm run seed
else
  echo "Skip backend seed."
fi

if [ "$RUN_TEST_SEED" = "true" ]; then
  echo "Run test seed..."
  docker compose exec -T backend npm run seed:test
else
  echo "Skip test seed."
fi

echo "Docker status..."
docker compose ps

echo "Backend logs..."
docker compose logs --tail=100 backend

echo "Reload Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "Deploy backend selesai."
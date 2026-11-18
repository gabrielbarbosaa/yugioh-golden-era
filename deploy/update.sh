#!/usr/bin/env bash
# Atualiza a VPS: baixa o código novo, reconstrói o que mudou e reinicia (as migrações rodam sozinhas na subida da API).
# Uso (dentro da pasta do projeto):  ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Falta o .env.production (copie de .env.production.example e preencha)." >&2
  exit 1
fi

git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f docker-compose.prod.yml --env-file .env.production ps
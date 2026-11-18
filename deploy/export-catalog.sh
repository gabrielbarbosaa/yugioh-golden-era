#!/usr/bin/env bash
# Roda NO SEU COMPUTADOR (com o compose de desenvolvimento no ar): gera catalog.sql com as cartas, sets e prints,
# para importar na VPS sem baixar tudo de novo. As imagens vão à parte (rsync, veja DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T db sh -c 'pg_dump -U golden -d golden_era --data-only -t cards -t card_sets -t card_prints > /tmp/catalog.sql'
docker compose cp db:/tmp/catalog.sql ./catalog.sql
echo "Gerado: catalog.sql ($(wc -c < catalog.sql) bytes)"
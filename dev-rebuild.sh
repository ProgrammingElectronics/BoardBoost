#!/bin/bash
docker compose down
docker compose --progress=plain build web --no-cache
docker compose -f docker-compose.dev.yml up
#!/bin/bash
docker-compose down
docker-compose build web
docker-compose -f docker-compose.dev.yml up
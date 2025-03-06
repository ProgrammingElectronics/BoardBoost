#!/bin/bash
docker-compose down
docker-compose build web
docker-compose up
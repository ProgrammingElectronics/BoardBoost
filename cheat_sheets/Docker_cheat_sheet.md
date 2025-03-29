# Docker Cheat Sheet

## If you are debugging a build, and the steps have already been cached, add --no-cache to your build to rerun the steps and redisplay the output:

docker build --progress=plain --no-cache

## This project

````bash
# Create migrations
docker exec -it boardboost-web python manage.py makemigrations

# Run migrations
docker exec -it boardboost-web python manage.py migrate

# Collect static files
docker exec -it boardboost-web python manage.py collectstatic

## Basic Commands

```bash
# List all running containers
docker ps

# List all containers (including stopped ones)
docker ps -a

# List all Docker images
docker images

# Stop a container
docker stop <container_id_or_name>

# Remove a container
docker rm <container_id_or_name>

# Remove an image
docker rmi <image_id_or_name>

# Pull an image from Docker Hub
docker pull <image_name>:<tag>

# Run a container
docker run <image_name>
````

## Docker Compose

```bash
# Start services defined in docker-compose.yml
docker-compose up

# Start services in detached mode
docker-compose up -d

# Build or rebuild services
docker-compose up --build

# Stop services
docker-compose down

# Stop services and remove volumes
docker-compose down -v

# View running services
docker-compose ps

# View logs for services
docker-compose logs

# View logs for a specific service
docker-compose logs <service_name>

# Execute a command in a running service
docker-compose exec <service_name> <command>
```

## Volume Management

```bash
# List all volumes
docker volume ls

# Create a volume
docker volume create <volume_name>

# Remove a volume
docker volume rm <volume_name>

# Remove all unused volumes
docker volume prune

# Inspect a volume
docker volume inspect <volume_name>
```

## Network Management

```bash
# List all networks
docker network ls

# Create a network
docker network create <network_name>

# Remove a network
docker network rm <network_name>

# Connect a container to a network
docker network connect <network_name> <container_name>

# Disconnect a container from a network
docker network disconnect <network_name> <container_name>
```

## Container Interaction

```bash
# Execute a command in a running container
docker exec -it <container_id_or_name> <command>

# Example: Get a bash shell in a container
docker exec -it <container_id_or_name> bash

# View logs for a container
docker logs <container_id_or_name>

# Follow logs for a container
docker logs -f <container_id_or_name>

# Copy files from container to host
docker cp <container_id>:<path_in_container> <path_on_host>

# Copy files from host to container
docker cp <path_on_host> <container_id>:<path_in_container>
```

## Cleanup Commands

```bash
# Remove all stopped containers
docker container prune

# Remove all unused images
docker image prune

# Remove all unused networks
docker network prune

# Remove all unused volumes
docker volume prune

# Remove all unused objects (containers, images, networks, volumes)
docker system prune

# Remove all unused objects including unused images
docker system prune -a
```

## Debugging

```bash
# Show container resource usage
docker stats

# Inspect container details
docker inspect <container_id_or_name>

# Show container processes
docker top <container_id_or_name>

# Show image history
docker history <image_name>
```

## Dockerfile Building

```bash
# Build an image from a Dockerfile
docker build -t <image_name>:<tag> <path_to_dockerfile_directory>

# Build without using cache
docker build --no-cache -t <image_name>:<tag> <path>

# Tag an image
docker tag <image_id> <new_image_name>:<new_tag>
```

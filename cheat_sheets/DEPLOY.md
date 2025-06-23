# Deploying BoardBoost on Digital Ocean

This guide will walk you through deploying your BoardBoost application on Digital Ocean using Docker.

## Prerequisites

- A Digital Ocean account
- Docker and Docker Compose installed on your local machine
- Your project files ready to deploy

## Setup Instructions

### 1. Prepare your environment files

1. Copy the example environment file:

   ```bash
   cp .env.docker .env
   ```

2. Edit `.env` and add your actual environment variables:
   - Add your OpenAI API key
   - Set DEBUG to False for production
   - Add your domain name to ALLOWED_HOSTS
   - Generate a secure SECRET_KEY

### 2. Test locally with Docker Compose

1. Build and start the containers:

   ```bash
   docker-compose up --build
   ```

2. Visit http://localhost:8000 to verify everything works

### 3. Deploy to Digital Ocean

#### Option 1: Using Digital Ocean App Platform (Recommended for Beta)

1. Install the Digital Ocean CLI (doctl)
2. Authenticate with your Digital Ocean account
3. Deploy using the command:
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

#### Option 2: Using a Digital Ocean Droplet

1. Create a new Droplet on Digital Ocean with Docker pre-installed
2. SSH into your Droplet
3. Clone your repository
4. Set up your environment variables
5. Run Docker Compose:
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

### 4. Set up your domain

1. Point your domain name to your Digital Ocean resource
2. Configure SSL certificates using Let's Encrypt

## Maintenance

- To update your application:

  ```bash
  git pull
  docker-compose down
  docker-compose up --build -d
  ```

- To view logs:
  ```bash
  docker-compose logs -f
  ```

## Troubleshooting

- **Container won't start:** Check the logs using `docker-compose logs web`
- **Static files not loading:** Make sure the NGINX configuration is correct and volumes are properly mounted
- **Database issues:** Check database connectivity and make sure migrations have run

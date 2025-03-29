FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=boardboost_project.settings

# Install system dependencies
RUN apt-get update && apt-get install -y curl wget unzip git

# Create and set working directory
WORKDIR /app

# Copy project files
COPY backend/ .

# Create static files directory
RUN mkdir -p /app/staticfiles

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

WORKDIR /app

# Create non-root user
RUN useradd -m appuser
RUN mkdir -p /home/appuser/.arduino15 /opt/arduino-cli
RUN chown -R appuser:appuser /app /home/appuser/.arduino15 /opt/arduino-cli

# Install Arduino CLI - all in one command for better debugging
RUN echo "Installing Arduino CLI..." && \
  # Download and install Arduino CLI
  curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/opt/arduino-cli sh && \
  # Add to PATH
  ln -s /opt/arduino-cli/arduino-cli /usr/local/bin/ && \
  # Set up for Arduino ESP32
  mkdir -p /root/.arduino15 && \
  echo 'board_manager:\n  additional_urls:\n    - https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json' > /root/.arduino15/arduino-cli.yaml && \
  # Try to install cores
  arduino-cli core update-index && \
  arduino-cli core install arduino:avr && \
  arduino-cli core list && \
  # Make Arduino CLI data accessible to appuser
  mkdir -p /home/appuser/.arduino15 && \
  cp -r /root/.arduino15/* /home/appuser/.arduino15/ && \
  chown -R appuser:appuser /home/appuser/.arduino15

RUN chown -R appuser:appuser /app

# Switch to non-root user for better security
USER appuser

# Expose port
EXPOSE 8000

# Command to run
CMD sh -c "python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:8000 boardboost_project.wsgi:application"
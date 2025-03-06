FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=boardboost_project.settings

# Create and set working directory
WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Copy project
COPY backend/ .

# Create static files directory
RUN mkdir -p /app/staticfiles

# Run as non-root user for better security
RUN useradd -m appuser
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Command to run
CMD sh -c "python manage.py collectstatic --noinput && gunicorn --bind 0.0.0.0:8000 boardboost_project.wsgi:application"
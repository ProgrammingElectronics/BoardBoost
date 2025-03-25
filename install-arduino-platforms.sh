#!/bin/bash
# Script to install Arduino CLI with proper permissions
set -e

echo "Starting Arduino CLI installation and setup..."

# Install prerequisites if needed
if ! command -v curl &> /dev/null; then
    echo "Installing prerequisites..."
    apt-get update && apt-get install -y curl wget
fi

# Create directories with proper permissions
echo "Setting up directories..."
mkdir -p /opt/arduino-cli /home/appuser/.arduino15
chown -R appuser:appuser /opt/arduino-cli /home/appuser/.arduino15

# Install Arduino CLI as appuser
echo "Installing Arduino CLI..."
su - appuser -c "
export ARDUINO_DIRECTORIES_DATA=/home/appuser/.arduino15
export ARDUINO_DIRECTORIES_DOWNLOADS=/home/appuser/.arduino15/staging
export ARDUINO_DIRECTORIES_USER=/home/appuser/Arduino

curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/opt/arduino-cli sh
export PATH=\$PATH:/opt/arduino-cli
echo 'export PATH=\$PATH:/opt/arduino-cli' >> /home/appuser/.bashrc

echo 'Verifying installation...'
/opt/arduino-cli/arduino-cli version

echo 'Initializing config...'
/opt/arduino-cli/arduino-cli config init --overwrite

echo 'Updating index...'
/opt/arduino-cli/arduino-cli core update-index

echo 'Installing AVR platform...'
/opt/arduino-cli/arduino-cli core install arduino:avr

echo 'Attempting to install ESP32 platform...'
/opt/arduino-cli/arduino-cli core install esp32:esp32 || echo 'ESP32 installation failed, continuing'

echo 'Listing installed platforms...'
/opt/arduino-cli/arduino-cli core list
"

# Add Arduino CLI to system PATH
echo "Adding Arduino CLI to system PATH..."
echo 'export PATH=$PATH:/opt/arduino-cli' >> /etc/bash.bashrc
ln -s /opt/arduino-cli/arduino-cli /usr/local/bin/

echo "Arduino CLI setup complete!"
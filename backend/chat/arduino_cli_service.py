import subprocess
import os
import json
import tempfile
import base64
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class ArduinoCliService:
    @staticmethod
    def get_installed_boards():
        """Get list of installed board platforms"""
        try:
            result = subprocess.run(
                ["arduino-cli", "board", "listall", "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            logger.error(f"Error getting boards: {e}")
            raise Exception(f"Could not get board list: {e.stderr}")

    @staticmethod
    def compile_sketch(code, board_fqbn):
        """
        Compile Arduino sketch code for a specific board

        Args:
            code: The Arduino sketch code
            board_fqbn: Fully Qualified Board Name (e.g., "arduino:avr:uno")

        Returns:
            Dictionary with compiled binary data and filename
        """
        # Create a temporary directory for the sketch
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create sketch file
            sketch_name = "sketch"
            sketch_dir = os.path.join(temp_dir, sketch_name)
            os.makedirs(sketch_dir)

            sketch_file = os.path.join(sketch_dir, f"{sketch_name}.ino")
            with open(sketch_file, "w") as f:
                f.write(code)

            # Compile the sketch
            try:
                logger.info(f"Compiling sketch for board {board_fqbn}")
                result = subprocess.run(
                    [
                        "arduino-cli",
                        "compile",
                        "--fqbn",
                        board_fqbn,
                        "--verbose",
                        sketch_dir,
                        "--output-dir",
                        temp_dir,
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                )

                # Find the compiled binary
                binary_file = None
                binary_data = None

                for filename in os.listdir(temp_dir):
                    if (
                        filename.endswith(".hex")
                        or filename.endswith(".bin")
                        or filename.endswith(".elf")
                    ):
                        binary_file = filename
                        binary_path = os.path.join(temp_dir, filename)

                        # Read the binary file
                        with open(binary_path, "rb") as f:
                            binary_data = f.read()

                        break

                if not binary_file or not binary_data:
                    logger.error("Compiled binary not found")
                    raise Exception("Compiled binary not found")

                logger.info(
                    f"Compilation successful. Binary size: {len(binary_data)} bytes"
                )
                return {
                    "filename": binary_file,
                    "data": binary_data,
                    "size": len(binary_data),
                    "board_fqbn": board_fqbn,
                    "output": result.stdout,
                }

            except subprocess.CalledProcessError as e:
                logger.error(f"Compilation error: {e.stderr}")
                raise Exception(f"Compilation failed: {e.stderr}")
            except Exception as e:
                logger.error(f"Error during compilation: {str(e)}")
                raise

    @staticmethod
    def prepare_for_webserial_upload(binary_data, board_fqbn):
        """
        Prepare binary for WebSerial upload

        Args:
            binary_data: Raw binary data
            board_fqbn: Fully Qualified Board Name

        Returns:
            Dictionary with upload information
        """
        # Encode binary data as base64 for JSON transmission
        encoded_data = base64.b64encode(binary_data).decode("utf-8")

        # Determine upload protocol based on board type
        protocol = "avr109"  # Default for Leonardo, Micro
        if "uno" in board_fqbn or "nano" in board_fqbn or "mega" in board_fqbn:
            protocol = "stk500v1"
        elif "esp32" in board_fqbn:
            protocol = "esp32"

        return {"binary": encoded_data, "protocol": protocol, "board_fqbn": board_fqbn}

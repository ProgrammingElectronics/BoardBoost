# test_arduino_signature.py (notice the test_ prefix)
import unittest
import sys
import os
import tempfile
import subprocess

# Now import your module
from backend.chat.arduino_create_agent_signature import sign_arduino_command


class TestArduinoSignature(unittest.TestCase):
    pass
    # def test_signature_matches_openssl(self):
    #     test_command = "test command string"
    #     signature = sign_arduino_command(test_command)

    #     # Verify with direct OpenSSL call
    #     with tempfile.NamedTemporaryFile(delete=False, mode="w") as temp:
    #         temp.write(test_command)
    #         cmd_file = temp.name

    #     try:
    #         result = subprocess.run(
    #             [
    #                 "openssl",
    #                 "dgst",
    #                 "-sha256",
    #                 "-sign",
    #                 "private_key.pem",
    #                 "-hex",
    #                 cmd_file,
    #             ],
    #             capture_output=True,
    #             text=True,
    #             check=True,
    #         )
    #         direct_sig = result.stdout.strip().split("=", 1)[1].strip()
    #         self.assertEqual(signature, direct_sig, "Signatures don't match")
    #     finally:
    #         os.unlink(cmd_file)


if __name__ == "__main__":
    unittest.main()

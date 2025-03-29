import binascii
import subprocess
import tempfile
import os


def verify_signature_using_openssl(command_file, signature, public_key_file):
    """Use OpenSSL directly to verify the signature"""

    # Create a temporary file for the signature
    with tempfile.NamedTemporaryFile(delete=False) as temp:
        binary_sig = binascii.unhexlify(signature)
        temp.write(binary_sig)
        sig_file = temp.name

    try:
        # Run OpenSSL to verify
        result = subprocess.run(
            [
                "openssl",
                "dgst",
                "-sha256",
                "-verify",
                public_key_file,
                "-signature",
                sig_file,
                command_file,
            ],
            capture_output=True,
            text=True,
        )

        # Return the result
        if result.returncode == 0 and "Verified OK" in result.stdout:
            return True, "Verification successful!"
        else:
            return False, f"Verification failed: {result.stderr}"

    finally:
        # Clean up temp file
        os.unlink(sig_file)


# Example usage
if __name__ == "__main__":
    # Load signature from file
    with open("signature.hex", "r") as f:
        signature = f.read().strip()

    # Verify using OpenSSL directly
    success, message = verify_signature_using_openssl(
        "command_T2.txt",  # The file containing the command
        signature,  # The signature hex string
        "my_public_key.pem",  # Path to public key file
    )

    print(message)

    # Debug info
    print("\nDebug information:")
    print("Original file hash:")
    os.system(f"cat command_T2.txt | openssl dgst -sha256")

import binascii
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key


def sign_arduino_command(commandline, private_key_path="private_25MAR25.pem"):
    """
    Sign an Arduino commandline with RSA-SHA256 and PKCS#1v15 padding
    Args:
        commandline: The exact command string to sign (must match what Arduino Create Agent receives)
        private_key_path: Path to the PEM-encoded private key file

    Returns:
        Hex-encoded signature string
    """
    # Load the private key
    with open(private_key_path, "rb") as key_file:
        private_key = load_pem_private_key(
            key_file.read(),
            password=None,
        )

    # Sign the commandline using SHA-256 and PKCS#1v15 padding
    signature = private_key.sign(
        commandline.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
    )

    # hex_signature = binascii.hexlify(signature).decode("ascii")
    # print(f"Signature: {hex_signature}")

    # Convert the binary signature to hex format
    return binascii.hexlify(signature).decode("ascii")

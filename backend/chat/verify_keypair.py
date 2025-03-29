# Create a test script (verify_keypair.py)
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key,
    load_pem_public_key,
)

# Load the private key
with open("private_2.pem", "rb") as f:
    private_key = load_pem_private_key(f.read(), password=None)

# Load the public key
with open("public_2.pem", "rb") as f:
    public_key = load_pem_public_key(f.read())

# Test message
message = b"Test message"

# Sign with private key
signature = private_key.sign(message, padding.PKCS1v15(), hashes.SHA256())

# Verify with public key
try:
    public_key.verify(signature, message, padding.PKCS1v15(), hashes.SHA256())
    print("Key pair verification: SUCCESS")
except Exception as e:
    print(f"Key pair verification: FAILED - {str(e)}")

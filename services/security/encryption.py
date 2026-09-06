"""Encryption Utilities for CashNet.

Provides encryption/decryption for data at rest and in transit.
"""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class EncryptionService:
    """Service for encrypting and decrypting data."""

    def __init__(self, encryption_key: str | None = None):
        """Initialize encryption service.

        Args:
            encryption_key: Base key for encryption. If not provided,
                          will use environment variable or generate one.
        """
        if encryption_key is None:
            encryption_key = os.getenv("ENCRYPTION_KEY")

        if encryption_key is None:
            # Generate a key for development (not for production!)
            self._key = Fernet.generate_key()
            self._is_dev_key = True
        else:
            # Derive key from provided key
            self._key = self._derive_key(encryption_key)
            self._is_dev_key = False

        self._fernet = Fernet(self._key)

    def _derive_key(self, password: str) -> bytes:
        """Derive a Fernet key from a password."""
        # Use a fixed salt for deterministic key derivation
        # In production, use a proper key management system
        salt = b"cashnet-salt-v1"  # In production, store salt separately

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )

        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key

    def encrypt(self, data: str) -> str:
        """Encrypt a string value.

        Args:
            data: String to encrypt.

        Returns:
            Encrypted string (base64 encoded).
        """
        encrypted = self._fernet.encrypt(data.encode())
        return encrypted.decode()

    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt an encrypted string.

        Args:
            encrypted_data: Encrypted string (base64 encoded).

        Returns:
            Decrypted string.
        """
        decrypted = self._fernet.decrypt(encrypted_data.encode())
        return decrypted.decode()

    def encrypt_dict(self, data: dict) -> str:
        """Encrypt a dictionary.

        Args:
            data: Dictionary to encrypt.

        Returns:
            Encrypted JSON string.
        """
        import json

        json_str = json.dumps(data, default=str)
        return self.encrypt(json_str)

    def decrypt_dict(self, encrypted_data: str) -> dict:
        """Decrypt an encrypted dictionary.

        Args:
            encrypted_data: Encrypted JSON string.

        Returns:
            Decrypted dictionary.
        """
        import json

        json_str = self.decrypt(encrypted_data)
        return json.loads(json_str)

    def hash_data(self, data: str) -> str:
        """Create a SHA-256 hash of data.

        Args:
            data: Data to hash.

        Returns:
            Hex-encoded hash.
        """
        return hashlib.sha256(data.encode()).hexdigest()

    def verify_hash(self, data: str, expected_hash: str) -> bool:
        """Verify data matches expected hash.

        Args:
            data: Data to verify.
            expected_hash: Expected hash value.

        Returns:
            True if hash matches, False otherwise.
        """
        actual_hash = self.hash_data(data)
        return actual_hash == expected_hash

    @property
    def is_using_dev_key(self) -> bool:
        """Check if using a development key."""
        return self._is_dev_key


class FieldEncryption:
    """Encrypt/decrypt specific fields in models."""

    def __init__(self, encryption_service: EncryptionService):
        self.encryption_service = encryption_service

    def encrypt_field(self, value: str | None) -> str | None:
        """Encrypt a field value."""
        if value is None:
            return None
        return self.encryption_service.encrypt(value)

    def decrypt_field(self, encrypted_value: str | None) -> str | None:
        """Decrypt a field value."""
        if encrypted_value is None:
            return None
        return self.encryption_service.decrypt(encrypted_value)

    def encrypt_sensitive_fields(self, data: dict, fields: list[str]) -> dict:
        """Encrypt specified fields in a dictionary."""
        encrypted_data = data.copy()
        for field in fields:
            if field in encrypted_data and encrypted_data[field] is not None:
                encrypted_data[field] = self.encrypt_field(str(encrypted_data[field]))
        return encrypted_data

    def decrypt_sensitive_fields(self, data: dict, fields: list[str]) -> dict:
        """Decrypt specified fields in a dictionary."""
        decrypted_data = data.copy()
        for field in fields:
            if field in decrypted_data and decrypted_data[field] is not None:
                decrypted_data[field] = self.decrypt_field(decrypted_data[field])
        return decrypted_data


# Singleton instance
_encryption_service: EncryptionService | None = None


def get_encryption_service() -> EncryptionService:
    """Get the encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


def get_field_encryption() -> FieldEncryption:
    """Get the field encryption instance."""
    return FieldEncryption(get_encryption_service())

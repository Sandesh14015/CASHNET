"""Secrets Management for CashNet.

Provides secure storage and retrieval of secrets with support for
HashiCorp Vault, AWS Secrets Manager, and local development.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from abc import ABC, abstractmethod
from datetime import datetime, UTC
from enum import StrEnum
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, ValidationError


class SecretBackend(StrEnum):
    """Supported secret backends."""

    VAULT = "vault"
    AWS_SECRETS_MANAGER = "aws_secrets_manager"
    LOCAL = "local"


class SecretMetadata(BaseModel):
    """Metadata for a secret."""

    name: str
    version: int = 1
    created_at: datetime = datetime.now(UTC)
    updated_at: datetime = datetime.now(UTC)
    expires_at: datetime | None = None
    rotation_enabled: bool = False
    rotation_interval_days: int = 90


class SecretsBackend(ABC):
    """Abstract base class for secrets backends."""

    @abstractmethod
    def get_secret(self, name: str) -> str | None:
        """Get a secret by name."""

    @abstractmethod
    def set_secret(
        self, name: str, value: str, metadata: SecretMetadata | None = None
    ) -> bool:
        """Set a secret value."""

    @abstractmethod
    def delete_secret(self, name: str) -> bool:
        """Delete a secret."""

    @abstractmethod
    def list_secrets(self) -> list[str]:
        """List all secret names."""

    @abstractmethod
    def rotate_secret(self, name: str, new_value: str) -> bool:
        """Rotate a secret to a new value."""


class LocalSecretsBackend(SecretsBackend):
    """Local file-based secrets backend for development."""

    def __init__(
        self, secrets_dir: str = ".secrets", encryption_key: str | None = None
    ):
        self.secrets_dir = Path(secrets_dir)
        self.secrets_dir.mkdir(parents=True, exist_ok=True)

        # Use provided key or generate one
        if encryption_key:
            key = base64.urlsafe_b64encode(
                hashlib.sha256(encryption_key.encode()).digest()
            )
        else:
            key = Fernet.generate_key()

        self.fernet = Fernet(key)

    def _get_secret_path(self, name: str) -> Path:
        """Get the file path for a secret."""
        safe_name = name.replace("/", "_").replace("\\", "_")
        return self.secrets_dir / f"{safe_name}.enc"

    def _get_metadata_path(self, name: str) -> Path:
        """Get the metadata file path for a secret."""
        safe_name = name.replace("/", "_").replace("\\", "_")
        return self.secrets_dir / f"{safe_name}.meta.json"

    def get_secret(self, name: str) -> str | None:
        """Get a secret by name."""
        secret_path = self._get_secret_path(name)
        if not secret_path.exists():
            return None

        try:
            encrypted_data = secret_path.read_bytes()
            decrypted_data = self.fernet.decrypt(encrypted_data)
            return decrypted_data.decode("utf-8")
        except (InvalidToken, OSError, ValueError):
            return None

    def set_secret(
        self, name: str, value: str, metadata: SecretMetadata | None = None
    ) -> bool:
        """Set a secret value."""
        try:
            # Encrypt and save
            secret_path = self._get_secret_path(name)
            encrypted_data = self.fernet.encrypt(value.encode("utf-8"))
            secret_path.write_bytes(encrypted_data)

            # Save metadata
            if metadata is None:
                metadata = SecretMetadata(name=name)
            metadata.updated_at = datetime.now(UTC)

            metadata_path = self._get_metadata_path(name)
            metadata_path.write_text(json.dumps(metadata.model_dump(), indent=2))

            return True
        except (OSError, ValueError):
            return False

    def delete_secret(self, name: str) -> bool:
        """Delete a secret."""
        try:
            secret_path = self._get_secret_path(name)
            metadata_path = self._get_metadata_path(name)

            if secret_path.exists():
                secret_path.unlink()
            if metadata_path.exists():
                metadata_path.unlink()

            return True
        except OSError:
            return False

    def list_secrets(self) -> list[str]:
        """List all secret names."""
        secrets = []
        for file in self.secrets_dir.glob("*.enc"):
            name = file.stem
            secrets.append(name)
        return secrets

    def rotate_secret(self, name: str, new_value: str) -> bool:
        """Rotate a secret to a new value."""
        metadata = self.get_metadata(name)
        if metadata:
            metadata.version += 1
            metadata.updated_at = datetime.now(UTC)
        else:
            metadata = SecretMetadata(name=name, version=1)

        return self.set_secret(name, new_value, metadata)

    def get_metadata(self, name: str) -> SecretMetadata | None:
        """Get metadata for a secret."""
        metadata_path = self._get_metadata_path(name)
        if not metadata_path.exists():
            return None

        try:
            metadata_json = json.loads(metadata_path.read_text())
            return SecretMetadata(**metadata_json)
        except (ValueError, ValidationError, OSError):
            return None


class VaultSecretsBackend(SecretsBackend):
    """HashiCorp Vault secrets backend."""

    def __init__(self, vault_url: str, token: str, mount_point: str = "secret"):
        self.vault_url = vault_url
        self.token = token
        self.mount_point = mount_point
        # In production, use hvac library
        # import hvac
        # self.client = hvac.Client(url=vault_url, token=token)

    def get_secret(self, name: str) -> str | None:
        """Get a secret from Vault."""
        # In production:
        # try:
        #     response = self.client.secrets.kv.v2.read_secret_version(
        #         path=name,
        #         mount_point=self.mount_point
        #     )
        #     return response["data"]["data"]["value"]
        # except Exception:
        #     return None

        # Placeholder for development
        return os.getenv(name)

    def set_secret(
        self, name: str, value: str, metadata: SecretMetadata | None = None
    ) -> bool:
        """Set a secret in Vault."""
        # In production:
        # try:
        #     self.client.secrets.kv.v2.create_or_update_secret(
        #         path=name,
        #         secret={"value": value},
        #         mount_point=self.mount_point
        #     )
        #     return True
        # except Exception:
        #     return False

        # Placeholder for development
        os.environ[name] = value
        return True

    def delete_secret(self, name: str) -> bool:
        """Delete a secret from Vault."""
        # In production:
        # try:
        #     self.client.secrets.kv.v2.delete_secret_version(
        #         path=name,
        #         mount_point=self.mount_point
        #     )
        #     return True
        # except Exception:
        #     return False

        # Placeholder for development
        if name in os.environ:
            del os.environ[name]
        return True

    def list_secrets(self) -> list[str]:
        """List secrets in Vault."""
        # In production:
        # try:
        #     response = self.client.secrets.kv.v2.list_secrets(
        #         path="",
        #         mount_point=self.mount_point
        #     )
        #     return response["data"]["keys"]
        # except Exception:
        #     return []

        # Placeholder for development
        return []

    def rotate_secret(self, name: str, new_value: str) -> bool:
        """Rotate a secret in Vault."""
        return self.set_secret(name, new_value)


class AWSSecretsManagerBackend(SecretsBackend):
    """AWS Secrets Manager backend."""

    def __init__(self, region_name: str = "ap-south-1"):
        self.region_name = region_name
        # In production, use boto3
        # import boto3
        # self.client = boto3.client('secretsmanager', region_name=region_name)

    def get_secret(self, name: str) -> str | None:
        """Get a secret from AWS Secrets Manager."""
        # In production:
        # try:
        #     response = self.client.get_secret_value(SecretId=name)
        #     return response["SecretString"]
        # except Exception:
        #     return None

        # Placeholder for development
        return os.getenv(name)

    def set_secret(
        self, name: str, value: str, metadata: SecretMetadata | None = None
    ) -> bool:
        """Set a secret in AWS Secrets Manager."""
        # In production:
        # try:
        #     self.client.create_secret(
        #         Name=name,
        #         SecretString=value,
        #         Description=f"CashNet secret: {name}"
        #     )
        #     return True
        # except Exception:
        #     return False

        # Placeholder for development
        os.environ[name] = value
        return True

    def delete_secret(self, name: str) -> bool:
        """Delete a secret from AWS Secrets Manager."""
        # In production:
        # try:
        #     self.client.delete_secret(
        #         SecretId=name,
        #         ForceDeleteWithoutRecovery=True
        #     )
        #     return True
        # except Exception:
        #     return False

        # Placeholder for development
        if name in os.environ:
            del os.environ[name]
        return True

    def list_secrets(self) -> list[str]:
        """List secrets in AWS Secrets Manager."""
        # In production:
        # try:
        #     response = self.client.list_secrets()
        #     return [secret["Name"] for secret in response["SecretList"]]
        # except Exception:
        #     return []

        # Placeholder for development
        return []

    def rotate_secret(self, name: str, new_value: str) -> bool:
        """Rotate a secret in AWS Secrets Manager."""
        # In production:
        # try:
        #     self.client.update_secret(
        #         SecretId=name,
        #         SecretString=new_value
        #     )
        #     return True
        # except Exception:
        #     return False

        # Placeholder for development
        return self.set_secret(name, new_value)


class SecretsManager:
    """Main secrets manager interface."""

    def __init__(self, backend: SecretsBackend | None = None):
        if backend is None:
            # Auto-detect backend based on environment
            backend_type = os.getenv("SECRETS_BACKEND", "local")

            if backend_type == "vault":
                backend = VaultSecretsBackend(
                    vault_url=os.getenv("VAULT_URL", "http://localhost:8200"),
                    token=os.getenv("VAULT_TOKEN", ""),
                )
            elif backend_type == "aws_secrets_manager":
                backend = AWSSecretsManagerBackend(
                    region_name=os.getenv("AWS_REGION", "ap-south-1"),
                )
            else:
                backend = LocalSecretsBackend(
                    secrets_dir=os.getenv("SECRETS_DIR", ".secrets"),
                    encryption_key=os.getenv("SECRETS_ENCRYPTION_KEY"),
                )

        self.backend = backend

    def get(self, name: str, default: str | None = None) -> str | None:
        """Get a secret value."""
        value = self.backend.get_secret(name)
        return value if value is not None else default

    def set(self, name: str, value: str) -> bool:
        """Set a secret value."""
        return self.backend.set_secret(name, value)

    def delete(self, name: str) -> bool:
        """Delete a secret."""
        return self.backend.delete_secret(name)

    def list(self) -> list[str]:
        """List all secret names."""
        return self.backend.list_secrets()

    def rotate(self, name: str, new_value: str) -> bool:
        """Rotate a secret to a new value."""
        return self.backend.rotate_secret(name, new_value)

    def get_required(self, name: str) -> str:
        """Get a required secret (raises if not found)."""
        value = self.get(name)
        if value is None:
            raise ValueError(f"Required secret '{name}' not found")
        return value


# Singleton instance
_secrets_manager: SecretsManager | None = None


def get_secrets_manager() -> SecretsManager:
    """Get the secrets manager instance."""
    global _secrets_manager
    if _secrets_manager is None:
        _secrets_manager = SecretsManager()
    return _secrets_manager

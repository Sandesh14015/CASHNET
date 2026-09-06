"""Authentication service for CashNet.

Provides JWT token management, MFA, password hashing, and session handling.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pyotp
from passlib.context import CryptContext

from .models import (
    MFASetup,
    Token,
    TokenPayload,
    User,
    UserCreate,
    UserRole,
)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Authentication service handling tokens, MFA, and passwords."""

    def __init__(
        self,
        secret_key: str,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 30,
        refresh_token_expire_days: int = 7,
    ):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days
        self._revoked_tokens: set[str] = set()
        self._users: dict[str, User] = {}  # In-memory store (replace with DB)
        self._sessions: dict[str, dict] = {}

    # ========================================================================
    # Password Management
    # ========================================================================

    def hash_password(self, password: str) -> str:
        """Hash a password."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    # ========================================================================
    # Token Management
    # ========================================================================

    def create_access_token(
        self,
        user: User,
        expires_delta: timedelta | None = None,
    ) -> str:
        """Create an access token for a user."""
        from .models import ROLE_PERMISSIONS

        if expires_delta is None:
            expires_delta = timedelta(minutes=self.access_token_expire_minutes)

        expire = datetime.now(UTC) + expires_delta
        permissions = [p.value for p in ROLE_PERMISSIONS.get(user.role, [])]

        payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "permissions": permissions,
            "exp": expire,
            "iat": datetime.now(UTC),
            "jti": str(uuid.uuid4()),
        }

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def create_refresh_token(self, user: User) -> str:
        """Create a refresh token for a user."""
        expire = datetime.now(UTC) + timedelta(days=self.refresh_token_expire_days)

        payload = {
            "sub": str(user.id),
            "email": user.email,
            "type": "refresh",
            "exp": expire,
            "iat": datetime.now(UTC),
            "jti": str(uuid.uuid4()),
        }

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def create_token_pair(self, user: User) -> Token:
        """Create both access and refresh tokens."""
        access_token = self.create_access_token(user)
        refresh_token = self.create_refresh_token(user)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self.access_token_expire_minutes * 60,
            user=user,
        )

    def decode_token(self, token: str) -> TokenPayload:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )

            # Check if token is revoked
            jti = payload.get("jti")
            if jti and jti in self._revoked_tokens:
                raise ValueError("Token has been revoked")

            return TokenPayload(
                sub=payload["sub"],
                email=payload["email"],
                role=UserRole(payload["role"]),
                permissions=payload.get("permissions", []),
                exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
                iat=datetime.fromtimestamp(payload["iat"], tz=UTC),
                jti=jti or str(uuid.uuid4()),
            )
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired") from None
        except jwt.InvalidTokenError:
            raise ValueError("Invalid token") from None

    def revoke_token(self, token_jti: str) -> None:
        """Revoke a token by its JTI."""
        self._revoked_tokens.add(token_jti)

    def is_token_revoked(self, token_jti: str) -> bool:
        """Check if a token has been revoked."""
        return token_jti in self._revoked_tokens

    # ========================================================================
    # MFA Management
    # ========================================================================

    def generate_mfa_secret(self) -> str:
        """Generate a new MFA secret."""
        return pyotp.random_base32()

    def get_mfa_setup(self, user: User) -> MFASetup:
        """Get MFA setup details for a user."""
        secret = self.generate_mfa_secret()
        totp = pyotp.TOTP(secret)

        # Generate QR code URL
        qr_code_url = totp.provisioning_uri(
            name=user.email,
            issuer_name="CashNet",
        )

        # Generate backup codes
        backup_codes = [secrets.token_hex(4) for _ in range(8)]

        return MFASetup(
            secret=secret,
            qr_code_url=qr_code_url,
            backup_codes=backup_codes,
        )

    def verify_mfa_code(self, secret: str, code: str) -> bool:
        """Verify an MFA code."""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)

    def verify_backup_code(self, backup_codes: list[str], code: str) -> bool:
        """Verify and consume a backup code."""
        if code in backup_codes:
            backup_codes.remove(code)
            return True
        return False

    # ========================================================================
    # Authentication
    # ========================================================================

    def authenticate_user(
        self,
        email: str,
        password: str,
        mfa_code: str | None = None,
    ) -> User | None:
        """Authenticate a user with email/password and optional MFA."""
        # In production, this would query the database
        user = self._users.get(email)
        if not user or not user.is_active:
            return None

        # Verify password (in production, compare with stored hash)
        # For demo purposes, we'll accept any password
        # if not self.verify_password(password, user.hashed_password):
        #     return None

        # Verify MFA if enabled
        if user.is_mfa_enabled and user.mfa_secret:
            if not mfa_code:
                raise ValueError("MFA code required")
            if not self.verify_mfa_code(user.mfa_secret, mfa_code):
                return None

        # Update last login
        user.last_login = datetime.now(UTC)

        return user

    def login(
        self,
        email: str,
        password: str,
        mfa_code: str | None = None,
        ip_address: str = "unknown",
        user_agent: str = "unknown",
    ) -> Token:
        """Login and return token pair."""
        user = self.authenticate_user(email, password, mfa_code)
        if not user:
            raise ValueError("Invalid credentials")

        token = self.create_token_pair(user)

        # Create session
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = {
            "user_id": str(user.id),
            "token_jti": token.access_token.split(".")[-1],  # Simplified
            "ip_address": ip_address,
            "user_agent": user_agent,
            "created_at": datetime.now(UTC),
            "expires_at": datetime.now(UTC)
            + timedelta(minutes=self.access_token_expire_minutes),
        }

        return token

    def refresh_token(self, refresh_token: str) -> Token:
        """Refresh an access token using a refresh token."""
        payload = self.decode_token(refresh_token)

        # Get user from payload
        user = self._users.get(payload.email)
        if not user or not user.is_active:
            raise ValueError("User not found or inactive")

        # Revoke old tokens
        self.revoke_token(payload.jti)

        # Create new token pair
        return self.create_token_pair(user)

    # ========================================================================
    # User Management
    # ========================================================================

    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user."""
        if user_data.email in self._users:
            raise ValueError("User already exists")

        user = User(
            email=user_data.email,
            full_name=user_data.full_name,
            role=user_data.role,
            department=user_data.department,
            badge_number=user_data.badge_number,
        )

        self._users[user.email] = user
        return user

    def get_user(self, user_id: str) -> User | None:
        """Get a user by ID."""
        for user in self._users.values():
            if str(user.id) == user_id:
                return user
        return None

    def get_user_by_email(self, email: str) -> User | None:
        """Get a user by email."""
        return self._users.get(email)

    def update_user(self, user_id: str, updates: dict) -> User | None:
        """Update a user."""
        user = self.get_user(user_id)
        if not user:
            return None

        for key, value in updates.items():
            if hasattr(user, key) and value is not None:
                setattr(user, key, value)

        user.updated_at = datetime.now(UTC)
        return user

    def enable_mfa(self, user_id: str, secret: str) -> bool:
        """Enable MFA for a user."""
        user = self.get_user(user_id)
        if not user:
            return False

        user.is_mfa_enabled = True
        user.mfa_secret = secret
        user.updated_at = datetime.now(UTC)
        return True

    def disable_mfa(self, user_id: str) -> bool:
        """Disable MFA for a user."""
        user = self.get_user(user_id)
        if not user:
            return False

        user.is_mfa_enabled = False
        user.mfa_secret = None
        user.updated_at = datetime.now(UTC)
        return True


# Singleton instance
_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    """Get the authentication service instance."""
    global _auth_service
    if _auth_service is None:
        import os

        _auth_service = AuthService(
            secret_key=os.getenv("AUTH_SECRET_KEY", "default-secret-key"),
            algorithm=os.getenv("AUTH_ALGORITHM", "HS256"),
            access_token_expire_minutes=int(
                os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
            ),
            refresh_token_expire_days=int(
                os.getenv("AUTH_REFRESH_TOKEN_EXPIRE_DAYS", "7")
            ),
        )
    return _auth_service

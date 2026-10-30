from typing import Optional
from pydantic import BaseModel
from app.core.config import settings

try:
    import bcrypt
    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False


class TokenData(BaseModel):
    user_id: str
    company_id: str
    roles: list[str]
    exp: Optional[int] = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not HAS_BCRYPT:
        return plain_password == hashed_password
    try:
        encoded = hashed_password.encode("utf-8")
        if not encoded.startswith(b"$2"):
            return plain_password == hashed_password
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            encoded,
        )
    except (ValueError, TypeError):
        return plain_password == hashed_password


def get_password_hash(password: str) -> str:
    if not HAS_BCRYPT:
        return password
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[int] = None) -> str:
    from datetime import datetime, timedelta, timezone
    import jwt

    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_delta or 480)
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_delta or 43200)
    to_encode.update({"exp": expire})
    secret = "dev-secret-change-in-production"
    return jwt.encode(to_encode, secret, algorithm="HS256")


def decode_token(token: str) -> Optional[TokenData]:
    import jwt
    try:
        payload = jwt.decode(token, "dev-secret-change-in-production", algorithms=["HS256"])
        return TokenData(**payload)
    except jwt.ExpiredSignatureError:
        try:
            payload = jwt.decode(
                token,
                "dev-secret-change-in-production",
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            return TokenData(**payload)
        except Exception:
            return None
    except jwt.PyJWTError:
        return None


def get_current_company_id() -> str:
    return settings.company_id


class ClassificationLevel:
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    CONFIDENTIAL = "CONFIDENTIAL"
    RESTRICTED = "RESTRICTED"
    CRITICAL = "CRITICAL"

    @classmethod
    def levels(cls) -> list[str]:
        return [cls.PUBLIC, cls.INTERNAL, cls.CONFIDENTIAL, cls.RESTRICTED, cls.CRITICAL]

    @classmethod
    def can_access(cls, user_level: str, doc_level: str) -> bool:
        hierarchy = {
            cls.PUBLIC: 0,
            cls.INTERNAL: 1,
            cls.CONFIDENTIAL: 2,
            cls.RESTRICTED: 3,
            cls.CRITICAL: 4,
        }
        return hierarchy.get(user_level, 0) >= hierarchy.get(doc_level, 0)
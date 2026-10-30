from typing import Optional, Generator
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from app.db.database import get_db, SessionLocal
from app.core.security import decode_token, get_current_company_id
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.db.models import User, UserRole
from app.core.config import settings


def get_db_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid authorization header")

    token = authorization.split(" ")[1]
    token_data = decode_token(token)
    if not token_data:
        raise UnauthorizedError("Invalid or expired token")

    user = db.query(User).filter(User.id == int(token_data.user_id)).first()
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return user


async def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db_session),
) -> Optional[User]:
    """Like get_current_user but anonymous requests get None instead of a 401.

    Chat endpoints use this so existing unauthenticated/legacy flows keep
    working with default (company_id, user 1), while authenticated requests are
    scoped and enforced server-side.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    token_data = decode_token(token)
    if not token_data:
        return None
    user = db.query(User).filter(User.id == int(token_data.user_id)).first()
    if not user or not user.is_active:
        return None
    return user


async def get_current_company(
    current_user: User = Depends(get_current_user),
) -> str:
    return current_user.company_id


def require_role(*allowed_roles: UserRole):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenError(f"Required role: {[r.value for r in allowed_roles]}")
        return current_user
    return role_checker


def get_company_id() -> str:
    return get_current_company_id()
from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.repositories import UserRepository
from app.core.security import verify_password, create_access_token, get_password_hash, decode_token
from app.core.config import settings
from app.core.logging import get_logger
from app.db.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    full_name: str
    email: str
    role: str
    company_id: str
    user_id: int


def ensure_seed_user(db: Session) -> User:
    """Ensure a default ApexPetro user exists for offline local login."""
    repo = UserRepository(db)
    email = "arjun.mehta@apexpetro.com"
    user = repo.get_by_email(email)
    if not user:
        user = repo.create(
            email=email,
            hashed_password=get_password_hash("apexpetro2026"),
            full_name="Arjun Mehta",
            role=UserRole.ENGINEER,
            company_id=settings.company_id,
        )
    return user


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    repo = UserRepository(db)
    user = repo.get_by_email(request.email.strip().lower())
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(
        {"sub": str(user.id), "user_id": str(user.id), "company_id": user.company_id, "roles": [user.role.value]}
    )

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
        company_id=user.company_id,
        user_id=user.id,
    )


@router.post("/signup", response_model=AuthResponse)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    full_name = request.full_name.strip()

    if not email or "@" not in email or "." not in email:
        raise HTTPException(status_code=422, detail="A valid email is required")
    if len(request.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")
    if not full_name:
        raise HTTPException(status_code=422, detail="Full name is required")

    repo = UserRepository(db)
    if repo.get_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    role = UserRole.EMPLOYEE
    if request.role:
        try:
            role = UserRole[request.role.strip().upper()]
        except KeyError:
            role = UserRole.EMPLOYEE

    user = repo.create(
        email=email,
        hashed_password=get_password_hash(request.password),
        full_name=full_name,
        role=role,
        company_id=settings.company_id,
    )

    token = create_access_token(
        {"sub": str(user.id), "user_id": str(user.id), "company_id": user.company_id, "roles": [user.role.value]}
    )

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
        company_id=user.company_id,
        user_id=user.id,
    )


@router.get("/me")
def me(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: Session = Depends(get_db),
):
    repo = UserRepository(db)
    if not credentials or not credentials.credentials:
        user = ensure_seed_user(db)
        return {
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "company_id": user.company_id,
        }

    token_data = decode_token(credentials.credentials)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
        user = ensure_seed_user(db)
        return {
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "company_id": user.company_id,
        }

    try:
        uid = int(token_data.user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token payload")
        user = ensure_seed_user(db)
        return {
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "company_id": user.company_id,
        }

    user = repo.get_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        user = ensure_seed_user(db)

    return {
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role.value,
        "company_id": user.company_id,
    }

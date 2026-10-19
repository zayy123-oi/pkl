
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import LoginResponse, LoginUser
from app.security import create_access_token, get_current_user, verify_password


router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=LoginResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.username == form_data.username))
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Username atau password salah")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User tidak aktif")

    token = create_access_token(user.id, user.username, user.role)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=LoginUser(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=user.role,
            student_id=user.student_id,
            supervisor_id=user.supervisor_id,
        ),
    )


@router.get("/me", response_model=LoginUser)
def me(current_user: User = Depends(get_current_user)):
    return LoginUser(
        id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        role=current_user.role,
        student_id=current_user.student_id,
        supervisor_id=current_user.supervisor_id,
    )

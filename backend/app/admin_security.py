"""Development administration is opt-in and authenticated on the server."""
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


def create_admin_router() -> APIRouter:
    token = os.getenv("ADMIN_API_TOKEN", "")
    if len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
        raise RuntimeError("ADMIN_API_TOKEN must be an ASCII token of at least 32 characters")

    bearer = HTTPBearer(auto_error=False)

    def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if credentials is None or not secrets.compare_digest(credentials.credentials.encode(), token.encode()):
            raise HTTPException(
                status_code=401, detail="Invalid administrator credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


def register_admin_routes(app, register):
    """Do not register any admin endpoint unless explicitly enabled."""
    if os.getenv("ENABLE_ADMIN_API", "false").lower() == "true":
        router = create_admin_router()
        register(router)
        app.include_router(router)

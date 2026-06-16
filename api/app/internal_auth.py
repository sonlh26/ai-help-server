"""Internal service auth: web (Next.js) -> api (FastAPI) over the private network.

web authenticates the end-user (Better Auth), then forwards each request with:
  X-Internal-Token: shared secret (must equal INTERNAL_SERVICE_TOKEN)
  X-User-Id:        authenticated user id
  X-User-Role:      authenticated user role (admin|member|viewer)
api trusts these because the token proves the caller is the trusted web service.
The api is NOT publicly exposed (no host port in docker compose)."""
from __future__ import annotations

import hmac
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException

from app.config import settings

ADMIN = "admin"
MEMBER = "member"
VIEWER = "viewer"
WRITE_ROLES = {ADMIN, MEMBER}


@dataclass
class Principal:
    user_id: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN

    @property
    def can_write(self) -> bool:
        return self.role in WRITE_ROLES


def require_principal(
    x_internal_token: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
) -> Principal:
    expected = settings.internal_service_token
    if not expected or not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Internal auth failed")
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user identity")
    return Principal(user_id=x_user_id, role=(x_user_role or VIEWER))


def require_write(principal: Principal) -> None:
    if not principal.can_write:
        raise HTTPException(status_code=403, detail="Chỉ đọc — không đủ quyền thực hiện hành động này.")

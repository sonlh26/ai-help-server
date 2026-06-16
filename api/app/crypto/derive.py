"""Per-user Key Encryption Key (KEK) derivation.

KEK = HKDF-SHA256(ikm=APP_MASTER_KEY, salt=user_id, info="ssh-cred-v1").
user_id gives per-user cryptographic separation; root of trust = APP_MASTER_KEY."""
from __future__ import annotations

from typing import Optional

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.crypto.master_key import get_master_key

INFO = b"ssh-cred-v1"
KEK_LEN = 32


def derive_kek(user_id: str, master_key: Optional[bytes] = None) -> bytes:
    if not user_id:
        raise ValueError("user_id rỗng khi derive KEK.")
    ikm = master_key if master_key is not None else get_master_key()
    hkdf = HKDF(algorithm=hashes.SHA256(), length=KEK_LEN, salt=user_id.encode("utf-8"), info=INFO)
    return hkdf.derive(ikm)

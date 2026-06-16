"""Envelope encryption for credential secrets.

Per record: random DEK (AES-256-GCM) encrypts the plaintext; DEK wrapped under the
per-user KEK. AAD = user_id binds every blob to its owner (cross-user decrypt fails).
Secrets decrypt server-side at point of use only; never logged, returned, or sent to LLM."""
from __future__ import annotations

import base64
import os
from typing import Any, Dict, Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.crypto.derive import derive_kek

ALG = "AES-256-GCM"
VERSION = 1
NONCE_LEN = 12
DEK_LEN = 32


class DecryptError(RuntimeError):
    pass


def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s)


def encrypt_secret(plaintext: str, user_id: str, master_key: Optional[bytes] = None) -> Dict[str, Any]:
    """Return a self-describing JSON-serializable blob (store as JSONB)."""
    if plaintext is None:
        raise ValueError("plaintext is None")
    aad = user_id.encode("utf-8")
    dek = os.urandom(DEK_LEN)
    nonce = os.urandom(NONCE_LEN)
    ciphertext = AESGCM(dek).encrypt(nonce, plaintext.encode("utf-8"), aad)

    kek = derive_kek(user_id, master_key)
    dek_nonce = os.urandom(NONCE_LEN)
    wrapped_dek = AESGCM(kek).encrypt(dek_nonce, dek, aad)

    return {
        "alg": ALG,
        "version": VERSION,
        "user_id": user_id,
        "nonce": _b64e(nonce),
        "ciphertext": _b64e(ciphertext),
        "dek_nonce": _b64e(dek_nonce),
        "wrapped_dek": _b64e(wrapped_dek),
    }


def decrypt_secret(blob: Dict[str, Any], master_key: Optional[bytes] = None) -> str:
    try:
        user_id = blob["user_id"]
        aad = user_id.encode("utf-8")
        kek = derive_kek(user_id, master_key)
        dek = AESGCM(kek).decrypt(_b64d(blob["dek_nonce"]), _b64d(blob["wrapped_dek"]), aad)
        plaintext = AESGCM(dek).decrypt(_b64d(blob["nonce"]), _b64d(blob["ciphertext"]), aad)
        return plaintext.decode("utf-8")
    except (InvalidTag, KeyError, ValueError) as exc:
        # Không lộ chi tiết / không log secret.
        raise DecryptError("Giải mã thất bại (sai master key, dữ liệu hỏng, hoặc sai chủ sở hữu).") from exc


def rewrap_blob(blob: Dict[str, Any], new_master_key: bytes, old_master_key: Optional[bytes] = None) -> Dict[str, Any]:
    """Key rotation: re-wrap the DEK under a KEK derived from new_master_key.

    Ciphertext (DEK-encrypted secret) is UNCHANGED — only the wrapped DEK rotates."""
    user_id = blob["user_id"]
    aad = user_id.encode("utf-8")
    old_kek = derive_kek(user_id, old_master_key)
    dek = AESGCM(old_kek).decrypt(_b64d(blob["dek_nonce"]), _b64d(blob["wrapped_dek"]), aad)

    new_kek = derive_kek(user_id, new_master_key)
    dek_nonce = os.urandom(NONCE_LEN)
    wrapped_dek = AESGCM(new_kek).encrypt(dek_nonce, dek, aad)

    out = dict(blob)
    out["dek_nonce"] = _b64e(dek_nonce)
    out["wrapped_dek"] = _b64e(wrapped_dek)
    return out

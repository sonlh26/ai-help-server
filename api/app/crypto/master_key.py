"""Load APP_MASTER_KEY (root of trust for credential encryption).

Env now; the get_master_key() abstraction is the seam for a future KMS migration.
Never log the key. Loss = creds undecryptable; leak = full credential exposure."""
from __future__ import annotations

import base64
import binascii
import os
from functools import lru_cache

MIN_KEY_BYTES = 32


class MasterKeyError(RuntimeError):
    pass


def _decode(raw: str) -> bytes:
    raw = raw.strip()
    # Cho phép base64 hoặc hex.
    for decoder in (base64.b64decode, lambda v: binascii.unhexlify(v)):
        try:
            key = decoder(raw)
            if len(key) >= MIN_KEY_BYTES:
                return key
        except (binascii.Error, ValueError):
            continue
    # Fallback: dùng trực tiếp các byte UTF-8 (nếu người dùng dán passphrase dài).
    key = raw.encode("utf-8")
    if len(key) >= MIN_KEY_BYTES:
        return key
    raise MasterKeyError(
        f"APP_MASTER_KEY phải >= {MIN_KEY_BYTES} bytes. Sinh bằng: openssl rand -base64 32"
    )


@lru_cache(maxsize=1)
def get_master_key() -> bytes:
    raw = os.environ.get("APP_MASTER_KEY", "")
    if not raw:
        raise MasterKeyError("Thiếu APP_MASTER_KEY trong môi trường.")
    return _decode(raw)

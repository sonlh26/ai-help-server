"""Real crypto round-trip / tamper / wrong-key / cross-user / rotation tests. No mocks."""
from __future__ import annotations

import base64
import os

import pytest

# Set a real master key BEFORE importing modules that cache it.
os.environ.setdefault("APP_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())

from app.crypto import master_key  # noqa: E402
from app.crypto.envelope import DecryptError, decrypt_secret, encrypt_secret, rewrap_blob  # noqa: E402

USER_A = "user_aaaaaaaa"
USER_B = "user_bbbbbbbb"


def test_round_trip():
    blob = encrypt_secret("s3cr3t-ssh-pass", USER_A)
    assert blob["alg"] == "AES-256-GCM"
    assert "s3cr3t" not in str(blob)  # plaintext must not appear in blob
    assert decrypt_secret(blob) == "s3cr3t-ssh-pass"


def test_tampered_ciphertext_fails():
    blob = encrypt_secret("hello", USER_A)
    raw = bytearray(base64.b64decode(blob["ciphertext"]))
    raw[0] ^= 0xFF
    blob["ciphertext"] = base64.b64encode(bytes(raw)).decode()
    with pytest.raises(DecryptError):
        decrypt_secret(blob)


def test_wrong_master_key_fails():
    blob = encrypt_secret("hello", USER_A)
    wrong = os.urandom(32)
    with pytest.raises(DecryptError):
        decrypt_secret(blob, master_key=wrong)


def test_cross_user_decrypt_fails():
    blob = encrypt_secret("hello", USER_A)
    blob_as_b = dict(blob)
    blob_as_b["user_id"] = USER_B  # attacker relabels owner
    with pytest.raises(DecryptError):
        decrypt_secret(blob_as_b)


def test_rotation_preserves_plaintext():
    current = master_key.get_master_key()
    blob = encrypt_secret("rotate-me", USER_A)
    new_master = os.urandom(32)
    rotated = rewrap_blob(blob, new_master_key=new_master, old_master_key=current)
    # Old master no longer decrypts; new master does.
    with pytest.raises(DecryptError):
        decrypt_secret(rotated, master_key=current)
    assert decrypt_secret(rotated, master_key=new_master) == "rotate-me"
    # Ciphertext (DEK-encrypted secret) unchanged; only wrapped DEK rotated.
    assert rotated["ciphertext"] == blob["ciphertext"]
    assert rotated["wrapped_dek"] != blob["wrapped_dek"]

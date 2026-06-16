"""Lock in input-validation security fixes (real validation, no mocks)."""
from __future__ import annotations

import base64
import os

import pytest

os.environ.setdefault("APP_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())

from app.services.servers import _validate_payload  # noqa: E402
from app.tools.registry import ToolExecutor  # noqa: E402


def _ex() -> ToolExecutor:
    # ssh disabled → validation must trigger BEFORE any connection attempt.
    return ToolExecutor({"ssh": {"enabled": True, "host": "h"}, "aapanel": {"enabled": False}})


def test_website_config_rejects_path_traversal():
    out = _ex().execute("get_website_config", {"domain": "../../etc/passwd"})
    assert "không hợp lệ" in out.lower()


def test_access_logs_rejects_injection():
    out = _ex().execute("get_website_access_logs", {"domain": "x; cat /etc/shadow"})
    assert "không hợp lệ" in out.lower()


def test_aapanel_service_admin_rejects_bad_name():
    out = _ex().execute("aapanel_service_admin", {"name": "nginx; rm -rf /", "action": "restart"})
    assert "không hợp lệ" in out.lower()


def test_validate_payload_rejects_non_http_scheme():
    with pytest.raises(ValueError):
        _validate_payload({"aapanel": {"base_url": "file:///etc/passwd"}})
    with pytest.raises(ValueError):
        _validate_payload({"aapanel": {"base_url": "gopher://x"}})


def test_validate_payload_allows_valid_and_empty():
    _validate_payload({"aapanel": {"base_url": "http://1.2.3.4:8888"}})
    _validate_payload({"aapanel": {"base_url": ""}})
    _validate_payload({})  # no aapanel key

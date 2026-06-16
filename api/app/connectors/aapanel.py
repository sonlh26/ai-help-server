"""Kết nối aaPanel/BT API. Xác thực bằng request_time + md5(request_time + md5(api_key))."""
from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, Optional

import httpx


class AaPanelError(Exception):
    pass


class AaPanelConnector:
    def __init__(self, base_url: str, api_key: str, verify_ssl: bool = False) -> None:
        if not base_url or not api_key:
            raise AaPanelError("Chưa cấu hình base_url hoặc api_key của aaPanel.")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.verify_ssl = bool(verify_ssl)

    def _token(self) -> Dict[str, str]:
        now = str(int(time.time()))
        key_md5 = hashlib.md5(self.api_key.encode("utf-8")).hexdigest()
        token = hashlib.md5((now + key_md5).encode("utf-8")).hexdigest()
        return {"request_time": now, "request_token": token}

    def _post(self, path: str, extra: Optional[Dict[str, Any]] = None) -> Any:
        data = self._token()
        if extra:
            data.update(extra)
        url = self.base_url + path
        try:
            with httpx.Client(verify=self.verify_ssl, timeout=30, follow_redirects=True) as client:
                resp = client.post(url, data=data)
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise AaPanelError(f"Lỗi gọi aaPanel API ({path}): {exc}") from exc
        try:
            return resp.json()
        except ValueError:
            return {"raw": resp.text}

    # ---- Các endpoint hay dùng ----
    def system_total(self) -> Any:
        return self._post("/system?action=GetSystemTotal")

    def disk_info(self) -> Any:
        return self._post("/system?action=GetDiskInfo")

    def network(self) -> Any:
        return self._post("/system?action=GetNetWork")

    def sites(self, limit: int = 50) -> Any:
        return self._post("/data?action=getData&table=sites", {"limit": limit, "p": 1})

    def databases(self, limit: int = 50) -> Any:
        return self._post("/data?action=getData&table=databases", {"limit": limit, "p": 1})

    def crontab(self, limit: int = 50) -> Any:
        return self._post("/data?action=getData&table=crontab", {"limit": limit, "p": 1})

    def service_admin(self, name: str, action: str) -> Any:
        """Điều khiển dịch vụ do panel quản lý (nginx, mysqld, php, redis...).

        action: start | stop | restart | reload."""
        return self._post("/system?action=ServiceAdmin", {"name": name, "type": action})

    def site_action(self, site_id: Any, site_name: str, action: str) -> Any:
        """Bật/tắt một website. action: start | stop."""
        endpoint = "SiteStart" if action == "start" else "SiteStop"
        return self._post(f"/site?action={endpoint}", {"id": site_id, "name": site_name})

    def ssl_info(self, site_name: str) -> Any:
        """Lấy thông tin chứng chỉ SSL của một website."""
        return self._post("/site?action=GetSSL", {"siteName": site_name})

    def test(self) -> Dict[str, Any]:
        info = self.system_total()
        ok = isinstance(info, dict) and ("system" in info or "version" in info or "memTotal" in info)
        return {"ok": bool(ok), "detail": info}

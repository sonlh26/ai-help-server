"""SSH connector (paramiko). Opens a fresh connection per command. Supports password,
private-key file path, or private-key CONTENT (decrypted from the vault)."""
from __future__ import annotations

import io
from typing import Any, Dict, Optional

import paramiko


class SSHError(Exception):
    pass


def _load_key_from_content(content: str, passphrase: Optional[str]):
    last_exc: Optional[Exception] = None
    for key_cls in (paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.RSAKey, paramiko.DSSKey):
        try:
            return key_cls.from_private_key(io.StringIO(content), password=passphrase or None)
        except Exception as exc:  # noqa: BLE001 - try next key type
            last_exc = exc
    raise SSHError(f"Không đọc được private key: {last_exc}")


class SSHConnector:
    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = "root",
        password: Optional[str] = None,
        private_key_content: Optional[str] = None,
        private_key_path: Optional[str] = None,
        key_passphrase: Optional[str] = None,
    ) -> None:
        if not host:
            raise SSHError("Chưa cấu hình host SSH.")
        self.host = host
        self.port = int(port or 22)
        self.username = username or "root"
        self.password = password or None
        self.private_key_content = private_key_content or None
        self.private_key_path = private_key_path or None
        self.key_passphrase = key_passphrase or None

    def _connect(self) -> paramiko.SSHClient:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        kwargs: Dict[str, Any] = {
            "hostname": self.host,
            "port": self.port,
            "username": self.username,
            "timeout": 15,
            "banner_timeout": 15,
            "auth_timeout": 15,
            "allow_agent": False,
            "look_for_keys": False,
        }
        if self.private_key_content:
            kwargs["pkey"] = _load_key_from_content(self.private_key_content, self.key_passphrase)
        elif self.private_key_path:
            kwargs["key_filename"] = self.private_key_path
            if self.key_passphrase:
                kwargs["passphrase"] = self.key_passphrase
        if self.password:
            kwargs["password"] = self.password
        try:
            client.connect(**kwargs)
        except Exception as exc:  # noqa: BLE001
            raise SSHError(f"Không kết nối được SSH: {exc}") from exc
        return client

    def exec(self, command: str, timeout: int = 60) -> Dict[str, Any]:
        client = self._connect()
        try:
            stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            code = stdout.channel.recv_exit_status()
            return {"stdout": out, "stderr": err, "exit_code": code}
        finally:
            client.close()

    def test(self) -> Dict[str, Any]:
        result = self.exec("echo ok && hostname && uptime", timeout=20)
        ok = result["exit_code"] == 0
        return {"ok": ok, "detail": result["stdout"].strip() or result["stderr"].strip()}

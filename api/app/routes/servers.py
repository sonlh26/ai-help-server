"""Server CRUD + connection test + status. All ownership-scoped via Principal."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.connectors.aapanel import AaPanelConnector
from app.connectors.ssh import SSHConnector
from app.internal_auth import Principal, require_principal, require_write
from app.services import overview as overview_svc
from app.services import servers as svc

router = APIRouter(prefix="/servers", tags=["servers"])


class SSHIn(BaseModel):
    enabled: bool = False
    host: str = ""
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    private_key: Optional[str] = None
    key_passphrase: Optional[str] = None


class PanelIn(BaseModel):
    enabled: bool = False
    base_url: str = ""
    api_key: Optional[str] = None
    verify_ssl: bool = False


class MonitorIn(BaseModel):
    enabled: bool = False
    interval_seconds: int = 60
    services: List[str] = []


class ServerIn(BaseModel):
    name: str = "Server"
    note: str = ""
    ssh: SSHIn = SSHIn()
    aapanel: PanelIn = PanelIn()
    monitor: MonitorIn = MonitorIn()


@router.get("")
async def list_servers(principal: Principal = Depends(require_principal)) -> List[Dict[str, Any]]:
    return await svc.list_servers(principal)


@router.post("")
async def create_server(body: ServerIn, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    return await svc.create_server(principal, body.model_dump())


@router.get("/{server_id}")
async def get_server(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    result = await svc.get_server(principal, server_id)
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    return result


@router.put("/{server_id}")
async def update_server(server_id: str, body: ServerIn, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    result = await svc.update_server(principal, server_id, body.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    return result


@router.delete("/{server_id}")
async def delete_server(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    if not await svc.delete_server(principal, server_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    return {"ok": True}


@router.post("/test/{target}")
async def test_raw_connection(target: str, body: ServerIn, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    """Stateless test using raw creds from the form (for the create modal, before saving)."""
    require_write(principal)
    try:
        if target == "ssh":
            s = body.ssh
            conn = SSHConnector(
                host=s.host, port=s.port, username=s.username, password=s.password,
                private_key_content=s.private_key, key_passphrase=s.key_passphrase,
            )
            return conn.test()
        if target == "aapanel":
            p = body.aapanel
            return AaPanelConnector(p.base_url, p.api_key or "", p.verify_ssl).test()
        raise HTTPException(status_code=400, detail=f"Đối tượng không hợp lệ: {target}")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": str(exc)}


@router.post("/{server_id}/test/{target}")
async def test_connection(server_id: str, target: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)  # decrypts creds + outbound connect → not a viewer action
    cfg = await svc.build_decrypted_config(principal, server_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    try:
        if target == "ssh":
            s = cfg["ssh"]
            conn = SSHConnector(
                host=s["host"], port=s["port"], username=s["username"], password=s["password"],
                private_key_content=s["private_key_content"], key_passphrase=s["key_passphrase"],
            )
            return conn.test()
        if target == "aapanel":
            p = cfg["aapanel"]
            return AaPanelConnector(p["base_url"], p["api_key"] or "", p["verify_ssl"]).test()
        raise HTTPException(status_code=400, detail=f"Đối tượng không hợp lệ: {target}")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": str(exc)}


@router.get("/{server_id}/overview")
async def server_overview(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await svc.build_decrypted_config(principal, server_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    return overview_svc.build_overview(cfg)


@router.get("/{server_id}/status")
async def server_status(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await svc.build_decrypted_config(principal, server_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    out: Dict[str, Any] = {"source": None, "disk": None, "system": None, "error": None}
    try:
        if cfg["aapanel"]["enabled"]:
            p = cfg["aapanel"]
            panel = AaPanelConnector(p["base_url"], p["api_key"] or "", p["verify_ssl"])
            out["source"] = "aapanel"
            out["system"] = panel.system_total()
            out["disk"] = panel.disk_info()
        elif cfg["ssh"]["enabled"]:
            s = cfg["ssh"]
            conn = SSHConnector(
                host=s["host"], port=s["port"], username=s["username"], password=s["password"],
                private_key_content=s["private_key_content"], key_passphrase=s["key_passphrase"],
            )
            out["source"] = "ssh"
            out["disk"] = conn.exec("df -hT 2>/dev/null", timeout=30)["stdout"]
            out["system"] = conn.exec("uptime; echo '---'; free -h", timeout=30)["stdout"]
        else:
            out["error"] = "Server chưa bật SSH hoặc aaPanel API."
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
    return out

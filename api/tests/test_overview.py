"""Parse real aaPanel response shapes (from a live 8.13.0 panel) into clean metrics. No mocks."""
from __future__ import annotations

from app.services.overview import parse_aapanel

# Real shapes observed from aaPanel 8.13.0 GetSystemTotal / GetDiskInfo.
TOTAL = {
    "memTotal": 32097, "memFree": 1010, "memBuffers": 3667, "memCached": 11345,
    "memRealUsed": 16075, "cpuNum": 16, "cpuRealUsed": 22, "time": "13 Day(s)",
    "system": "Ubuntu 20.04.6 LTS x86_64(Py3.12.3)", "version": "8.13.0",
}
DISK = [
    {"filesystem": "/dev/sda2", "type": "ext4", "path": "/",
     "size": ["491G", "265G", "201G", "57%"], "inodes": ["32702464", "3123718", "29578746", "10%"]},
    {"filesystem": "/dev/sdb1", "type": "ext4", "path": "/mnt/backup",
     "size": ["295G", "37G", "243G", "13%"], "inodes": ["19660800", "207", "19660593", "1%"]},
]
NET = {"load": {"one": 4.44, "five": 4.42, "fifteen": 4.51}, "up": "5.23 MB", "down": "5.20 MB",
       "upTotal": "1.75 TB", "downTotal": "1.20 TB"}
SITES = {"data": [{} for _ in range(22)]}
DBS = {"data": [{} for _ in range(33)]}


def test_parse_system():
    o = parse_aapanel(TOTAL, DISK, NET, SITES, DBS)
    s = o["system"]
    assert s["cpu_cores"] == 16
    assert s["cpu_percent"] == 22
    assert s["mem_total_mb"] == 32097
    assert s["mem_used_mb"] == 16075
    assert s["mem_percent"] == 50  # 16075/32097 = 50%
    assert s["panel_version"] == "8.13.0"
    assert "Ubuntu" in s["os"]


def test_parse_disks():
    o = parse_aapanel(TOTAL, DISK, NET, SITES, DBS)
    assert len(o["disks"]) == 2
    root = o["disks"][0]
    assert root["path"] == "/" and root["percent"] == 57 and root["total"] == "491G"
    assert o["disks"][1]["path"] == "/mnt/backup" and o["disks"][1]["percent"] == 13


def test_parse_counts_and_load():
    o = parse_aapanel(TOTAL, DISK, NET, SITES, DBS)
    assert o["sites"]["total"] == 22
    assert o["databases"]["total"] == 33
    assert o["load"]["one"] == 4.44
    assert o["network"]["down_total"] == "1.20 TB"

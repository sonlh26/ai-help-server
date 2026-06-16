/** API response shapes for the server-detail tabs (per documented endpoints). */

export interface OverviewSystem {
  os?: string | null;
  kernel?: string | null;
  hostname?: string | null;
  cpu_model?: string | null;
  cpu_cores?: number | null;
  cpu_percent?: number | null;
  mem_total_mb?: number | null;
  mem_used_mb?: number | null;
  mem_percent?: number | null;
  swap_total_mb?: number | null;
  swap_used_mb?: number | null;
  uptime?: string | null;
  panel_version?: string | null;
}

export interface OverviewLoad {
  one?: number | null;
  five?: number | null;
  fifteen?: number | null;
}

export interface OverviewDisk {
  path: string;
  type?: string | null;
  total: string;
  used: string;
  percent: number;
}

export interface OverviewNetwork {
  up?: string | null;
  down?: string | null;
  up_total?: string | null;
  down_total?: string | null;
}

export interface OverviewResp {
  source: "aapanel" | "ssh" | null;
  system?: OverviewSystem;
  load?: OverviewLoad;
  disks?: OverviewDisk[];
  network?: OverviewNetwork;
  sites?: { total: number } | null;
  databases?: { total: number } | null;
  /** Detected control panel / web server (may be null). */
  platform?: {
    panel: string | null;
    web_server: string | null;
    self_configured?: boolean;
  } | null;
  error?: string | null;
}

export interface DiskPartition {
  filesystem: string;
  type: string;
  mount: string;
  total_bytes: number;
  used_bytes: number;
  avail_bytes: number;
  percent: number;
}

export interface DiskResp {
  disks: DiskPartition[];
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  near_full_bytes: number;
}

export interface ServiceItem {
  name: string;
  unit: string;
  active: boolean;
  sub: string;
  running: boolean;
  description: string;
  important?: boolean;
}

export interface ServicesResp {
  services: ServiceItem[];
  total: number;
  important_total?: number;
}

export type ServiceAction = "start" | "stop" | "restart" | "reload";

/** aaPanel raw rows are loosely typed — index by string with optional fields. */
export interface AaPanelRow {
  name?: string;
  [key: string]: unknown;
}

export interface ServerSummary {
  ssh: { enabled: boolean };
  aapanel: { enabled: boolean };
  monitor: { enabled: boolean };
}

function Pill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`pill ${on ? "pill-on" : "pill-off"}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

/** Compact row of capability pills for a server (SSH / aaPanel / Giám sát). */
export default function StatusPills({ server }: { server: ServerSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill label="SSH" on={server.ssh.enabled} />
      <Pill label="aaPanel" on={server.aapanel.enabled} />
      <Pill label="Giám sát" on={server.monitor.enabled} />
    </div>
  );
}

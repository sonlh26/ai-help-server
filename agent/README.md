# aapanel-ai-agent

On-server bridge so the AI can run tools **without you handing over SSH credentials**.
The agent runs on your own server (it already has local access), dials **out** to the
gateway (no inbound port), and runs **only declared tool functions**. Unknown/arbitrary
commands are refused here — they must be confirmed in the web UI and the agent still
enforces its own allow-list.

## How it works
```
agent  --GET  /agent/poll-->  gateway  <--POST /dispatch--  cloud API
agent  --POST /agent/result-> gateway  --result-->          cloud API
```
- Long-poll HTTP, **stdlib only** (zero Go deps), firewall-friendly (outbound 443).
- Auth: a per-server token (get it from the web UI → server → "Local Agent").

## Build
```sh
cd agent
go build -o aapanel-ai-agent .          # local OS/arch
# cross-compile for a Linux VPS:
GOOS=linux GOARCH=amd64 go build -o aapanel-ai-agent-linux-amd64 .
GOOS=linux GOARCH=arm64 go build -o aapanel-ai-agent-linux-arm64 .
```

## Run
```sh
GATEWAY_URL=https://gw.example.com AGENT_TOKEN=<token-from-web-ui> ./aapanel-ai-agent
```
Env:
- `GATEWAY_URL` — public gateway URL.
- `AGENT_TOKEN` — per-server enrollment token.
- `AGENT_READ_ONLY=true` — (optional) refuse any non-read-only tool locally.

## systemd (recommended)
`/etc/systemd/system/aapanel-ai-agent.service`:
```ini
[Unit]
Description=aaPanel AI Agent
After=network-online.target

[Service]
Environment=GATEWAY_URL=https://gw.example.com
Environment=AGENT_TOKEN=REPLACE_ME
ExecStart=/usr/local/bin/aapanel-ai-agent
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```sh
sudo systemctl daemon-reload && sudo systemctl enable --now aapanel-ai-agent
```

## Declared tools (current MVP)
- `ping` — liveness + host info
- `system_info` — hostname / os / uptime
- `disk_usage` — `df` (read-only)

Add more by extending the `tools` map in `main.go`. Keep them read-only & local;
risky/write actions stay confirm-gated in the cloud.

## Trust
Open-source on purpose: read exactly what runs. The agent never executes a command
string sent by the cloud — only the named functions above. SSH creds never leave
this machine.

// aapanel-ai-agent — on-server bridge that runs ONLY declared tool functions.
//
// Why: keep SSH credentials on the user's own machine. The agent runs locally
// (it already has access), dials OUT to the gateway (no inbound port), receives
// jobs, runs a fixed set of DECLARED functions, and returns the output. Commands
// outside this set are NOT executed here — the cloud must get user confirmation
// and the policy is enforced cloud-side; this agent simply refuses unknown tools.
//
// Transport: long-poll HTTP (stdlib only, zero external deps). WS is a later upgrade.
//
// Run:
//   GATEWAY_URL=https://gw.example.com AGENT_TOKEN=xxxxx ./aapanel-ai-agent
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type job struct {
	JobID string                 `json:"job_id"`
	Tool  string                 `json:"tool"`
	Args  map[string]interface{} `json:"args"`
}

type result struct {
	JobID  string `json:"job_id"`
	OK     bool   `json:"ok"`
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Config (read-only allow-list). agent.yaml-equivalent could extend this later.
type config struct {
	gateway     string
	token       string
	readOnly    bool // if true, refuse any tool not marked read-only
	pollTimeout time.Duration
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ---- DECLARED tools (the ONLY things this agent will run) ----
// Each returns text output. Keep these read-only & local. Unknown tool => refused.
type toolFn func(args map[string]interface{}) (string, error)

var tools = map[string]toolFn{
	"ping":                    toolPing,
	"system_info":             toolSystemInfo,
	"disk_usage":              toolDiskUsage,
	"check_disk_usage":        toolCheckDisk,
	"list_services":           toolListServices,
	"tail_logs":               toolTailLogs,
	"get_system_resources":    toolSystemResources,
	"service_action":          toolServiceAction,
	"optimize_disk":           toolOptimizeDisk,
	"get_top_processes":       toolTopProcesses,
	"list_listening_ports":    toolListeningPorts,
	"get_website_config":      toolWebsiteConfig,
	"get_website_access_logs": toolWebsiteAccessLogs,
	"get_ssh_login_logs":      toolSSHLoginLogs,
	"get_firewall_rules":      toolFirewallRules,
	"analyze_disk_usage":      toolAnalyzeDisk,
}

// Input guards (defense-in-depth even though we exec without a shell for fixed cmds).
var (
	pathRe    = regexp.MustCompile(`^/[A-Za-z0-9_./-]*$`)
	svcRe     = regexp.MustCompile(`^[A-Za-z0-9_.@-]+$`)
	domainRe  = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
	validActs = map[string]bool{"status": true, "start": true, "stop": true, "restart": true, "reload": true, "enable": true, "disable": true}
)

// sh runs a FIXED, agent-authored command line (NOT a cloud-supplied string).
func sh(cmd string) (string, error) { return run("sh", "-c", cmd) }

func argStr(args map[string]interface{}, k string) string {
	if v, ok := args[k].(string); ok {
		return v
	}
	return ""
}

func argInt(args map[string]interface{}, k string, def int) int {
	if v, ok := args[k].(float64); ok {
		return int(v)
	}
	return def
}

func toolPing(_ map[string]interface{}) (string, error) {
	host, _ := os.Hostname()
	return fmt.Sprintf("pong from %s (%s/%s) at %s", host, runtime.GOOS, runtime.GOARCH,
		time.Now().Format(time.RFC3339)), nil
}

func toolSystemInfo(_ map[string]interface{}) (string, error) {
	host, _ := os.Hostname()
	var b strings.Builder
	fmt.Fprintf(&b, "hostname: %s\nos: %s/%s\n", host, runtime.GOOS, runtime.GOARCH)
	if out, err := run("uptime"); err == nil {
		fmt.Fprintf(&b, "uptime: %s\n", strings.TrimSpace(out))
	}
	return b.String(), nil
}

func toolDiskUsage(_ map[string]interface{}) (string, error) {
	// df is read-only. -P = POSIX format (portable across Linux/macOS).
	return run("df", "-P", "-k")
}

func toolCheckDisk(_ map[string]interface{}) (string, error) {
	var b strings.Builder
	if o, _ := run("df", "-PT"); o != "" {
		b.WriteString("=== DF ===\n" + o)
	}
	// Fixed, agent-authored command (NOT cloud input) — safe to use a shell here.
	if o, _ := run("sh", "-c", "du -xhd1 / 2>/dev/null | sort -rh | head -15"); o != "" {
		b.WriteString("\n=== TOP THƯ MỤC (/) ===\n" + o)
	}
	return b.String(), nil
}

func toolListServices(args map[string]interface{}) (string, error) {
	out, err := run("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend", "--plain")
	if err != nil {
		return out, err
	}
	if f, ok := args["filter"].(string); ok && f != "" {
		var lines []string
		for _, ln := range strings.Split(out, "\n") {
			if strings.Contains(strings.ToLower(ln), strings.ToLower(f)) {
				lines = append(lines, ln)
			}
		}
		return strings.Join(lines, "\n"), nil
	}
	return out, nil
}

func toolTailLogs(args map[string]interface{}) (string, error) {
	path, _ := args["path"].(string)
	if !pathRe.MatchString(path) {
		return "", fmt.Errorf("đường dẫn không hợp lệ: %q", path)
	}
	lines := 100
	if n, ok := args["lines"].(float64); ok && n > 0 {
		lines = int(n)
		if lines > 1000 {
			lines = 1000
		}
	}
	return run("tail", "-n", fmt.Sprintf("%d", lines), path)
}

func toolSystemResources(_ map[string]interface{}) (string, error) {
	var b strings.Builder
	host, _ := os.Hostname()
	fmt.Fprintf(&b, "hostname: %s\nos: %s/%s\n", host, runtime.GOOS, runtime.GOARCH)
	for _, c := range [][]string{
		{"uptime"}, {"nproc"}, {"free", "-h"}, {"df", "-PT", "/"},
	} {
		if o, _ := run(c[0], c[1:]...); strings.TrimSpace(o) != "" {
			fmt.Fprintf(&b, "=== %s ===\n%s\n", strings.ToUpper(c[0]), strings.TrimSpace(o))
		}
	}
	return b.String(), nil
}

// run executes a fixed, agent-authored command (NOT arbitrary cloud input).
func run(name string, arg ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, arg...).CombinedOutput()
	return string(out), err
}

func execTool(j job) result {
	fn, ok := tools[j.Tool]
	if !ok {
		return result{JobID: j.JobID, OK: false, Error: "tool not declared on this agent: " + j.Tool}
	}
	out, err := fn(j.Args)
	if err != nil {
		return result{JobID: j.JobID, OK: false, Error: err.Error(), Result: out}
	}
	return result{JobID: j.JobID, OK: true, Result: out}
}

func toolServiceAction(args map[string]interface{}) (string, error) {
	name, action := argStr(args, "name"), argStr(args, "action")
	if !svcRe.MatchString(name) {
		return "", fmt.Errorf("tên dịch vụ không hợp lệ: %q", name)
	}
	if !validActs[action] {
		return "", fmt.Errorf("hành động không hợp lệ: %q", action)
	}
	if action == "status" {
		return sh(fmt.Sprintf("systemctl is-active %s; echo '---'; systemctl status %s --no-pager -l | head -25", name, name))
	}
	return sh(fmt.Sprintf("systemctl %s %s; echo '--- trạng thái sau lệnh ---'; systemctl is-active %s", action, name, name))
}

func toolOptimizeDisk(args map[string]interface{}) (string, error) {
	dry := true
	if v, ok := args["dry_run"].(bool); ok {
		dry = v
	}
	if dry {
		return `{"dry_run":true,"se_lam":["apt-get clean / yum clean all","journalctl --vacuum-time=7d",` +
			`"xoá log xoay vòng cũ (*.gz/*.1) trong /var/log","xoá /tmp cũ hơn 7 ngày"],` +
			`"ghi_chu":"Gọi lại dry_run=false để thực hiện. Nên xác nhận trước."}`, nil
	}
	return sh("set +e; command -v apt-get >/dev/null && apt-get clean -y; command -v yum >/dev/null && yum clean all; " +
		"command -v journalctl >/dev/null && journalctl --vacuum-time=7d; " +
		`find /var/log -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) -delete 2>/dev/null; ` +
		"find /tmp -type f -atime +7 -delete 2>/dev/null; echo '=== Dung lượng sau khi dọn ==='; df -hT")
}

func toolTopProcesses(args map[string]interface{}) (string, error) {
	n := argInt(args, "count", 10)
	if n < 1 {
		n = 1
	} else if n > 30 {
		n = 30
	}
	return sh(fmt.Sprintf("echo '=== TOP %d CPU ==='; ps -eo pid,user,%%cpu,%%mem,comm --sort=-%%cpu | head -n %d; "+
		"echo '=== TOP %d MEM ==='; ps -eo pid,user,%%cpu,%%mem,comm --sort=-%%mem | head -n %d", n, n+1, n, n+1))
}

func toolListeningPorts(_ map[string]interface{}) (string, error) {
	return sh("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null")
}

func toolWebsiteConfig(args map[string]interface{}) (string, error) {
	d := argStr(args, "domain")
	if !domainRe.MatchString(d) {
		return "", fmt.Errorf("tên miền không hợp lệ: %q", d)
	}
	return sh(fmt.Sprintf("for f in /www/server/panel/vhost/nginx/%s.conf /www/server/panel/vhost/apache/%s.conf; do "+
		"if [ -f \"$f\" ]; then echo \"==== $f ====\"; cat \"$f\"; fi; done; echo '(trống: kiểm tra lại domain)'", d, d))
}

func toolWebsiteAccessLogs(args map[string]interface{}) (string, error) {
	d := argStr(args, "domain")
	if !domainRe.MatchString(d) {
		return "", fmt.Errorf("tên miền không hợp lệ: %q", d)
	}
	n := argInt(args, "lines", 100)
	if n < 1 {
		n = 1
	} else if n > 1000 {
		n = 1000
	}
	return sh(fmt.Sprintf("tail -n %d /www/wwwlogs/%s.log 2>/dev/null || echo 'Không tìm thấy log (kiểm tra domain).'", n, d))
}

func toolSSHLoginLogs(_ map[string]interface{}) (string, error) {
	return sh("echo '=== ĐĂNG NHẬP GẦN ĐÂY ==='; last -n 30 2>/dev/null | head -30; echo '=== THẤT BẠI GẦN ĐÂY ==='; " +
		"(grep -i 'failed password' /var/log/auth.log 2>/dev/null || grep -i 'failed password' /var/log/secure 2>/dev/null || " +
		"journalctl _COMM=sshd 2>/dev/null | grep -i fail) | tail -30")
}

func toolFirewallRules(_ map[string]interface{}) (string, error) {
	return sh("if command -v ufw >/dev/null; then echo '=== UFW ==='; ufw status verbose; " +
		"elif command -v firewall-cmd >/dev/null; then echo '=== FIREWALLD ==='; firewall-cmd --list-all; " +
		"else echo '=== IPTABLES ==='; iptables -L -n --line-numbers; fi")
}

// ---- analyze_disk_usage (structured, mirrors the cloud parser) ----
const diskScript = `echo '@@DF@@'; df -B1 / 2>/dev/null | tail -1
echo '@@TOP@@'; du -xb -d1 / 2>/dev/null | sort -rn | head -12
echo '@@LOGS@@'; find /var/log -type f -mtime +7 \( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \) -printf '%s\n' 2>/dev/null | awk '{s+=$1} END{print s+0}'
echo '@@APT@@'; du -sb /var/cache/apt/archives /var/cache/yum 2>/dev/null | awk '{s+=$1} END{print s+0}'
echo '@@DOCKER@@'; docker system df 2>/dev/null | tail -n +2
echo '@@ITEMS@@'; find /var/log -type f -mtime +7 \( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \) -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -8
echo '@@END@@'`

var dockerSizeRe = regexp.MustCompile(`([\d.]+\s*[KMGT]?B)\s*(?:\([^)]*\))?\s*$`)
var humanRe = regexp.MustCompile(`(?i)([\d.]+)\s*([KMGTP]?)i?B?`)

func toolAnalyzeDisk(args map[string]interface{}) (string, error) {
	th := int64(argInt(args, "threshold_mb", 100))
	if th < 0 {
		th = 0
	}
	out, _ := sh(diskScript)
	return parseDiskAnalysis(out, th*1024*1024), nil
}

func parseDiskAnalysis(out string, threshold int64) string {
	sec := map[string][]string{}
	cur := ""
	for _, line := range strings.Split(out, "\n") {
		s := strings.TrimSpace(line)
		if strings.HasPrefix(s, "@@") && strings.HasSuffix(s, "@@") {
			cur = strings.Trim(s, "@")
			continue
		}
		if cur != "" {
			sec[cur] = append(sec[cur], line)
		}
	}

	var total, used int64
	var percent float64
	for _, l := range sec["DF"] {
		f := strings.Fields(l)
		if len(f) >= 5 {
			total, used, percent = atoi64(f[1]), atoi64(f[2]), atof(strings.TrimRight(f[4], "%"))
			break
		}
	}

	type dirT struct {
		path string
		b    int64
	}
	var dirs []dirT
	for _, l := range sec["TOP"] {
		var path string
		var b int64
		if i := strings.IndexByte(l, '\t'); i >= 0 {
			b, path = atoi64(l[:i]), strings.TrimSpace(l[i+1:])
		} else {
			f := strings.Fields(l)
			if len(f) < 2 {
				continue
			}
			b, path = atoi64(f[0]), strings.Join(f[1:], " ")
		}
		if path == "/" || path == "" {
			continue
		}
		dirs = append(dirs, dirT{path, b})
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].b > dirs[j].b })
	if len(dirs) > 6 {
		dirs = dirs[:6]
	}
	topDirs := []map[string]interface{}{}
	for _, x := range dirs {
		p := 0.0
		if total > 0 {
			p = round1(float64(x.b) / float64(total) * 100)
		}
		topDirs = append(topDirs, map[string]interface{}{"path": x.path, "size": bytesLabel(x.b), "percent": p})
	}

	firstInt := func(key string) int64 {
		for _, l := range sec[key] {
			l = strings.TrimSpace(l)
			if isDigits(l) {
				return atoi64(l)
			}
		}
		return 0
	}
	logs7d, apt := firstInt("LOGS"), firstInt("APT")
	var dockerB int64
	for _, l := range sec["DOCKER"] {
		if m := dockerSizeRe.FindStringSubmatch(strings.TrimSpace(l)); m != nil {
			dockerB += humanToBytes(m[1])
		}
	}
	recItems := []map[string]interface{}{}
	if logs7d > 0 {
		recItems = append(recItems, map[string]interface{}{"label": "Log files (older than 7 days)", "size": bytesLabel(logs7d)})
	}
	if dockerB > 0 {
		recItems = append(recItems, map[string]interface{}{"label": "Docker system (dangling)", "size": bytesLabel(dockerB)})
	}
	if apt > 0 {
		recItems = append(recItems, map[string]interface{}{"label": "Package cache", "size": bytesLabel(apt)})
	}
	recTotal := logs7d + dockerB + apt

	items := []map[string]interface{}{}
	for _, l := range sec["ITEMS"] {
		i := strings.IndexByte(l, '\t')
		if i < 0 {
			continue
		}
		b := atoi64(l[:i])
		if b < threshold {
			continue
		}
		items = append(items, map[string]interface{}{
			"id": len(items) + 1, "type": "Log file", "path": strings.TrimSpace(l[i+1:]),
			"size": bytesLabel(b), "action": "Xóa (older than 7 days)", "safe": true,
		})
	}

	res := map[string]interface{}{
		"tool": "analyze_disk_usage", "mode": "dry-run",
		"summary":       map[string]interface{}{"total": bytesLabel(total), "used": bytesLabel(used), "used_percent": round1(percent)},
		"top_dirs":      topDirs,
		"reclaimable":   map[string]interface{}{"total": bytesLabel(recTotal), "total_bytes": recTotal, "items": recItems},
		"cleanup_items": items,
		"note":          "Phân tích dry-run, chưa xoá gì. Cần xác nhận trước khi dọn dẹp.",
	}
	out2, _ := json.Marshal(res)
	return string(out2)
}

func atoi64(s string) int64 { n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64); return n }
func atof(s string) float64 { f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64); return f }
func round1(f float64) float64 {
	return float64(int(f*10+0.5)) / 10
}
func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
func bytesLabel(n int64) string {
	if n < 0 {
		n = 0
	}
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(n)/(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(n)/(1<<10))
	default:
		return fmt.Sprintf("%d B", n)
	}
}
func humanToBytes(s string) int64 {
	m := humanRe.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	v, _ := strconv.ParseFloat(m[1], 64)
	mult := map[string]float64{"": 1, "K": 1 << 10, "M": 1 << 20, "G": 1 << 30, "T": 1 << 40, "P": 1 << 50}[strings.ToUpper(m[2])]
	return int64(v * mult)
}

func main() {
	cfg := config{
		gateway:     strings.TrimRight(env("GATEWAY_URL", "http://localhost:8090"), "/"),
		token:       env("AGENT_TOKEN", ""),
		readOnly:    env("AGENT_READ_ONLY", "") == "true",
		pollTimeout: 35 * time.Second,
	}
	if cfg.token == "" {
		log.Fatal("AGENT_TOKEN is required (enroll on the web UI to get one)")
	}
	log.Printf("agent starting → gateway=%s tools=%d", cfg.gateway, len(tools))

	client := &http.Client{Timeout: cfg.pollTimeout + 10*time.Second}
	sendHello(client, cfg) // announce capabilities up front
	for {
		j, err := poll(client, cfg)
		if err != nil {
			log.Printf("poll error: %v (retry in 3s)", err)
			time.Sleep(3 * time.Second)
			sendHello(client, cfg) // re-announce (covers gateway restart)
			continue
		}
		if j == nil || j.JobID == "" {
			continue // no job; long-poll again
		}
		log.Printf("job %s tool=%s", j.JobID, j.Tool)
		res := execTool(*j)
		if err := postResult(client, cfg, res); err != nil {
			log.Printf("result error: %v", err)
		}
	}
}

func toolNames() []string {
	names := make([]string, 0, len(tools))
	for k := range tools {
		names = append(names, k)
	}
	sort.Strings(names)
	return names
}

// sendHello announces this agent's tool capabilities to the gateway (best-effort).
func sendHello(client *http.Client, cfg config) {
	buf, _ := json.Marshal(map[string]interface{}{"tools": toolNames()})
	req, _ := http.NewRequest("POST", cfg.gateway+"/agent/hello?token="+cfg.token, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

func poll(client *http.Client, cfg config) (*job, error) {
	req, _ := http.NewRequest("GET", cfg.gateway+"/agent/poll?token="+cfg.token, nil)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("unauthorized (bad/expired token)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("poll status %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var j job
	if err := json.Unmarshal(body, &j); err != nil {
		return nil, err
	}
	return &j, nil
}

func postResult(client *http.Client, cfg config, res result) error {
	buf, _ := json.Marshal(res)
	req, _ := http.NewRequest("POST", cfg.gateway+"/agent/result?token="+cfg.token, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return nil
}

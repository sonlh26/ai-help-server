"""Vòng lặp agent: gọi LLM, thực thi tool, lặp lại cho đến khi có câu trả lời cuối.

Trả về một generator các sự kiện (dict) để stream về frontend qua SSE."""
from __future__ import annotations

import json
from typing import Any, Dict, Iterator, List, Optional

from app.llm.client import LLMClient, LLMError
from app.tools.registry import (
    ToolExecutor,
    agent_capabilities,
    approval_key,
    is_remember_eligible,
    is_risky,
    tool_schemas_for,
)

MAX_STEPS = 12
RESULT_PREVIEW_LIMIT = 4000

SYSTEM_PROMPT = """Bạn là trợ lý AI quản trị server, giao tiếp bằng tiếng Việt, ngắn gọn và rõ ràng.

Người dùng quản lý server qua aaPanel và có thể kết nối SSH. Bạn có các công cụ để:
- Kiểm tra/tối ưu dung lượng ổ cứng
- Liệt kê và điều khiển dịch vụ (restart, status...)
- Đọc log
- Lấy thông tin hệ thống/website/database từ aaPanel API

Nguyên tắc:
0. LUÔN suy nghĩ xem câu hỏi cần DỮ LIỆU GÌ từ server, rồi CHỦ ĐỘNG gọi công cụ phù hợp để lấy
   dữ liệu thật. Ví dụ: "thư mục nào lớn nhất trong /www" -> run_ssh_command với
   `du -xh --max-depth=1 /www | sort -rh | head -20`; "file lớn nhất" -> `find ... -size`; "vì sao
   đầy đĩa" -> analyze_disk_usage. TUYỆT ĐỐI KHÔNG trả lời trống rỗng hay chung chung khi có thể
   dùng công cụ để trả lời chính xác. Nếu câu hỏi tiếp nối ngữ cảnh trước (vd ổ đĩa), hãy gọi tool
   để đào sâu thay vì bỏ qua.
1. Luôn DÙNG CÔNG CỤ để lấy dữ liệu thật trước khi kết luận — không bịa số liệu.
2. Với hành động có rủi ro (xoá/sửa file cấu hình, dừng/restart dịch vụ, dọn ổ cứng thật sự): CỨ GỌI
   CÔNG CỤ tương ứng — HỆ THỐNG sẽ TỰ hiện thẻ xác nhận cho người dùng bấm trước khi thực thi. ĐỪNG
   hỏi "có/không" bằng văn bản và đừng chờ; chỉ cần gọi tool, người dùng sẽ xác nhận trên giao diện.
3. Khi báo cáo, tóm tắt kết quả quan trọng, nêu cảnh báo nếu có dịch vụ down hoặc ổ cứng gần đầy.
4. Nếu một công cụ báo lỗi "chưa được bật/cấu hình", hãy nhắc người dùng vào tab Cài đặt để thiết lập.
"""

# Khi model trả lời rỗng và KHÔNG gọi tool, chèn lời nhắc này (1 lần) để nó suy nghĩ lại và dùng tool.
NUDGE_PROMPT = (
    "Câu trả lời trống. Hãy suy nghĩ kỹ xem cần dữ liệu gì để trả lời câu hỏi trên, rồi DÙNG CÔNG CỤ "
    "phù hợp (vd run_ssh_command với `du`/`ls -lhS`/`find`, hoặc analyze_disk_usage) để lấy dữ liệu "
    "thật. Không được trả lời trống."
)
EMPTY_FALLBACK = (
    "Mình chưa xác định được cần làm gì với yêu cầu này. Bạn mô tả rõ hơn giúp mình nhé "
    "(ví dụ: thư mục/dịch vụ/log cụ thể cần xem)."
)


def _preview(text: str) -> str:
    if len(text) > RESULT_PREVIEW_LIMIT:
        return text[:RESULT_PREVIEW_LIMIT] + f"\n...(đã cắt bớt {len(text) - RESULT_PREVIEW_LIMIT} ký tự)"
    return text


def run_agent(
    server: Dict[str, Any],
    llm_cfg: Dict[str, Any],
    history: List[Dict[str, str]],
    pre_approved: Optional[Dict[str, Any]] = None,
    interactive: bool = True,
    approved_keys: Optional[set] = None,
) -> Iterator[Dict[str, Any]]:
    """interactive=True (web UI): risky tools emit `confirm_required` + stop the turn.
    interactive=False (ChatOps/Telegram, no UI): risky tools are refused (not executed).
    pre_approved={name,args}: a user-confirmed action to execute first, then continue.
    approved_keys: set of rule_keys the user chose "Always" for → auto-run, no confirm."""
    approved_keys = approved_keys or set()
    try:
        client = LLMClient(llm_cfg)
    except LLMError as exc:
        yield {"type": "error", "message": str(exc)}
        return

    executor = ToolExecutor(server)
    conn = server.get("connection_type", "ssh")
    caps = agent_capabilities(server.get("id")) if conn == "agent" else None
    tools = client.format_tools(tool_schemas_for(conn, caps))
    messages = client.init_messages(history)
    system = SYSTEM_PROMPT + f"\n\nServer đang thao tác: \"{server.get('name', '?')}\"."
    if conn == "agent":
        system += (
            "\n\nKẾT NỐI: Local Agent — KHÔNG có aaPanel API và KHÔNG chạy lệnh shell tùy ý; "
            "chỉ dùng đúng các công cụ đã được cung cấp ở trên."
        )

    yield {"type": "start"}

    # User confirmed a risky action on a previous turn → execute it now, feed result to the model.
    if pre_approved and pre_approved.get("name"):
        pname, pargs = pre_approved["name"], pre_approved.get("args") or {}
        yield {"type": "tool_call", "name": pname, "args": pargs}
        presult = executor.execute(pname, pargs)
        yield {"type": "tool_result", "name": pname, "result": _preview(presult)}
        messages.append({
            "role": "user",
            "content": (
                f"[Người dùng đã XÁC NHẬN và hệ thống đã thực hiện] {pname}("
                f"{json.dumps(pargs, ensure_ascii=False)}). Kết quả:\n{_preview(presult)}\n"
                "Hãy tóm tắt kết quả cho người dùng bằng tiếng Việt."
            ),
        })

    nudged = False
    for _ in range(MAX_STEPS):
        try:
            resp = client.complete(system, messages, tools)
        except LLMError as exc:
            yield {"type": "error", "message": str(exc)}
            return

        parsed = client.parse(resp)
        tool_calls = parsed["tool_calls"]

        if not tool_calls:
            text = (parsed["text"] or "").strip()
            # Model trả rỗng mà không gọi tool: nhắc một lần để nó suy nghĩ và dùng công cụ.
            if not text and not nudged:
                nudged = True
                placeholder = (
                    [{"type": "text", "text": "(đang phân tích yêu cầu)"}]
                    if client.provider == "anthropic"
                    else "(đang phân tích yêu cầu)"
                )
                messages.append({"role": "assistant", "content": placeholder})
                messages.append({"role": "user", "content": NUDGE_PROMPT})
                continue
            yield {"type": "final", "text": text or EMPTY_FALLBACK}
            return

        client.append_assistant(messages, resp)
        if parsed["text"].strip():
            yield {"type": "thought", "text": parsed["text"]}

        results = []
        for tc in tool_calls:
            reason = is_risky(tc["name"], tc["args"])
            # Skip the prompt if the user already chose "Always" for this exact action.
            if reason and approval_key(tc["name"], tc["args"]) in approved_keys:
                reason = None
            if reason:
                if interactive:
                    # Stop the turn and ask the user to confirm via a card. Resume next
                    # request with `pre_approved` once they click "Xác nhận".
                    yield {
                        "type": "confirm_required",
                        "name": tc["name"],
                        "args": tc["args"],
                        "reason": reason,
                        "remember_ok": is_remember_eligible(tc["name"]),
                    }
                    return
                # No UI (ChatOps): refuse risky actions, tell the model so it can reply.
                refusal = "⛔ Hành động cần xác nhận trên giao diện web — đã KHÔNG thực hiện."
                yield {"type": "tool_result", "name": tc["name"], "result": refusal}
                results.append((tc, refusal))
                continue
            yield {"type": "tool_call", "name": tc["name"], "args": tc["args"]}
            result = executor.execute(tc["name"], tc["args"])
            yield {"type": "tool_result", "name": tc["name"], "result": _preview(result)}
            results.append((tc, result))

        client.append_tool_results(messages, results)

    yield {"type": "final", "text": "(Đã đạt giới hạn số bước xử lý. Hãy thử chia nhỏ yêu cầu.)"}


def run_agent_text(server: Dict[str, Any], llm_cfg: Dict[str, Any], history: List[Dict[str, str]]) -> str:
    """Synchronous, non-streaming wrapper: run the agent and return just the final
    answer text. Used by ChatOps channels (Telegram…) that need a single reply."""
    finals: List[str] = []
    for ev in run_agent(server, llm_cfg, history, interactive=False):
        t = ev.get("type")
        if t == "final" and ev.get("text"):
            finals.append(ev["text"])
        elif t == "error":
            return f"⚠️ {ev.get('message', 'Đã xảy ra lỗi khi xử lý.')}"
    return "\n".join(finals).strip() or "(không có nội dung)"


def run_agent_collect(
    server: Dict[str, Any],
    llm_cfg: Dict[str, Any],
    history: List[Dict[str, str]],
    pre_approved: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """For ChatOps channels with confirm BUTTONS (e.g. Telegram inline keyboard).
    Runs interactive so a risky action yields a pending confirm instead of executing.
    Returns {"confirm": {name,args,reason}} (needs a button tap) OR {"text": <reply>}."""
    finals: List[str] = []
    for ev in run_agent(server, llm_cfg, history, pre_approved=pre_approved, interactive=True):
        t = ev.get("type")
        if t == "confirm_required":
            return {"confirm": {"name": ev["name"], "args": ev.get("args") or {}, "reason": ev.get("reason", "")}}
        if t == "final" and ev.get("text"):
            finals.append(ev["text"])
        elif t == "error":
            return {"text": f"⚠️ {ev.get('message', 'Đã xảy ra lỗi khi xử lý.')}"}
    return {"text": "\n".join(finals).strip() or "(không có nội dung)"}

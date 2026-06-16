"""LLM client hợp nhất cho 2 định dạng: OpenAI-compatible và Anthropic Messages API.

Cả hai đều hỗ trợ tool-use. Lớp này chuẩn hoá việc gọi, parse và nối tiếp lịch sử hội thoại
để vòng lặp agent (agent.py) dùng chung một giao diện."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import httpx


class LLMError(Exception):
    pass


class LLMClient:
    def __init__(self, llm_cfg: Dict[str, Any]) -> None:
        self.provider = (llm_cfg.get("provider") or "openai").lower()
        self.base_url = (llm_cfg.get("base_url") or "").rstrip("/")
        self.api_key = llm_cfg.get("api_key") or ""
        self.model = llm_cfg.get("model") or ""
        self.temperature = llm_cfg.get("temperature", 0.2)
        self.max_tokens = int(llm_cfg.get("max_tokens", 2048))
        if not self.base_url:
            raise LLMError("Chưa cấu hình base_url cho LLM.")
        if not self.api_key:
            raise LLMError("Chưa cấu hình api_key cho LLM.")
        if not self.model:
            raise LLMError("Chưa cấu hình model cho LLM.")

    # ---- Khởi tạo lịch sử theo định dạng nhà cung cấp ----
    def init_messages(self, history: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        msgs: List[Dict[str, Any]] = []
        for m in history:
            role = m.get("role")
            content = m.get("content", "")
            if role not in ("user", "assistant") or not content:
                continue
            msgs.append({"role": role, "content": content})
        return msgs

    def format_tools(self, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if self.provider == "anthropic":
            return [
                {
                    "name": t["name"],
                    "description": t["description"],
                    "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
                }
                for t in tools
            ]
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t.get("parameters", {"type": "object", "properties": {}}),
                },
            }
            for t in tools
        ]

    # ---- Gọi API ----
    def complete(self, system: str, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> Any:
        if self.provider == "anthropic":
            url = self.base_url + "/messages"
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            body = {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "system": system,
                "messages": messages,
                "tools": tools,
                "temperature": self.temperature,
                "stream": False,
            }
        else:
            url = self.base_url + "/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            body = {
                "model": self.model,
                "messages": [{"role": "system", "content": system}] + messages,
                "tools": tools,
                "tool_choice": "auto",
                "temperature": self.temperature,
                "stream": False,
            }
        try:
            with httpx.Client(timeout=120) as client:
                resp = client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise LLMError(f"Lỗi kết nối LLM: {exc}") from exc
        if resp.status_code >= 400:
            raise LLMError(f"LLM trả về {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError:
            body = (resp.text or "").strip()
            hint = " (kiểm tra LLM_API_KEY / LLM_BASE_URL / LLM_MODEL)" if not body else ""
            raise LLMError(f"LLM trả về phản hồi không phải JSON{hint}: {body[:300]!r}")

    # ---- Parse phản hồi -> {text, tool_calls:[{id,name,args}]} ----
    def parse(self, resp: Any) -> Dict[str, Any]:
        if self.provider == "anthropic":
            blocks = resp.get("content", []) or []
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            tool_calls = [
                {"id": b["id"], "name": b["name"], "args": b.get("input", {})}
                for b in blocks
                if b.get("type") == "tool_use"
            ]
            return {"text": text, "tool_calls": tool_calls}
        msg = (resp.get("choices") or [{}])[0].get("message", {}) or {}
        text = msg.get("content") or ""
        tool_calls = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            try:
                parsed_args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                parsed_args = {}
            tool_calls.append({"id": tc.get("id"), "name": fn.get("name"), "args": parsed_args})
        return {"text": text, "tool_calls": tool_calls}

    # ---- Nối lịch sử ----
    def append_assistant(self, messages: List[Dict[str, Any]], resp: Any) -> None:
        if self.provider == "anthropic":
            messages.append({"role": "assistant", "content": resp.get("content", [])})
        else:
            messages.append((resp.get("choices") or [{}])[0].get("message", {}))

    def append_tool_results(
        self, messages: List[Dict[str, Any]], results: List[Tuple[Dict[str, Any], str]]
    ) -> None:
        if self.provider == "anthropic":
            content = [
                {"type": "tool_result", "tool_use_id": tc["id"], "content": result}
                for tc, result in results
            ]
            messages.append({"role": "user", "content": content})
        else:
            for tc, result in results:
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})

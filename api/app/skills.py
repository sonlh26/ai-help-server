"""Preset diagnosis 'skills' (replicating aaPanel's internal AI skills, which are NOT
remotely callable). Each is a prompt the AI agent runs using its tools."""
from __future__ import annotations

from typing import Dict, List

SKILLS: List[Dict[str, str]] = [
    {"key": "disk", "name": "Chẩn đoán ổ cứng", "category": "Performance",
     "prompt": "Dùng công cụ analyze_disk_usage để phân tích dung lượng ổ cứng (dry-run): tổng quan, thư mục lớn nhất và ước tính dung lượng có thể giải phóng. Tóm tắt kết quả và hỏi xác nhận trước, đừng thực thi xoá."},
    {"key": "service", "name": "Chẩn đoán dịch vụ", "category": "System",
     "prompt": "Liệt kê các dịch vụ và trạng thái, chỉ ra dịch vụ nào đang down hoặc bất thường."},
    {"key": "performance", "name": "Phân tích hiệu năng", "category": "Performance",
     "prompt": "Phân tích CPU, RAM, tải hệ thống và xác định điểm nghẽn nếu có."},
    {"key": "security", "name": "Chẩn đoán bảo mật", "category": "Security",
     "prompt": "Kiểm tra dấu hiệu rủi ro bảo mật: tiến trình lạ, kết nối bất thường, đăng nhập đáng ngờ."},
    {"key": "website", "name": "Chẩn đoán website", "category": "Operations",
     "prompt": "Liệt kê website trong aaPanel và kiểm tra trạng thái chạy của chúng."},
    {"key": "ssl", "name": "Chẩn đoán SSL", "category": "Security",
     "prompt": "Kiểm tra chứng chỉ SSL của các website và cảnh báo cái nào sắp hết hạn."},
    {"key": "database", "name": "Chẩn đoán database", "category": "Database",
     "prompt": "Liệt kê database và kiểm tra dung lượng, dấu hiệu phình to bất thường."},
    {"key": "log", "name": "Phân tích log", "category": "Operations",
     "prompt": "Đọc log hệ thống gần đây và tóm tắt lỗi/bất thường đáng chú ý."},
    {"key": "cron", "name": "Chẩn đoán cron", "category": "System",
     "prompt": "Liệt kê cron job trong aaPanel và đánh giá cấu hình, lần chạy gần nhất."},
]

SKILL_PROMPTS = {s["key"]: s["prompt"] for s in SKILLS}

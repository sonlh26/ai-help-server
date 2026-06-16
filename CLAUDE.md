# CLAUDE.md - Multiprofile V2 Windows

## Ngôn ngữ giao tiếp

**LUÔN LUÔN trả lời bằng tiếng Việt.** Mọi giải thích, báo cáo, câu hỏi, và tương tác với người dùng đều phải bằng tiếng Việt. Code, tên biến, commit message, và tài liệu kỹ thuật (comments) vẫn viết bằng tiếng Anh.
## Quy tắc quan trọng

- KHÔNG dùng mock/fake data trong tests - phải test thật
- KHÔNG thêm feature thừa ngoài yêu cầu (YAGNI)
- Giữ code đơn giản (KISS), không over-engineer
- Luôn kiểm tra version git trước khi bắt đầu code. nếu chưa pull code về thì git pull trước khi code
- Commit message bằng tiếng Anh, theo conventional commits
- Khi sửa code, đọc file trước rồi mới sửa

Yêu cầu chung:
- Hỏi mình 2 thông tin trước khi làm: (1) hệ điều hành (Windows/macOS/Linux), (2) mình muốn cài bằng package manager nào nếu có (Windows: winget/choco, macOS: brew).
- Sau đó tự làm tuần tự, mỗi bước xong phải xác nhận kết quả bằng lệnh kiểm tra version.
- Nếu thiếu quyền admin hoặc gặp lỗi, dừng lại và đưa đúng câu lệnh để mình chạy, rồi tiếp tục.

Các bước cần làm:
1) Kiểm tra hiện trạng:
   - node -v
   - npm -v
   - git --version
   - (nếu có) npx --version
   Báo rõ cái nào thiếu / version nào không đạt.

2) Cài đặt/ nâng cấp các thành phần tối thiểu:
   - Node.js >= 18 (khuyến nghị 20 LTS)
   - Git (nếu chưa có)
   - Đảm bảo npm hoạt động bình thường

   Windows:
   - Ưu tiên winget (nếu có), nếu không có thì hướng dẫn bật/cài hoặc dùng choco.
   macOS:
   - Ưu tiên brew; nếu chưa có brew thì cài brew trước.

3) Tạo project Next.js mới:
   - Tạo thư mục dự án `landing-page`
   - Dùng create-next-app với các lựa chọn:
     - TypeScript: Yes
     - Tailwind: Yes
     - App Router: Yes
     - ESLint: Yes
     - import alias: theo mặc định hoặc @/*
   - Sau khi tạo xong, cd vào project và chạy `npm install` nếu cần.

4) Cài thư viện cần thiết cho landing page:
   - framer-motion
   - lucide-react (icons)
   - next-themes (dark/light mode)
   - clsx + tailwind-merge (class utilities)

5) Tạo cấu trúc thư mục gọn:
   - app/(marketing)/page.tsx (hoặc cách tổ chức tương đương trong App Router)
   - components/
   - lib/
   - styles/ (nếu cần)
   Không code dài; chỉ tạo skeleton tối thiểu để chạy.

6) Chạy thử:
   - npm run dev
   - Hướng dẫn mình mở http://localhost:3000
   - Nếu port bận, tự đổi port và báo lại.

7) Nghiệm thu cuối:
   - In ra bảng tóm tắt: Node version, npm version, git version, các package đã cài.
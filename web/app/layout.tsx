import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Help — Quản trị máy chủ",
  description: "Bảng điều khiển quản lý máy chủ, giám sát và trợ lý AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

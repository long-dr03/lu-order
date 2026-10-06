import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUUTA - Quản Lý Toàn Bộ Quy Trình Sản Xuất & Tính Lương Sản Phẩm",
  description: "Hệ thống quản lý sản xuất thời trang LUUTA: Nhận đơn → Kiểm NPL → Rập → Cắt → May → QC → Sửa → QC lại → Đóng gói → Giao hàng, quản lý 5 chuyền và tính lương sản phẩm",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

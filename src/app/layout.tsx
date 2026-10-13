import { connection } from "next/server";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUUTA - Quản Lý Toàn Bộ Quy Trình Sản Xuất & Tính Lương Sản Phẩm",
  description:
    "Hệ thống quản lý sản xuất thời trang LUUTA: Nhận đơn → Kiểm NPL → Rập → Cắt → May → QC → Sửa → QC lại → Đóng gói → Giao hàng, quản lý 6 bộ phận và tính lương sản phẩm",
  appleWebApp: { capable: true, title: "LUUTA", statusBarStyle: "default" },
};

// viewport-fit=cover lets the page reach under the notch and home bar; CSS pads the safe areas.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

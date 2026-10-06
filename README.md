# L u Garment - Quản Lý Đơn Hàng & Tiến Độ Xưởng May

Hệ thống web quản lý đơn hàng thời gian thực thay thế Google Sheet / Excel cho xưởng may và cơ sở gia công sản xuất.

## 🚀 Tính Năng Chính
- **Tổng quan Dashboard:** 4 thẻ KPI (Đang làm, Sắp trễ, Đã trễ, Hoàn thành) lọc nhanh theo trạng thái.
- **Cảnh báo Đơn Cần Xử Lý:** Tự động phát hiện các đơn tắc nghẽn (thiếu vải, chậm may, QC chưa đạt) và hỗ trợ giải quyết nhanh.
- **Bảng Quản Lý Đơn Hàng:** Tìm kiếm tức thì, thanh tiến độ trực quan kết hợp khối ASCII (`██████░░`), đèn trạng thái 🟢 🟡 🔴.
- **Tiến độ Sản xuất (Kanban):** Luân chuyển qua 4 công đoạn (Tổ Cắt → Tổ May → Tổ QC → Đóng Gói).
- **Phân hệ Kiểm định QC:** Duyệt chất lượng xuất xưởng hoặc trả về sửa kèm lý do.
- **Đóng gói & Giao nhận:** Quản lý xuất xưởng và giao hàng.
- **Báo cáo Năng suất:** Tỷ lệ giao đúng hạn, tổng sản lượng, phân bổ tỷ trọng theo tổ.
- **Responsive 100%:** Tối ưu mượt mà trên cả PC, Tablet và Mobile.

## 🛠 Công Nghệ Sử Dụng
- **Next.js 16 (App Router)** + **React 19** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Minimalist design system)
- **Lucide Icons**
- **SQLite (better-sqlite3)** cho môi trường phát triển cục bộ
- **Supabase** kết nối cơ sở dữ liệu Cloud

## 📦 Cài Đặt & Khởi Chạy

```bash
# Cài đặt phụ thuộc
npm install

# Khởi chạy chế độ phát triển
npm run dev

# Hoặc xây dựng bản tối ưu và chạy
npm run build
npm run start
```

Truy cập: [http://localhost:3000](http://localhost:3000)

## 🔑 Biến Môi Trường (.env.local)

Sao chép `.env.example` thành `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_secret_key
DATABASE_PATH=./lu_order.db
```

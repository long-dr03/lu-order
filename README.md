# LUUTA GARMENT - Hệ Thống Quản Lý Sản Xuất & Tính Lương Sản Phẩm

Hệ thống quản lý toàn diện quy trình sản xuất thời trang từ khi nhận đơn đến khi giao hàng, quản lý 5 chuyền may và tính lương sản phẩm cho từng nhân viên.

---

## 🎯 Quy Trình Sản Xuất 11 Công Đoạn Chuẩn LUUTA

Hệ thống bám sát chính xác quy trình thực tế:
1. **Nhận đơn** (`nhan_don`)
2. **Kiểm NPL/Vải** (`kiem_npl`)
3. **Kiểm rập** (`kiem_rap`)
4. **Cắt** (`cat`)
5. **May** (`may`)
6. **QC** (`qc`)
7. **Sửa hàng** (`sua_hang`)
8. **QC lại** (`qc_lai`)
9. **Đóng gói** (`dong_goi`)
10. **Giao hàng** (`giao_hang`)
11. **Hoàn thành** (`hoan_thanh`)

---

## ✨ Các Tính Năng Nổi Bật (Version 1)

### 1. Quản lý Size & Màu (Bắt buộc)
- Phân bổ chi tiết: **Sản phẩm → Màu → Size → Số lượng**.
- Ma trận Màu × Size (XS, S, M, L, XL, XXL) tự động cộng tổng.
- Theo dõi số lượng qua từng công đoạn: Cắt, May, QC đạt, Đóng gói, Đã giao, Còn thiếu.
- Nhìn thấy tức thì đang tắc nghẽn ở Size nào, Màu nào, Công đoạn nào.

### 2. Quản lý 5 Chuyền Sản Xuất
- Quản lý **Chuyền 1 đến Chuyền 5** kèm thông tin tổ trưởng, số thợ và công suất ngày.
- Cảnh báo quá tải chuyền thông minh ($SL\ còn\ lại \div Công\ suất > Số\ ngày\ còn\ lại$).
- Tổ trưởng cập nhật trực tiếp bằng điện thoại.

### 3. Cập nhật Sản lượng & Tính Lương Sản Phẩm
- Form cập nhật mobile-friendly: Ngày, Nhân viên, Chuyền, Đơn, Sản phẩm, Màu, Size, Công đoạn, Số lượng, Đơn giá $\rightarrow$ Thành tiền ($SL \times Đơn\ giá$).
- **Màn hình Tính Lương:** Lọc theo Tháng $\rightarrow$ Nhân viên $\rightarrow$ Chuyền $\rightarrow$ Công đoạn.
- Tự động cộng tổng sản phẩm và tổng tiền công.
- **Nút [CHỐT LƯƠNG THÁNG]:** Khóa dữ liệu cuối tháng, ghi nhận người chốt và thời gian.
- **Nút [XUẤT EXCEL]:** Tải trực tiếp file `.xlsx` đầy đủ bảng tổng hợp và chi tiết.

### 4. Phân hệ QC & Giao hàng
- **QC:** May → QC → Sửa hàng → QC lại → Chỉ khi đạt mới chuyển Đóng gói.
- **Giao hàng:** Kiểm đếm từng Size/Màu đã giao. Tự động cảnh báo còn thiếu (ví dụ: `CÒN THIẾU: Đen L - 2 cái`). Chỉ khi đủ 100% mới chuyển trạng thái `🟢 ĐÃ GIAO ĐỦ`.

### 5. Phân quyền & Nhật ký hệ thống
- Hỗ trợ các vai trò: **Giám đốc**, **Trợ lý sản xuất**, **Tổ trưởng**, **QC**, **Nhân viên**.
- Nhân viên không xem được tiền lương của người khác.
- **Nhật ký thao tác (Audit log):** Lưu vết không thể xóa (Ai làm – Làm gì – Lúc nào).

---

## 🛠 Công Nghệ Sử Dụng
- **Next.js 16 (App Router)** + **React 19** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Phong cách Trắng – Đen – Tối giản – Cao cấp – Fashion)
- **SQLite (better-sqlite3)** với WAL mode cho môi trường local
- **XLSX (SheetJS)** xuất file Excel native
- **Lucide Icons**

---

## 🚀 Cài Đặt & Chạy

```bash
# Cài đặt thư viện
npm install

# Khởi chạy chế độ phát triển
npm run dev

# Hoặc build và chạy bản tối ưu
npm run build
npm run start
```

Truy cập: [http://localhost:3000](http://localhost:3000)

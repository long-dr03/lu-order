# Nhập file "THEO DÕI VÀ KIỂM SOÁT ĐƠN HÀNG" vào LUUTA

Bộ script dùng một lần (10/2026) để đưa file Excel theo dõi của xưởng vào hệ thống.
Cần `pip install openpyxl pillow`.

```bash
python3 parse.py "THEO DÕI VÀ KIỂM SOÁT ĐƠN HÀNG.xlsx" work   # work/raw.json + work/img/
python3 normalize.py work                                      # work/orders.json + bảng rà soát
python3 gen_sql.py work work/import.sql                        # SQL kèm ảnh, chạy trong 1 giao dịch
python3 purge_sql.py "o.id NOT IN ('A','B')" work/purge.sql    # xóa các đơn theo điều kiện (kèm mọi dữ liệu con)
```

Quy tắc chuẩn hóa (`normalize.py`):

- Mỗi khối sản phẩm trong sheet là một đơn; khách hàng là tên sheet; mã đơn `<4 chữ khách><YYMM><số thứ tự>`.
- Đã giao nhiều hơn số đặt của một size thì số đặt được nâng bằng số đã giao.
- Đơn ghi "HOÀN THÀNH" mà còn thiếu thì số đặt được hạ bằng số đã giao (hệ thống chỉ hoàn thành khi giao đủ); con số gốc được ghi lại trong ghi chú.
- Ngày nhận trống hoặc sau lần giao đầu thì lấy 14 ngày trước lần giao đầu.
- Hạn giao: đơn xong lấy ngày giao cuối; đơn dở dang được đặt các mốc tương lai (file gốc không có hạn giao).
- Khối không tên / chỉ ghi màu được đặt tên theo hình sản phẩm (bảng `NAMES`).
- Số cắt lấy cột "SỐ LƯỢNG CẮT THỰC TẾ" nếu có, không thì bằng số đặt; may / QC / đóng gói đặt bằng số đã giao.

File không chứa dữ liệu khách; dữ liệu sinh ra nằm trong thư mục `work/` (không đưa vào git).

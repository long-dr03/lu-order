# Chuyển đổi sang bộ phận — migration 11

## Trước khi chuyển

Dừng ghi nghiệp vụ trên bản local cũ và giữ nguyên `.env.local`. Cần một PostgreSQL **riêng cho kiểm thử** với quyền tạo/xóa database; tuyệt đối không đặt `TEST_DATABASE_URL` trỏ tới server dữ liệu khách. Lệnh migration không in thông tin đăng nhập.

Lần đầu kiểm tra, chưa thay schema nguồn:

```bash
TEST_DATABASE_URL=postgresql://<test-user>:<test-password>@127.0.0.1:5432/postgres npm run db:migrate-departments
```

Lệnh đọc `DATABASE_URL` từ cấu hình local, tạo snapshot đầy đủ trước chuyển trong `BACKUP_DIR`, khôi phục vào database tạm trên server kiểm thử, áp dụng migration và đối chiếu dữ liệu. Database thử được xóa sau kiểm tra. Đối chiếu từng cột lịch sử đơn, biến thể, hồ sơ, sản lượng, QC, nghiệp vụ, phần việc, đơn giá; mật khẩu/định danh tài khoản và tổng tiền công giữ nguyên. Báo cáo tại `artifacts/department-migration.json`; snapshot quyền 600, chứa dữ liệu nhạy cảm, không commit.

Sau khi bộ test, TypeScript, lint và build đạt, áp dụng local:

```bash
TEST_DATABASE_URL=postgresql://<test-user>:<test-password>@127.0.0.1:5432/postgres npm run db:migrate-departments -- --apply
```

`--apply` chỉ cho phép `DATABASE_URL` ở localhost/127.0.0.1/::1; kiểm tra lại bản sao trước khi áp dụng. Khởi động ứng dụng mới cũng gọi migration có khóa và phiên bản, vì vậy hãy chạy kiểm tra bản sao **trước khi khởi động code mới** trên dữ liệu cũ.

## Thay đổi được thực hiện

- Tạo sáu bộ phận có mã ổn định, bảng liên kết hồ sơ–bộ phận nhiều-nhiều; thêm trạng thái hoạt động hồ sơ.
- Tạo phân công theo đơn/công đoạn/phần việc/thợ; đợt giao và chi tiết màu–size. Lưu người ghi nhận tách người thực hiện.
- Thêm bộ phận lịch sử, nguyên nhân, giờ thực tế, liên kết đợt giao vào bản ghi. Bản ghi cũ chưa có thông tin giữ NULL; không suy đoán hoặc bịa dữ liệu.
- Giữ bảng/cột chuyền cũ làm nguồn gốc lịch sử; bỏ yêu cầu số chuyền ở dữ liệu mới. Không ánh xạ số chuyền sang bộ phận.
- Phạm vi quyền `lines` được chuyển thành `departments`; mọi tài khoản nghiệp vụ vẫn phải có bộ phận trong hồ sơ. Scope `all` cũng bị giới hạn bộ phận, trừ Admin/Quản lý theo nghiệp vụ được cấp.
- Thu hồi tất cả session cũ. Tài khoản chỉ có vai trò Nhân viên chuyển sang khóa; hồ sơ/công cũ giữ nguyên.
- Vai trò Trưởng phòng được thêm khi chưa tồn tại với quyền nghiệp vụ, không có quyền giá/lương/quản trị mặc định. Quyền nghiệp vụ đã bị Admin gỡ không tự cấp lại. Khả năng mới “Phân công”/“Quản lý hồ sơ thợ” được thêm cho các vai trò quản lý nghiệp vụ đang có quyền tương ứng; Admin rà soát lại trong giao diện.

Migration có transaction và khóa PostgreSQL, chỉ chạy một lần; không ghi đè cấu hình khi chạy lại. Bỏ phân công, rút bộ phận hoặc ngừng hồ sơ làm ngừng phân công không còn hợp lệ, không xóa lịch sử.

## Admin cần làm sau chuyển đổi

1. Đăng nhập lại bằng tài khoản Admin cũ, mật khẩu không đổi.
2. Mở **Danh sách thợ → Chưa phân loại**. Gán từng người theo nhiệm vụ thực tế; có thể chọn nhiều bộ phận. Không dựa vào tên/số chuyền cũ.
3. Hồ sơ tổ trưởng/QC/người quản lý dùng chính hồ sơ của họ. Admin gán bộ phận cho hồ sơ có tài khoản tại Danh sách thợ hoặc Cấu hình tài khoản. Không chọn một thợ khác làm hồ sơ tổ trưởng.
4. Kiểm tra **Vai trò và quyền** theo từng thao tác. Giao người phụ trách Cắt/May/Đóng gói quyền nhập sản lượng; QC quyền xử lý chất lượng; Giao hàng quyền ghi giao. Chỉ người có quyền phân công được phân công. Quản lý không tự có quyền tài khoản, đơn giá hoặc lương.
5. Tài khoản thợ cũ giữ khóa. Nếu người đó nay là người ghi nhận, Admin phải cấp vai trò nghiệp vụ và bộ phận trước khi mở lại; không mở vai trò Nhân viên để thợ tự nhập.
6. Mở từng đơn đang làm → **Phân công**, chọn công đoạn/phần việc và những thợ đúng bộ phận. Sản lượng cũ giữ nguyên; lần ghi mới bắt buộc có phân công.
7. Thử một đơn riêng trên database thử theo Cắt → May → QC → Đóng gói → Giao 20 rồi 80. Nghiệm thu bằng checklist trong `docs/department-qa.md` trước push/triển khai.

Hồ sơ chưa phân loại không được ghi nghiệp vụ. Đây là trạng thái chuyển đổi có chủ đích; Admin vẫn truy cập thiết lập, không cần tạo admin mới hoặc đổi mật khẩu.

## Khôi phục

Không khôi phục đè database đang dùng. Tạo database trống, đổi cấu hình kết nối tạm rồi chạy `npm run db:restore -- <snapshot>`. Công cụ kiểm tra định dạng, khôi phục cả ảnh, tài khoản và lịch sử, đặt lại sequence, áp dụng migration nếu snapshot cũ. Kiểm tra số dòng/tổng tiền/ảnh và bộ phận trước đổi database ứng dụng.

Nếu cần quay lại **code cũ và schema cũ**, giữ snapshot và database nguồn trước chuyển. Restore ứng dụng hiện tại luôn nâng lên schema hiện tại; rollback phiên bản cũ phải thực hiện trên bản phục hồi riêng bằng công cụ/code cũ tương ứng. Không xóa hoặc hạ schema database đã có giao dịch mới.

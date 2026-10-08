# LUUTA — quản lý xưởng may

Next.js 16, React 19, TypeScript và PostgreSQL. Giao diện Arial/sans, Lucide, Radix Dialog, Kanban dnd-kit; màu trắng–xám.

LUUTA vận hành theo **6 bộ phận: Quản lý, Cắt, May, QC, Đóng gói, Giao hàng**. Thợ có hồ sơ và bộ phận, không sử dụng tài khoản nghiệp vụ. Tổ trưởng, QC và quản lý ghi nhận cho thợ. Một người được kiêm nhiệm nhiều bộ phận.

## Chạy local

Yêu cầu Node.js 22+ và PostgreSQL 17+. Tạo database riêng; lưu cấu hình trong `.env.local`, không commit:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/luuta
APP_ORIGIN=http://localhost:3002
SESSION_COOKIE_SECURE=false
BACKUP_DIR=./backups
```

```bash
npm ci
npm run bootstrap
npm run dev -- --port 3002
```

`bootstrap` chỉ tạo admin đầu tiên khi chưa có tài khoản, yêu cầu `INITIAL_ADMIN_USERNAME` và `INITIAL_ADMIN_PASSWORD` trong cấu hình local. Không ghi mật khẩu thật trong mã, lệnh shell chia sẻ hoặc tài liệu. Xóa hai biến sau khi tạo; không bootstrap lại database nhập từ bản cũ. Chạy bản build bằng `npm run build` rồi `npm run start -- --port 3002`.

Với database cũ, thực hiện [hướng dẫn migration bộ phận](docs/department-migration.md) trước khi khởi động phiên bản mới. Migration 11 thu hồi session; đăng nhập lại. **Không push/triển khai bản chuyển đổi trước khi nghiệm thu local.**

## Thiết lập và thao tác

1. Admin vào **Danh sách thợ**, lọc **Chưa phân loại**, khai báo đúng bộ phận từng hồ sơ. Không suy ra bộ phận từ Chuyền 1–5 cũ. Một hồ sơ có thể thuộc nhiều bộ phận.
2. Admin vào **Tài khoản** để duyệt tài khoản người ghi nhận, liên kết hồ sơ của chính người đó và gán vai trò. Danh sách thợ thuộc bộ phận tự có sẵn, không liên kết tài khoản tổ trưởng với hồ sơ một thợ khác. Tài khoản chỉ có vai trò Nhân viên bị khóa sau chuyển đổi.
3. Kiểm tra **Vai trò và quyền**. Vai trò cho phép thao tác; bộ phận giới hạn công đoạn. Quản lý được thao tác toàn quy trình theo quyền được cấp, không tự có quyền quản trị tài khoản, sửa đơn giá hay xem/chốt lương. Admin toàn quyền. Cấu hình đã chỉnh không tự được cấp lại khi khởi động.
4. Quản lý mở **Đơn hàng → Tạo đơn**, nhập khách/sản phẩm/ngày/hạn giao và bảng màu–size. Mã tự sinh được chỉnh sửa; size mặc định có lựa chọn nhập riêng. Một biến thể có nhiều màu phối vẫn chỉ tính số lượng một lần. Không chọn chuyền khi tạo đơn; người phụ trách là đầu mối điều phối.
5. Mở đơn → **Phân công**, chọn công đoạn/phần việc và nhiều thợ. Chọn May chỉ thấy thợ May; sửa hàng chỉ thấy thợ QC. Phân công không tạo sản lượng hoặc tiền công. Thay đổi phần việc bị chặn khi đã phân công/ghi công để bảo toàn dữ liệu.
6. Trong **Bộ phận**, chọn đơn → **Ghi nhận công việc**. Chọn một thợ đã được phân công, một công đoạn/phần việc; nhập nhiều dòng màu–size một lần. Mỗi dòng hiện lượng còn lại; **Điền tối đa** dùng đúng phần việc. Đơn giá từ server, lưu giá lịch sử theo từng lần ghi. Nếu thiếu phân công, form chỉ rõ và dẫn tới tab Phân công.
7. Sau chuẩn bị, số đã cắt được may ngay; số đã may được QC ngay. QC tự nhận danh tính người kiểm từ tài khoản. Sản phẩm lỗi được QC ghi sửa bằng thợ QC đã phân công, rồi kiểm lại. Không cần cả đơn hoàn thành một bước mới xử lý lượng đủ đầu vào.
8. Đóng gói nhập lượng QC đã đạt; giao hàng chọn thợ được phân công, ngày giờ thực tế, số kiện và bảng nhiều màu–size. Có thể giao nhiều đợt, ví dụ 20 rồi 80 sản phẩm. Nguyên nhân bắt buộc khi giao trễ hoặc đánh dấu sự cố; giao từng phần đúng hạn không bị coi là thiếu hàng.
9. Danh sách đơn có **Chuyển bước…**, Kanban có kéo thả và cách chuyển tương đương bằng bàn phím/điện thoại. Chuyển thẻ chỉ điều phối, không tự sinh số lượng. Quản lý xác nhận hoàn thành sau khi giao đủ từng màu–size.
10. **Sản lượng / Lương sản phẩm** lọc theo bộ phận, người thực hiện, công đoạn và ngày/tháng. Bản ghi mới lưu riêng bộ phận khi thực hiện, thợ, người ghi nhận và nguyên nhân. Quyền tiền công cấp riêng. Xuất Excel theo quyền/bộ lọc; phân trang giao diện không cắt dữ liệu xuất.

Hướng dẫn thao tác cũng có trong **Xem hướng dẫn** trên sidebar. Tài khoản nghiệp vụ ưu tiên **Công việc bộ phận tôi**, quản lý lọc toàn xưởng. Danh sách thợ/phân công/lịch sử có tìm kiếm hoặc phân trang; bảng màu–size cuộn trong vùng riêng.

## Lương và dữ liệu lịch sử

Nhiều thợ chia một phần việc không được ghi vượt đầu vào. Khi có nhiều phần việc bắt buộc, sản phẩm hoàn thành tính theo phần ít hoàn thành nhất; lượt công và số sản phẩm là hai số khác nhau. Đổi/bỏ bộ phận hoặc phân công không đổi công cũ. Không được nhận tiền công từ số lượng một người khác đã xử lý.

Tháng chốt chặn nhập công mới. Đóng gói vẫn ghi số lượng vật lý và khoản **Công đóng gói chờ đối chiếu**, giữ ngày gốc/giá gốc; người có quyền đối chiếu chọn ngày hạch toán kỳ mở và lý do, không mở lại tháng cũ hoặc cộng lại số đóng gói.

Chuyền cũ được giữ làm nguồn gốc lịch sử trong database/Excel, không dùng để cấp quyền mới. Hồ sơ/đơn mới không bị gán số chuyền giả. Lần giao cũ không có giờ giữ trạng thái không có giờ; không gộp thành đợt giao giả.

## Dữ liệu mẫu

Chỉ chạy trên database thử nghiệm trống:

```bash
npm run seed
npm run seed:accounts
```

Seed nghiệp vụ tạo hồ sơ thuộc sáu bộ phận và hai đơn mẫu 100 sản phẩm, với phân công nếu có admin. Nếu đã có hồ sơ/đơn, seed bỏ qua, không sửa dữ liệu đang dùng. Seed tài khoản tạo người ghi nhận theo vai trò/bộ phận, bỏ qua username đã tồn tại, không tạo tài khoản thợ. Mật khẩu ngẫu nhiên chỉ lưu `.env.seed-accounts.local` (quyền 600, bị Git bỏ qua), không in ra console. Không chạy seed trên dữ liệu khách.

## Backup và khôi phục

`npm run backup` tạo snapshot đầy đủ `LUUTA-*.pg.json.gz` và archive nghiệp vụ `LUUTA-*.json.gz` theo khoảng ngày. Snapshot chứa tài khoản/hash và ảnh; bảo quản riêng. Archive nghiệp vụ không chứa mật khẩu/hash/session và không thay snapshot. Lịch backup cấu hình tại giao diện; ứng dụng phải hoạt động để thực thi lịch.

Snapshot và archive mới chứa bộ phận, phân công, phần việc, đợt giao/chi tiết, ngày giờ, nguyên nhân và người ghi nhận. Snapshot trước chuyển đổi khôi phục được; migration không bịa bộ phận hoặc giờ giao cũ.

```bash
npm run db:restore -- /private/LUUTA-snapshot.pg.json.gz
```

Chỉ khôi phục vào database mới/trống, đối chiếu dữ liệu rồi mới đổi `DATABASE_URL`. Công cụ từ chối ghi đè database đang có nghiệp vụ, tài khoản hoặc ảnh. Đây là định dạng LUUTA, không dùng `pg_restore` trực tiếp. Nguồn SQLite cũ có thể xuất bằng `npm run db:export-sqlite -- /private/source.db /private/transfer.pg.json.gz` rồi nhập vào PostgreSQL trống.

## Kiểm thử

```bash
TEST_DATABASE_URL=postgresql://<test-user>:<test-password>@127.0.0.1:5432/postgres npm test
npx tsc --noEmit
npm run lint
npm run build
```

`TEST_DATABASE_URL` phải là server riêng có quyền tạo/xóa database thử nghiệm. Bộ test dùng database ngẫu nhiên rồi xóa; không ghi dữ liệu thử vào database ứng dụng. Xem [QA, QC và ca nghiệm thu bộ phận](docs/department-qa.md). Baseline bộ phận hiện tại: 49/49 test tự động đạt; TypeScript, lint và build đạt. Nghiệm thu trình duyệt/mobile còn chờ vì quyền truy cập local bị chặn. Các bộ test/ảnh cũ là lịch sử, không chứng minh giao diện phiên bản mới đã được nghiệm thu. Test theo mô hình chuyền cũ được lưu tại `tests/legacy/`, không chạy trong `npm test` mới.

## Bảo mật và triển khai

Hash mật khẩu bằng scrypt/salt riêng; session chỉ lưu hash token, cookie HttpOnly/SameSite=Lax, 24 giờ. HTTPS bật Secure. Đổi/reset mật khẩu, khóa tài khoản, đổi bộ phận hồ sơ có đăng nhập thu hồi session. API kiểm tra session, quyền, bộ phận, Origin/CSRF, dữ liệu đầu vào, phiên bản và chống gửi lặp. SQL có tham số; không lưu xác thực trong localStorage. QC không được giả danh người kiểm; đại diện Admin bị giới hạn theo người đại diện và ghi cả hai danh tính.

Ảnh JPG/PNG/WebP tĩnh tối đa 5 MB, 20 triệu điểm ảnh; server xác minh nội dung, thu nhỏ và loại metadata. Ảnh yêu cầu đăng nhập/quyền xem; ảnh chưa sử dụng chỉ chủ sở hữu xem, dọn sau 24 giờ khi có lần tải tiếp theo.

Không tích hợp Discord, email, OAuth/MFA trong đợt này. Hướng dẫn hạ tầng đã có tại [PostgreSQL deployment](docs/postgresql-deployment.md); áp dụng quy trình kiểm thử bản sao và nghiệm thu migration mới trước lần triển khai kế tiếp.

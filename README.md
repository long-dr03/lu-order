# LUUTA — quản lý xưởng may trên local

Next.js 16, React 19, TypeScript và SQLite. Giao diện Arial, màu trắng–xám, icon Lucide, Radix Dialog, Motion và Kanban dnd-kit. Chưa triển khai hoặc đẩy thay đổi này lên GitHub.

## Chạy ứng dụng

Yêu cầu Node.js 22 trở lên.

```bash
npm install
npm run backup     # Khi đã có database, trước khi nâng phiên bản
npm run seed      # Tùy chọn: seed mẫu vào SQLite trống, không ghi đè DB hiện có
npm run bootstrap # Chỉ khởi tạo admin lần đầu
npm run build
npm run start -- --port 3002
```

Mở http://localhost:3002. Server chỉ lắng nghe trên 127.0.0.1. Phát triển bằng `npm run dev -- --port 3002`.

Tạo `.env.local` ở thư mục dự án, không commit file này:

```dotenv
DATABASE_PATH=lu_order.db
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<mật khẩu admin ban đầu đã chọn, tối thiểu 10 ký tự>
SESSION_COOKIE_SECURE=false
```

Có thể đặt `APP_ORIGIN=http://localhost:3002` để cố định Origin; nếu đặt, phải trùng chính xác địa chỉ truy cập, kể cả port. Khi không đặt, server dùng origin của request. HTTPS với `APP_ORIGIN=https://...` tự bật cookie Secure; có thể bật bằng `SESSION_COOKIE_SECURE=true`.

Admin đầu tiên đã được khởi tạo cho database local hiện tại bằng thông tin người dùng cung cấp. Mật khẩu không có trong mã nguồn hoặc tài liệu. `bootstrap` ghi dấu thiết lập trong SQLite, không tự tạo lại admin hoặc ghi đè mật khẩu khi chạy lại. Sau khi khởi tạo có thể xóa hai biến `INITIAL_ADMIN_*` khỏi cấu hình local.

## Migration và bảo toàn dữ liệu

Migration phiên bản 1 trong `src/lib/server/migrate.ts` tự chạy khi server truy cập lớp xác thực. Toàn bộ migration chạy trong transaction và được ghi vào `schema_migrations`. Bổ sung tài khoản, session, vai trò, quyền, đơn giá, phiên bản đơn, idempotency và bộ đếm QC. Không thay đổi sản lượng, đơn giá hoặc thành tiền lịch sử. Đơn giá hiện hành ban đầu lấy từ bản ghi sản lượng mới nhất cho từng đơn/công đoạn; đơn chưa có giá phải được quản lý cấu hình trước khi nhập sản lượng.

`npm run backup` dùng SQLite Online Backup để sao lưu cả dữ liệu trong WAL vào `backups/*.db`, không chỉ sao chép file chính. Các file database, backup và `.env*` được Git bỏ qua. Khi khôi phục: dừng mọi server, giữ bản sao database hiện tại, thay file ở `DATABASE_PATH` bằng backup và loại bỏ WAL/SHM cũ trước khi khởi động. Chỉ khôi phục vào đường dẫn đang cấu hình, tránh chạy nhầm database.

Database chưa có dữ liệu được khởi tạo bằng bộ dữ liệu nghiệp vụ mẫu kế thừa của dự án. Không tạo tài khoản đăng nhập mẫu trong database thật.

Migration phiên bản 2 thêm `product_images` để lưu ảnh sản phẩm trong SQLite. Không thay dữ liệu đơn/lương cũ. Ảnh theo cùng database và được đưa vào bản sao lưu `npm run backup`.

## Ảnh sản phẩm

Mỗi sản phẩm trong đơn có một ảnh mẫu. Trong **Tạo đơn** hoặc **Chi tiết đơn → Chỉnh sửa**, chọn ảnh từ thiết bị hoặc kéo ảnh vào vùng chọn; có thể thay/bỏ ảnh rồi lưu. Hỗ trợ JPG, PNG, WebP tĩnh, tối đa 5 MB và 20 triệu điểm ảnh. Server kiểm tra nội dung thật, thu nhỏ cạnh dài tối đa 1400px và bỏ metadata trước khi lưu JPEG.

Ảnh hiển thị ở danh sách, thẻ mobile, Kanban, chi tiết đơn và thẻ QC/giao hàng. Nhấn ảnh để xem lớn, Escape để đóng. Đơn cũ chưa có ảnh hiển thị placeholder gọn; cần người quản lý bổ sung ảnh mẫu thật. Ảnh chưa được đưa vào file Excel.

Tải ảnh cần quyền tạo/sửa đơn trong chuyền và CSRF. Ảnh gắn với đơn chỉ được đọc khi có quyền xem đơn/QC/giao hàng trong chuyền đó; URL không công khai. Ảnh chưa gắn với đơn chỉ người tải lên xem được, và được dọn sau 24 giờ ở lần tải ảnh tiếp theo. Database và backup chứa ảnh không được commit Git.

## Sử dụng

1. Nhân viên đăng ký tên đăng nhập, họ tên và mật khẩu; trạng thái chờ duyệt, chưa được vào nghiệp vụ.
2. Admin mở **Tài khoản**, duyệt và liên kết nhân viên có sẵn hoặc tạo nhân viên mới, chọn chuyền và một hay nhiều vai trò.
3. **Vai trò và quyền** cấu hình quyền theo thao tác và phạm vi. Thứ bậc chỉ giới hạn quản lý/gán vai trò thấp hơn, không tự cấp quyền nghiệp vụ. Vai trò Admin được bảo vệ; giao diện không cấp thêm Admin hoặc khóa Admin hiện tại.
4. Nhân viên ưu tiên đơn trong chuyền, nhập sản lượng, lịch sử và lương riêng. Đơn giá lấy từ server; không cho tự nhập giá hoặc tên người thao tác.
5. Admin chọn **Thao tác thay nhân viên**, nhập lại mật khẩu admin. Banner luôn hiện người được đại diện; quyền và dữ liệu theo nhân viên đó, nhật ký ghi cả hai người. Nhấn **Thoát đại diện** để quay lại.
6. **Đơn hàng → Kanban** nhóm theo chuyền hoặc công đoạn. Kéo bằng tay nắm; đích hợp lệ mở xác nhận. Có **Chuyển đến…** tương đương cho bàn phím/điện thoại; không kéo đổi menu hoặc bố cục.
7. Chi tiết đơn ghi QC, sửa hàng, QC lại, đóng gói, giao theo màu–size. Cắt/may phải đủ đầu vào, QC đạt đủ trước đóng gói, giao đủ trước hoàn thành. Khi nhận lỗi 409, tải lại dữ liệu trước khi thao tác lại.
8. **Đơn giá** cấu hình theo đơn/công đoạn. Nhập sản lượng ghi lương cùng biến thể và audit trong transaction. Mã thao tác chống retry trùng; phiên bản đơn chống cập nhật dữ liệu cũ.
9. **Lương sản phẩm** lọc tháng, nhân viên, chuyền, công đoạn. Chốt tháng khóa nhập sản lượng/tiền công mới; QC, đóng gói và giao hàng vẫn hoạt động. Chốt áp dụng toàn tháng, không chỉ bộ lọc đang xem. Admin/Giám đốc có quyền điều chỉnh bản ghi đã chốt với lý do và lịch sử trước–sau; không mở khóa tháng.
10. Nút **Xuất Excel** ở đơn, sản lượng, lương, QC và giao hàng xuất `.xlsx` theo quyền và bộ lọc. Tên khách/sản phẩm là chuỗi văn bản; không tạo công thức. Tổ trưởng không có quyền xem lương sẽ không nhận cột tiền. Nhân viên chỉ nhận dữ liệu cá nhân được cấp quyền xuất.

Admin có thể khóa/mở tài khoản, đặt mật khẩu tạm. Mật khẩu tạm yêu cầu đổi ở lần đăng nhập sau. Đổi/reset mật khẩu, khóa hoặc cập nhật phân quyền tài khoản thu hồi session. Không tích hợp Discord, email, Supabase, OAuth hoặc MFA; khôi phục tài khoản do admin xử lý.

## Bảo mật

Mật khẩu scrypt có salt riêng; SQLite chỉ lưu hash token session ngẫu nhiên. Cookie HttpOnly/SameSite=Lax, thời hạn 24 giờ, không lưu xác thực trong localStorage. Mọi API xác thực và kiểm tra phạm vi server; thao tác ghi kiểm tra Origin/CSRF, schema Zod, SQL có tham số, giới hạn body và số lần đăng nhập/đăng ký. CSP nonce và các header hạn chế nhúng trang được bật. Không đưa lỗi SQLite hoặc hash mật khẩu vào phản hồi client.

`npm audit --omit=dev` hiện có 0 lỗ hổng. Audit đầy đủ còn 5 cảnh báo high trong chuỗi công cụ lint `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`; chưa có bản sửa tương thích ở phiên bản hiện tại. Không hạ Next.js xuống 14 theo gợi ý tự động của npm. Phần này thuộc dependency phát triển, cần theo dõi khi nâng công cụ lint. Bản local này chưa được kiểm toán bảo mật độc lập.

## Kiểm tra

```bash
npm run test
npx tsc --noEmit
npm run lint
npm run build
npm audit --omit=dev
```

33 kiểm thử dùng database tạm riêng rồi xóa sau chạy: migration/lương lịch sử, đăng ký và duyệt, hạn session, rate limit, Origin/CSRF, đổi/reset mật khẩu và khóa, đọc API trực tiếp, đổi ID nhân viên/chuyền, giả mạo đơn giá, nhiều vai trò, phạm vi quản trị, thứ bậc, đại diện/audit, QC nhiều vòng, giao thiếu, phiên bản cạnh tranh, gửi lặp và tháng khóa. File Excel được đọc lại bằng ExcelJS và đối chiếu tổng sản lượng/tiền với SQLite.

Ảnh kiểm tra giao diện nằm trong `artifacts/`. Logo vector trong `public/logo.svg`, favicon/Apple Touch trong `src/app/`. Màn hình được kiểm tra tại 390, 768, 1024, 1366 và 1920px; modal/drawer hỗ trợ Escape và trả focus, animation tôn trọng reduced motion.

## Màu, size, mã và số tiền

Màu có tên/mã vải, màu phổ biến, bảng chọn tùy ý, HEX và RGB. HEX được lưu trong SQLite cùng biến thể. Size có gợi ý nhưng cho nhập tự do tối đa 40 ký tự. Mã đơn và sản phẩm tự điền, có thể sửa trước khi tạo; mã sản phẩm sửa được ở chi tiết. Mã đơn đã lưu là định danh liên kết nghiệp vụ nên giữ cố định. Mã đơn trùng trả 409. Đơn giá VND nhập số nguyên, tự nhóm mỗi 3 chữ số; chọn cách hiển thị 1.000 hoặc 1,000. Server nhận số, không nhận chuỗi đã định dạng.

## SQLite và seed

Tất cả màn hình lấy dữ liệu thật qua API và SQLite. Không có mảng mock nghiệp vụ trong client. Dữ liệu ví dụ nằm riêng ở `scripts/sample-data.ts`, chỉ dùng khi chạy `npm run seed` hoặc tạo database kiểm thử. Seed là transaction, chỉ chạy khi bảng chuyền trống; chạy lại không tạo bản ghi lặp hoặc xóa dữ liệu. Database local hiện tại được giữ nguyên, không reset đơn/sản lượng/lương đã nhập.

## Lịch sao lưu

Admin mở **Sao lưu**, bật lịch và chọn chu kỳ theo giờ (1–8760), số ngày nghiệp vụ gần nhất (1–3650). Mặc định lịch tắt, gợi ý 24 giờ / 30 ngày. **Sao lưu ngay** tạo hai file trong `backups/` cạnh database:

- `.db`: snapshot nhất quán toàn bộ SQLite, bao gồm ảnh, tài khoản, quyền và dữ liệu lịch sử.
- `.json.gz`: JSON nén nghiệp vụ theo ngày nhận đơn, ngày sản lượng hoặc ngày QC; lấy thêm đơn/biến thể/công đoạn/đơn giá/ảnh liên quan và danh mục chuyền, nhân viên. Gồm lịch sử từng lần xử lý, đóng gói/giao hàng, hồ sơ công đoạn và điều chỉnh tiền công; các bộ đếm biến thể là lũy kế tại thời điểm snapshot. File này không chứa hash mật khẩu hoặc session.

Ngày lọc theo múi giờ Việt Nam, gồm cả hai đầu khoảng. Scheduler chạy trong server local, kiểm tra mỗi phút; khi mở lại sau hạn sẽ chạy bù một lần. Không thể tự tải vào Downloads khi trình duyệt đóng: bản sao được lưu local, admin dùng **Tải file** để chuyển sang nơi lưu trữ khác. Chỉ Admin, ngoài chế độ đại diện, được cấu hình hoặc tải backup. Bản sao có quyền file 600. Không tự xóa bản sao cũ. Nếu thất bại, màn hình ghi lỗi và lịch thử lại sau 5 phút.

Khôi phục: dừng server, sao lưu database hiện tại, chép bản `.db` đã chọn vào đúng `DATABASE_PATH`, loại bỏ file WAL/SHM cũ của database đã dừng rồi khởi động lại. Snapshot chứa dữ liệu xác thực, chỉ lưu ở nơi admin kiểm soát.

## Bước sản xuất và tổ phụ trách

Quy trình sản xuất hiển thị 11 bước theo tên, từ Nhận đơn đến Hoàn thành. Kanban mặc định theo bước sản xuất; kéo sang bước khác vẫn kiểm tra quyền, đầu vào và QC/giao hàng. Tổ phụ trách là nhóm nhân viên (dữ liệu chuyền cũ), dùng cho phân công và phạm vi quyền, không phải bước sản xuất.

## Chuyển bước ngoại lệ

Ở **Đơn hàng → Kanban**, bật **Cho phép quay lại / nhảy bước (ngoại lệ)** rồi kéo đơn hoặc dùng **Chuyển đến…**. Nhập lý do tối thiểu 5 ký tự và xác nhận. Mặc định Admin/Giám đốc có quyền `orders.override`; admin có thể cấp quyền cho vai trò khác theo tổ/toàn xưởng. Vẫn cần quyền chuyển đơn, và quyền QC/giao hàng khi rời bước tương ứng. Nhật ký ghi bước cũ, bước mới, lý do và người thao tác/đại diện.

Ngoại lệ chỉ đổi bước, không tự tăng/giảm số lượng biến thể hoặc sửa tiền công. Bước nhảy qua không được tự ghi là hoàn tất. Hoàn thành vẫn cần giao đủ từng màu–size; có thể đưa đơn hoàn thành trở lại bước khác để kiểm tra. Kiểm tra phiên bản và chống gửi lặp vẫn áp dụng. Migration 4 bổ sung quyền mặc định, migration khóa transaction và kiểm tra lại phiên bản để hỗ trợ các worker khởi động đồng thời.

## Điều chỉnh theo yêu cầu nghiệp vụ gốc

Migration 5 bổ sung người phụ trách đơn, thời điểm nhận công đoạn, lịch sử từng lần QC/đóng gói/giao hàng, phiên bản sản lượng và lịch sử điều chỉnh. Migration giữ nguyên dữ liệu đơn và lương; các bản ghi cũ không được dựng thành lịch sử giả.

- **5 chuyền sản xuất** là nhóm nhân viên/năng lực, tách khỏi **Quy trình sản xuất** gồm 11 công đoạn. Mỗi chuyền xem được đơn, màu–size và số lượng đang làm.
- Hồ sơ công đoạn hiện tại có bốn trạng thái, người phụ trách, số nhận/hoàn thành, thời điểm nhận/bắt đầu/kết thúc và ghi chú. Số hoàn thành ở công đoạn vật lý lấy từ xử lý thực tế; nhảy qua bước không đánh dấu bước đó hoàn thành.
- Rủi ro tiến độ được tính khi đọc từ số chưa giao, hạn giao và hàng chờ của chuyền. Năng suất ưu tiên số May ghi nhận trong 14 ngày lịch gần nhất; nếu chưa có thì dùng năng lực chuyền đã cấu hình, với nguồn tính hiển thị trong lý do. Đây là ước lượng điều phối, chưa mô phỏng thời lượng riêng từng công đoạn.
- Đóng gói/giao lưu từng lần với ngày, nhân viên, màu–size, số lượng, số kiện và ghi chú. QC hỗ trợ ảnh lỗi. Xuất Excel giao hàng có lịch sử từng lần.
- Sản lượng/lương lọc theo tháng hoặc khoảng ngày, nhân viên, chuyền, công đoạn, sản phẩm/mã hàng, màu và size; tổng hợp theo đơn/mã hàng/công đoạn/màu/size/ngày. Excel sử dụng cùng bộ lọc và quyền.
- Điều chỉnh sản lượng/đơn giá cần quyền `payroll.adjust`, lý do, phiên bản còn mới và không làm số lượng thấp hơn đầu ra đã xử lý. Lịch sử trước–sau được giữ riêng, kể cả tháng đã chốt; thao tác đại diện vẫn theo quyền nhân viên.
- Mã đơn mặc định lấy số LU tiếp theo tại server, có thể sửa khi tạo. Người phụ trách phải thuộc chuyền đã chọn. Không cho ngoại lệ bỏ qua QC để đóng gói, bỏ qua đóng gói để giao hoặc hoàn thành khi giao thiếu.

Kiểm thử mới đối chiếu rủi ro, hồ sơ công đoạn, xử lý sau khóa lương, lịch sử giao/đóng gói, điều chỉnh trước–sau, phiên bản/idempotency và Excel theo bộ lọc kết hợp.

## Phối nhiều màu trên một sản phẩm

Khi tạo đơn, mỗi dòng màu–size có **Thêm màu phối trên cùng sản phẩm**, tối đa 8 màu. Ví dụ Đen / Trắng là một biến thể của một chiếc áo; số lượng, sản lượng và tiền công không nhân theo số màu. Tên phối màu/mã vải tự ghép từ các màu, có thể chỉnh. Các phối màu khác nhau là các dòng biến thể riêng.

Mỗi màu có vùng kéo chọn độ bão hòa/độ sáng, thanh sắc màu, bảng màu sẵn và HEX/RGBA luôn hiển thị và điều chỉnh bằng bàn phím, nút Áp dụng/Hủy để thử màu trước khi xác nhận. Hoạt động bằng chuột và cảm ứng. Migration 6 thêm `colors_json`; màu cũ và tiền công giữ nguyên. Các chấm màu phối hiển thị trong chi tiết đơn; Excel thêm cột các màu phối, backup SQLite/JSON giữ thông tin này.

Bảng chọn theo mẫu: rộng 364px trên desktop, mặt phẳng màu cao 232px, thanh sắc màu và alpha, ô HEX/R/G/B/A. A là độ đục 0–100%, mặc định 100%; được lưu trong phối màu, đưa vào Excel và backup. Palette có sẵn mở bằng icon. Hủy/Escape bỏ màu đang thử, trả focus về nút chọn; Escape chỉ đóng bảng màu, giữ hộp tạo đơn.

## Thứ tự menu vận hành

Sidebar và menu điện thoại chỉ hiển thị tên chức năng, không có tiêu đề nhóm hoặc đánh số. Thứ tự: Tổng quan → Đơn hàng → Đơn giá → 5 chuyền sản xuất → Quy trình sản xuất → Sản lượng → Kiểm soát chất lượng → Giao hàng → Lương sản phẩm → Nhật ký → Tài khoản → Vai trò và quyền → Sao lưu. Chỉ hiện mục được cấp quyền. Các công đoạn của từng đơn được theo dõi trong Quy trình sản xuất/Kanban.

## Tài khoản mẫu theo vai trò

Chạy `npm run seed:accounts` để bổ sung một tài khoản cho các vai trò Giám đốc (`giamdoc`), Trợ lý sản xuất (`troly`) và QC (`qc`) nếu vai trò đó chưa có tài khoản. Script không ghi đè tài khoản hoặc mật khẩu đã có, không thay đổi đơn hàng và lương. Mỗi tài khoản có mật khẩu ngẫu nhiên riêng trong `.env.seed-accounts.local` (file local được Git bỏ qua, quyền đọc/ghi chỉ dành cho chủ sở hữu), được liên kết hồ sơ nhân viên và có thể dùng ngay để thử góc nhìn qua “Xem và thao tác thay”. Khi admin đặt lại mật khẩu, yêu cầu đổi mật khẩu vẫn được áp dụng. Không đưa file này lên GitHub.

## QA hệ thống và đối chiếu dữ liệu

`npm test` chạy bộ hồi quy trên SQLite tạm riêng, gồm đủ 6 vai trò, luồng sản xuất nhiều màu–size, QC/sửa/QC lại, giao từng phần, chốt lương/Excel và khôi phục snapshot vào database khác. Test restore mở tiến trình Node riêng; môi trường sandbox phải cho phép tiến trình con. `npm run qa:data` chỉ đọc database đã cấu hình và xuất `artifacts/data-integrity-report.json`; không tự sửa bất nhất lịch sử. Checklist, test case và kết quả nằm trong `artifacts/verification.md`, `artifacts/qa-test-cases.json`, `artifacts/qa-test-results.txt`. File báo cáo dữ liệu chứa thông tin nghiệp vụ local; xem xét trước khi chia sẻ.

Khôi phục backup phải dùng file `.db` đầy đủ, thử trên đường dẫn database mới và đối chiếu trước; file `.json.gz` theo thời gian phục vụ lưu trữ nghiệp vụ, không thay thế snapshot toàn bộ. Không chép đè database khi server đang chạy. Bộ test khôi phục đối chiếu toàn bộ bảng, integrity, ảnh, tiền công và quyền rồi đọc lại API trong tiến trình mới.

## Hồ sơ cá nhân và điều chuyển

Tài khoản đã liên kết giữ nguyên hồ sơ của chính người đó; không chọn sang người khác. Tên hồ sơ và tài khoản đồng bộ khi lưu. Người chưa liên kết có thể tạo hồ sơ hoặc liên kết một lần với hồ sơ chưa có tài khoản.

Chọn Chuyền làm việc để điều chuyển; khi chỉ có một chuyền được giao, form thay chuyền cũ bằng chuyền mới. Các chuyền phụ trách bổ sung được chọn riêng, có danh sách nhân viên khác hiện có để đối chiếu. Chuyền làm việc phải nằm trong phạm vi được giao. Lương và lịch sử giữ nguyên, nhân viên khác và đơn hàng không di chuyển theo tổ trưởng. Lưu ghi audit và thu hồi session để quyền mới có hiệu lực khi đăng nhập lại.

## Nhiều người cùng làm một sản phẩm

Quản lý mở Đơn giá, chọn đơn và Cắt hoặc May, mở Chia công đoạn thành các phần việc cho nhiều người. Nhập tên và đơn giá từng phần, rồi lưu trước khi có sản lượng công đoạn. Ví dụ May thân, May tay, Ráp áo: mỗi sản phẩm cần đủ cả ba phần. Đây là danh mục phần việc cho cả chuyền, không khóa cho một người duy nhất.

Nhân viên trong chuyền chọn Ghi nhận công việc, chọn phần việc, màu–size và số lượng mình đã làm. Nhiều người có thể chia nhau cùng một phần; tổng từng phần không vượt đầu vào. Tiền công theo phần việc/người, đơn giá lấy từ server. Tiến độ màu–size là số lượng nhỏ nhất đã làm trong các phần bắt buộc: thân 5, tay 5, ráp 3 tương ứng 3 sản phẩm hoàn thành May, 13 lượt công việc; không cộng thành 13 áo. Quy tắc dựa số lượng lô màu–size, chưa theo dõi mã riêng từng chiếc áo.

Danh mục phần việc không đổi sau khi đã có sản lượng để tránh làm sai tiến độ/lịch sử. Đơn giá vẫn chỉnh được cho lần ghi tiếp theo; tiền công đã lưu giữ nguyên. Đơn cũ không chia phần việc tiếp tục ghi toàn công đoạn như trước, vẫn cho nhiều người chia nhau số lượng. Người phụ trách theo dõi đơn, không phải người duy nhất được làm. Chi tiết đơn và thẻ Công việc hiển thị tiến độ từng phần; lịch sử/Excel ghi tên phần việc. Lượt công việc và sản phẩm hoàn thành là hai số khác nhau.

Migration 7 thêm order_work_items và các cột phần việc/sản phẩm hoàn thành vào production_logs, không sửa lương hoặc số lượng cũ. Snapshot SQLite và archive JSON chứa danh mục cùng lịch sử phần việc. QA đối chiếu Cắt/May, nhiều người, gửi lặp, phiên bản cũ, khóa tháng, sửa số lượng và dữ liệu Excel/backup trên SQLite riêng.

## Nhân viên hỗ trợ nhiều chuyền

Chuyền làm việc là chuyền chính của hồ sơ. Nhân viên được ghi nhận cho chính mình tại mọi chuyền được giao trong tài khoản nếu có quyền production.create. Quản lý nhập thay cần quyền tại chuyền của đơn và nhân viên phải thuộc hoặc được giao hỗ trợ chuyền đó. Sản lượng mới lưu theo chuyền của đơn; tiền công vẫn gắn nhân viên thực hiện. Tổng hợp lương tách theo nhân viên và chuyền để người làm nhiều chuyền không bị gộp sai. Bỏ chuyền khỏi tài khoản sẽ chặn ghi nhận mới tại đó, không đổi chuyền chính hoặc lịch sử đã ghi. Form chọn sẵn công đoạn hiện tại của đơn.

## Ghi nhận QC

Trong Kiểm soát chất lượng, đơn đến QC có nút Kiểm QC; QC lại có nút QC lại. Mở đơn sẽ vào thẳng tab xử lý tương ứng, không cần cuộn qua toàn bộ quy trình. Chọn màu–size, nhập số kiểm và số đạt; số lỗi tự tính. Form hiện số còn chờ xử lý, chặn vượt đầu vào và khóa nút khi màu–size đã đủ. Sau khi lưu, mở Công đoạn để chuyển bước phù hợp. Đơn còn ở May chỉ cho xem và báo chờ chuyển QC.

QC có quyền toàn xưởng được ghi nhận dưới danh tính của mình ở chuyền khác chuyền chính. Ở Kiểm QC và QC lại, người kiểm hiển thị cố định và được server xác định từ tài khoản hiện tại; không chọn người khác. Admin đại diện dùng danh tính QC được đại diện, nhật ký vẫn ghi admin. Lựa chọn người thực hiện chỉ còn ở sửa hàng/đóng gói/giao hàng.

QC đạt đủ từng màu–size thì chuyển thẳng sang Đóng gói. Sửa hàng và QC lại là nhánh chỉ dành cho sản phẩm lỗi, không phải bước bắt buộc của mọi đơn. Kanban ghi rõ nhánh này và nhắc bước Đóng gói trên thẻ đã đạt đủ QC; kéo nhầm vào Sửa hàng hiển thị hướng dẫn đích phù hợp.

## Nhân viên đóng gói và ghi công

Trong Công việc → Ghi nhận công việc → Đóng gói, nhân viên nhập số mình đã đóng gói rồi chọn “Xác nhận đóng gói và ghi công”. Server lưu tiến độ đóng gói, lịch sử người thực hiện và tiền công trong cùng transaction. Đơn phải ở Đóng gói; tổng đóng gói của mọi người không được vượt số QC đạt theo màu–size. Phạm vi nhân viên/chuyền, đơn giá quản lý, khóa tháng, phiên bản và chống gửi lặp vẫn được kiểm tra. Quản lý phụ trách chuyển bước, không cần xác nhận số lượng thay nhân viên trước.

Với số lượng đã được xác nhận theo luồng cũ, chọn “Chỉ bổ sung tiền công…” để không cộng lại số đóng gói; server chặn ghi công vượt phần chưa tính công. Điều chỉnh tiền công vẫn độc lập với số lượng vật lý đã xác nhận.

## Nhân viên giao hàng

Quyền `delivery.record` (Nhân viên ghi nhận giao hàng của mình) được cấu hình tại Vai trò và quyền, phạm vi Chuyền được giao; không tự cấp cho mọi nhân viên. Admin tạo vai trò bổ sung có quyền này và gán cho nhân viên giao hàng cùng các chuyền phụ trách. Tài khoản cần quyền xem đơn để mở đơn. Migration 8 bổ sung quyền quản trị cấp quyền này cho Admin; giữ nguyên dữ liệu giao hàng và phân quyền nhân viên hiện có.

Đơn ở Giao hàng có form giao theo màu–size: số thực giao, ngày, số kiện và ghi chú. Người chỉ có quyền ghi nhận giao hàng được lấy danh tính từ tài khoản, không được chọn người khác, đóng gói, chuyển bước hay tự hoàn thành đơn. Có thể giao nhiều lần; tổng không vượt lượng đã đóng gói. Nhật ký lưu actor và tài khoản đại diện; không phát sinh tiền công giao hàng. Quản lý vẫn quyết định chuyển công đoạn và hoàn thành đơn.

## Điều phối đơn và danh sách nhiều dữ liệu

Danh sách đơn có “Chuyển bước…” ngay trên mỗi dòng và trên thẻ điện thoại, dùng cùng xác nhận, quyền và điều kiện chuyển bước với kéo thả Kanban. Chế độ ngoại lệ vẫn yêu cầu quyền/lý do. Lựa chọn Danh sách/Kanban được lưu tại trình duyệt (chỉ tùy chọn giao diện, không có dữ liệu xác thực).

Mục Quy trình sản xuất trùng lặp đã được gộp vào Đơn hàng/Kanban; hồ sơ công đoạn và lịch sử vẫn trong chi tiết đơn. Chuyền sản xuất dùng bộ chọn chuyền và bảng đơn thay cho các thẻ chuyền cao thấp không đều. Danh sách đơn/chuyền 25 dòng mỗi trang; Công việc/QC/Giao hàng 12 thẻ mỗi trang; Kanban 10 đơn đầu mỗi cột và nút xem thêm. Tổng số và xuất Excel vẫn theo toàn bộ bộ lọc, không chỉ trang đang xem. Đây là phân trang hiển thị phía client; API vẫn tải dữ liệu trong phạm vi được cấp, chưa phân trang truy vấn database.

## QA/QC theo tiêu chí dễ dùng, dễ hiểu, ít thao tác

Xem [kế hoạch QA, checklist QC và 36 ca nghiệm thu UX](artifacts/verification.md) và [danh mục test case có trường ghi kết quả](artifacts/qa-test-cases.json). Baseline tự động gần nhất: 52/52 trong `artifacts/qa-test-results.txt`; 36 ca UX mới đều chưa chạy. Các số test/ảnh ở phần bàn giao cũ là lịch sử, không thay thế việc nghiệm thu giao diện hiện tại. Kế hoạch quy định vai trò, fixture riêng, cách đo thao tác/thời gian, 5 viewport, mức lỗi và điều kiện chốt; không đánh dấu UX đạt từ kết quả API.

### Kết quả thực thi QA UX mới nhất

Đợt thực thi tiếp theo có **57/57 kiểm thử tự động đạt**, lint/build/TypeScript đạt. Trong 36 ca UX: 28 xác minh một phần, 1 thất bại (nhân viên đóng gói khi tháng khóa), 7 chưa chạy. Đã sửa form thiếu giá vẫn cho gửi và fallback đổi List/Kanban khi storage bị chặn. Xem phần đầu `artifacts/verification.md` và `artifacts/qa-ux-execution.json`; chưa nghiệm thu toàn bộ browser/UAT, không coi các số đếm cũ là kết quả hiện tại.

## Đóng gói khi tháng lương đã khóa (migration 9)

Nhân viên vẫn dùng “Xác nhận đóng gói và ghi công”. Nếu ngày làm thuộc tháng đã khóa, hệ thống lưu tiến độ đóng gói và khoản **Công đóng gói chờ đối chiếu**, không ghi thêm lương vào tháng khóa. Ngày làm, người/chuyền, số lượng và đơn giá tại lúc đóng gói được giữ nguyên. Không cần đổi sang tài khoản quản lý để xác nhận hàng.

Tại Sản lượng hoặc Lương sản phẩm, nhân viên thấy khoản chờ của mình; quản lý có quyền điều chỉnh và xem lương chọn **Đối chiếu tiền công**, tự chọn ngày hạch toán thuộc kỳ còn mở và nhập lý do. Không có ngày hạch toán tự điền để tránh tự chuyển kỳ. Lưu một lần, giữ lịch sử ngày gốc và không cộng lại số đóng gói. Khoản chờ không được nhận công lần nữa qua chức năng bổ sung công cũ; lương đã khóa không bị mở lại. Tiền chờ chưa nằm trong tổng lương/Excel lương cho tới khi đối chiếu; backup SQLite và JSON nghiệp vụ có lưu khoản này.

Hồi quy mới nhất: 59/59 test, lint/build/TypeScript đạt; UX-BUG-003 sửa và xác minh tự động, còn chờ nghiệm thu trình duyệt. Database local đã có snapshot trước migration.

## Bố cục Lương sản phẩm / Sản lượng

Thanh lọc chính và lọc phụ đóng/mở nằm trên; tiếp theo là lượt công, tiền đã ghi nhận và số lần ghi nhận. Bảng nhân viên/chi tiết ở cột chính, công chờ và điều chỉnh ở cột bên theo quyền. Click tên nhân viên lọc chi tiết người đó. Các bảng phân trang 25 dòng, nhóm báo cáo cộng dữ liệu một lượt; công chờ/điều chỉnh 5 mục/trang, điều chỉnh có tìm kiếm. Export không bị giới hạn theo trang. Bố cục xếp xuống hàng trên màn hình nhỏ, giữ Arial/sans và chữ dễ đọc; không tạo số phần trăm tăng trưởng hoặc cảnh báo lỗi khi chưa có dữ liệu tương ứng.

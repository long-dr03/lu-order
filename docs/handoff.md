# Handoff — LUUTA (mô hình bộ phận đã gộp, đang go-live)

Cập nhật: 2026-10-15 · Nhánh `main`, HEAD `78b3f64`, cây làm việc sạch · [PR #1](https://github.com/long-dr03/lu-order/pull/1) đã gộp 08/10/2026 (`d6bb6fd`).

## 1. Tình trạng

- PR #1 (bộ phận, giảm thao tác, thiếu/NPL/quy định, UX) gộp vào `main` ngày 08/10/2026. PR #2 đồng bộ docs triển khai/QA gộp cùng ngày (`89688a0`). PR #3 (CI, query chi tiết đơn, error boundary) gộp 10/10/2026.
- Sau khi gộp, ~30 commit tiếp theo: chuẩn bị Kiểm NPL/Vải + Kiểm rập (đo theo POM, nhận xét viết, ảnh phiếu, file PDF/Excel/Word, ảnh chứng cứ), phân công thợ theo từng màu–size, một form Nhập sản lượng duy nhất cho mọi công đoạn, sổ giao hàng dạng bảng ngang, editor đơn giá nhóm theo đơn, QC hỏi số lỗi thay vì số đạt, date picker tiếng Việt, xuất workbook theo dõi đơn, bố cục điện thoại và PWA (logo, cài về màn hình chính, chụp ảnh từ camera, toast mời cài).
- Kiểm chứng 15/10/2026: `npm test` **83/83 đạt** trên PostgreSQL 17 tạm (container `luuta-postgres-test`, port 55499). CI trên `main` xanh đến commit cuối (build → tsc → lint → test). **README, postgresql-deployment.md và department-qa.md vẫn ghi 58 test — cần cập nhật.**
- Migration bộ phận đã chạy trên bản sao dữ liệu thật 08/10/2026, verified (`artifacts/department-migration.json`: 7 đơn, 15 hồ sơ, 15 hồ sơ chưa phân loại; backup `backups/LUUTA-before-departments-*.pg.json.gz`).
- `backups/prod-before-import-2026-10-13.dump` (13/10) cho thấy bước nhập dữ liệu thật vào PostgreSQL đã được thực hiện. Trạng thái triển khai thực tế cần chủ xưởng xác nhận; README vẫn giữ cảnh báo "không triển khai trước nghiệm thu local" — cập nhật khi đã nghiệm thu.

## 2. Mô hình nghiệp vụ hiện tại

- 6 bộ phận: Quản lý, Cắt, May, QC, Đóng gói, Giao hàng. Chuyền cũ chỉ là dữ liệu lịch sử.
- **Thợ chỉ có hồ sơ, không có tài khoản.** Tổ trưởng, QC, Quản lý (cấp tài khoản) nhập thay thợ. Tài khoản chỉ có vai trò Nhân viên bị khóa. Mỗi bộ phận chỉ nhập phần của mình; Quản lý nhập được mọi công đoạn nhưng không tự có quyền tài khoản, đơn giá, lương. Admin toàn quyền.
- Muốn ghi sản lượng phải có **phân công** thợ cho công đoạn/phần việc của đơn; phân công có thể giới hạn thợ nhận **riêng một số màu–size** của đơn (migration 23).
- **Chuẩn bị**: Kiểm NPL/Vải và Kiểm rập ghi kết quả ("đạt", "đạt có ghi chú", "không đạt") theo một trong bốn cách: đo theo bảng POM của đơn, nhận xét viết, ảnh phiếu đã điền (kèm số điểm đã kiểm), hoặc file đính kèm; có ảnh chứng cứ. Ghi để lưu lịch sử, **không chặn cắt**.
- Một lần lưu có thể gồm nhiều màu–size và nhiều thợ (`workers[]`), một transaction; sai một dòng thì hủy cả lần. Form nhập sản lượng dùng chung cho mọi công đoạn trong `OUTPUT_STAGES` (`src/lib/workflow.ts`); các bước không có bộ đếm riêng (Kiểm NPL/Vải, Kiểm rập, QC, Giao hàng) cộng theo trần đã có.
- **Cắt** được nhập dư so với đơn tới `overcut_percent` (mặc định 10%). May và các bước sau luôn bị chặn bởi số đặt. Nếu `overcut_paid=false`, phần dư lưu thành log đơn giá 0.
- **Sửa hàng thuộc bộ phận May** (thợ sửa là thợ may). QC chỉ kiểm và kiểm lại. Form QC hỏi **số lỗi** thay vì số đạt.
- QC lần đầu có thể **quy lỗi cho thợ May/Cắt** (`defect_attributions`); bảng lương hiện tổng lỗi và gợi ý trừ công theo `defect_penalty_percent`. **Hệ thống không tự trừ lương.**
- Giao hàng nhiều đợt (`shipments`) có ngày giờ thực tế; bắt buộc nguyên nhân khi giao trễ hoặc có sự cố. Sổ giao hiển thị một dòng mỗi lần giao, cột màu–size và số còn lại. **Nhập sai đợt giao: Admin sửa hoặc xóa được đợt đó** (yêu cầu 15/10/2026 của chủ xưởng; sửa giữ nguyên mã đợt, xong một transaction, số trở lại thành đã đóng gói chưa giao, bản ghi "Giao trước đây" không sửa/xóa).
- Tháng chốt chặn nhập công: đóng gói vẫn ghi số vật lý và khoản **Công đóng gói chờ đối chiếu** (giữ ngày gốc/giá gốc); người có quyền đối chiếu chọn ngày hạch toán kỳ mở.
- **Cột Thiếu** trong bảng màu–size: xem sản phẩm đang ở công đoạn nào, nguyên nhân đã ghi, ghi thêm nguyên nhân (không đổi số lượng).
- **NPL/Vải** (tab, Quản lý và Cắt): khai báo, nhận về/lỗi/dùng/trả, tính còn thiếu so với định mức. Tùy chọn, không chặn quy trình.
- **Quy định xưởng** (`app_settings`, key `policy`, cần quyền `rates.manage`): mức cắt dư, trả công phần dư, % gợi ý trừ công lỗi.

## 3. Thay đổi kỹ thuật cần biết

- **Migrations đến 23**, idempotent, chạy trong `initializeDatabase()` và sau `restoreSnapshot()`: 11 bộ phận (`department-migration.ts`, thu hồi session), 12 NPL/quy lỗi (`workshop-migration.ts`), 13 nhiều ảnh/đơn gắn màu (`photo-migration.ts`), 14–22 kiểm chuẩn bị + POM + ảnh phiếu/file (`preparation-migration.ts`), 23 màu–size phân công (`assignment-migration.ts`). Ba bảng của migration 12 nằm trong `TABLES` (snapshot) và `identityTables`.
- API chính: `POST /api/orders/:id/assignments` (thêm `{quick:true}`), `/checks`, `/pattern-specs`, `/shipments`, `/shortages`, `/materials`, `/operations`, `/stages`; `DELETE /api/orders/:id/shipments/:sid` và `PATCH …/shipments/:sid` (chỉ Admin, cần `version`); `PATCH /api/orders/:id` nhận `{prepare:true}`; `POST /api/rates` nhận `{copy_from}`; `POST /api/production/log` nhận `{workers:[...]}`; `GET|PUT /api/settings/policy`; `product-images` và `preparation-files` (ảnh 5 MB/20 MP, thu nhỏ, loại metadata, ảnh chưa dùng chỉ chủ sở hữu xem); `GET /api/export/tracking` xuất workbook theo dõi đơn.
- Logic nghiệp vụ chính: `src/lib/server/business.ts` (~1700+ dòng) và các module departments/shipments/shortages/materials/rates/policy/preparation/requirements. UI chính: `src/components/DepartmentWorkspace.tsx` (~2100 dòng), `OrderWorkspace.tsx`, `ProductionForms.tsx`, các tab `detail-*`, ErrorBoundary quanh màn chính.
- Test: `tests/system.test.mts` — 83 test trên PostgreSQL riêng (tạo database ngẫu nhiên rồi xóa), gồm API trực tiếp, request cạnh tranh, đọc lại Excel, snapshot/restore. Bộ test theo mô hình chuyền cũ ở `tests/legacy/`, không chạy.
- CI: `.github/workflows/ci.yml` — mỗi PR và mỗi push: build (chạy trước để Next.js sinh type route/layout) → `tsc --noEmit` → `eslint` → `npm test` với PostgreSQL 17 service, `TEST_DATABASE_URL` dùng database tạm.

## 4. Cách chạy lại

```bash
# PostgreSQL tạm cho test (container có sẵn: luuta-postgres-test, port 55499)
docker start luuta-postgres-test
TEST_DATABASE_URL=postgresql://postgres:<mật khẩu local>@127.0.0.1:55499/postgres npm test
docker stop luuta-postgres-test

# Chạy app trên DB tạm (cần INITIAL_ADMIN_USERNAME/PASSWORD ở local, không commit)
DATABASE_URL=postgresql://postgres:<mật khẩu>@127.0.0.1:55499/luuta_ui APP_ORIGIN=http://localhost:3010 \
SESSION_COOKIE_SECURE=false npm run bootstrap && npm run seed && npm run seed:accounts
npx next dev --webpack -H 127.0.0.1 --port 3010
```

Lưu ý môi trường:
- Trên máy dev, **Turbopack lỗi "Too many open files"** (`fs.inotify.max_user_instances` = 128). Dùng `--webpack`, hoặc tăng giới hạn đó.
- `gh pr edit` lỗi GraphQL (Projects classic). Sửa mô tả PR bằng `gh api -X PATCH repos/long-dr03/lu-order/pulls/<số> -F body=@file`.
- `.env.seed-accounts.local` chứa mật khẩu seed; đã bị git bỏ qua. Không đưa vào commit hay tài liệu.
- Đừng chạy `prettier --write` trên `src/app/globals.css`: file chưa từng được format, sẽ tạo diff cả nghìn dòng. Bốn file có cảnh báo prettier cũ: `globals.css`, `AuthScreen.tsx`, `instrumentation.ts`, `tests/legacy/system.test.mts`.

## 5. Quyết định còn mở (cần chủ xưởng / khách)

1. **NPL/Vải có thực sự cần không?** Nếu xưởng không ghi số vải thật thì gỡ tab (giữ giải trình "Lỗi vải" ở cột Thiếu). Gỡ được gọn: tab, bảng, sheet Excel `NPL-Vải`, dòng nhắc ở màn chuẩn bị.
2. **Mức cắt dư và có trả công phần dư không** (hiện 10% và có trả). Admin chỉnh ở tab Đơn giá → Quy định xưởng.
3. **Có trừ công thợ làm lỗi không, bao nhiêu %** (hiện 0 = chỉ theo dõi).
4. **Là ủi và cắt chỉ** trước đóng gói: chưa có công đoạn này. Duyệt mẫu đã quyết không đưa vào; khách chưa trả lời lại.
5. Đơn giá "Sửa hàng" nay thuộc thợ may; cần báo khách.

## 6. Việc còn lại

- [ ] Cập nhật số test **58 → 83** trong README, `docs/postgresql-deployment.md`, `docs/department-qa.md`.
- [ ] Nghiệm thu trên điện thoại/iPad thật theo [department-qa.md](department-qa.md), đặc biệt: nhập nhiều thợ một lần, phân công màu–size, QC quy lỗi, Đợt giao/sổ giao, thanh lưu cố định trên màn nhỏ, luồng PWA (cài về máy, chụp ảnh từ camera).
- [ ] Xác nhận với chủ xưởng năm quyết định còn mở ở mục 5.
- [ ] Xác nhận trạng thái prod sau dump 13/10 (đã nhập/đã go-live chưa); nếu đã triển khai, kiểm tra backup định kỳ trên server (`npm run backup` + lịch backup trong giao diện) và nhắc người dùng session hết hạn 24 giờ sau migration thu hồi session.

## 7. Giới hạn và rủi ro đã biết

- **Chưa nghiệm thu trình duyệt trên thiết bị thật.** Test tự động (71) và CI không chứng minh bố cục, focus, kéo thả, mức dễ hiểu với người dùng thật. Đợt trước đã bấm thử trên dữ liệu seed qua script capture (máy tính và điện thoại), chưa thử trên thiết bị thật.
- Quy lỗi chỉ ở QC lần đầu, chưa ở QC lại. Mỗi dòng quy lỗi kiểm tra không vượt sản lượng thợ đã ghi.
- "Gợi ý trừ công" tính theo đơn giá trung bình của thợ cho đơn/công đoạn đó; chỉ để tham khảo.
- Kết quả chuẩn bị (Kiểm NPL/Vải, Kiểm rập) ghi để lưu lịch sử, không chặn bước Cắt — người xưởng cần biết điều này.
- Thay đổi lớn gộp trong PR #1 (≈67 file); nếu cần review lại, làm theo từng commit.

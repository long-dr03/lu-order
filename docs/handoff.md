# Handoff — LUUTA (chuyển đổi sang mô hình bộ phận)

Cập nhật: 2026-10-08 · Nhánh `feat/department-workflow-fewer-clicks` · PR [long-dr03/lu-order#1](https://github.com/long-dr03/lu-order/pull/1) (mở, không phải nháp, chưa merge) · HEAD `4f181fe`.

## 1. Tình trạng

- Toàn bộ công việc đã commit và đẩy lên remote. 4 commit trên `main`: mô hình bộ phận → giảm thao tác → cắt dư/giải trình thiếu → sửa hàng/NPL/quy định xưởng → UX.
- **Chưa merge, chưa triển khai.** README ghi rõ: không triển khai bản chuyển đổi trước khi nghiệm thu local. Việc còn lại bắt buộc: chạy migration trên bản sao dữ liệu thật (mục 6).
- Kiểm tra gần nhất: `npm test` 58/58 qua (PostgreSQL 17 tạm), `tsc --noEmit` và `eslint` sạch. Repo chưa có CI, nên chỉ có kết quả chạy tay này.
- Đã bấm thử trên trình duyệt (máy tính và điện thoại, dữ liệu seed): phân công nhanh, ghi nhiều thợ một lần, chuyển bước, sao chép đơn giá, cắt dư, giải trình thiếu, NPL/vải, quy định xưởng, màn Bộ phận mới. **Chưa thử trên thiết bị thật** và chưa thử luồng QC quy lỗi trên giao diện (chỉ có test server).

## 2. Mô hình nghiệp vụ hiện tại

- 6 bộ phận: Quản lý, Cắt, May, QC, Đóng gói, Giao hàng. Chuyền cũ chỉ là dữ liệu lịch sử.
- **Thợ chỉ có hồ sơ, không có tài khoản.** Tổ trưởng, QC, Quản lý (cấp tài khoản) nhập thay thợ. Tài khoản chỉ có vai trò Nhân viên bị khóa. Mỗi bộ phận chỉ nhập phần của mình; Quản lý nhập được mọi công đoạn nhưng không tự có quyền tài khoản, đơn giá, lương. Admin toàn quyền.
- Muốn ghi sản lượng phải có **phân công** thợ cho công đoạn/phần việc của đơn.
- Một lần lưu có thể gồm nhiều màu–size và nhiều thợ (`workers[]`), một transaction; sai một dòng thì hủy cả lần.
- **Cắt** được nhập dư so với đơn tới `overcut_percent` (mặc định 10%). May và các bước sau luôn bị chặn bởi số đặt (`cutLimit`, `sewLimit` trong `src/lib/workflow.ts`). Nếu `overcut_paid=false`, phần dư lưu thành log đơn giá 0.
- **Sửa hàng thuộc bộ phận May** (thợ sửa là thợ may). QC chỉ kiểm và kiểm lại.
- QC lần đầu có thể **quy lỗi cho thợ May/Cắt** (`defect_attributions`); bảng lương hiện tổng lỗi và gợi ý trừ công theo `defect_penalty_percent`. **Hệ thống không tự trừ lương.**
- Giao hàng nhiều đợt (`shipments`), có ngày giờ thực tế; bắt buộc nguyên nhân khi giao trễ hoặc có sự cố.
- **Cột Thiếu** trong bảng màu–size: bấm để xem sản phẩm đang ở công đoạn nào, các nguyên nhân đã ghi, và ghi thêm nguyên nhân (`operation_records` action `shortage`, không đổi số lượng sản xuất).
- **NPL/Vải** (tab, chỉ Quản lý và Tổ trưởng Cắt): khai báo vải/phụ liệu, ghi nhận về/lỗi/dùng/trả. Tùy chọn, không chặn quy trình. Đây là suy luận của người làm, khách chưa xác nhận cần (xem mục 5).
- **Quy định xưởng** (`app_settings`, key `policy`, tab Đơn giá, cần quyền `rates.manage`): mức cắt dư, trả công phần dư, % gợi ý trừ công lỗi.

## 3. Thay đổi kỹ thuật cần biết

- **Migration 11** (`src/lib/server/department-migration.ts`): chuyển sang bộ phận, thu hồi mọi session. **Migration 12** (`src/lib/server/workshop-migration.ts`): `order_materials`, `material_movements`, `defect_attributions`. Cả hai idempotent, chạy trong `initializeDatabase()` và sau `restoreSnapshot()`. Ba bảng mới đã thêm vào `TABLES` (snapshot) và `identityTables`.
- API mới: `POST /api/orders/:id/assignments` (thêm `{quick:true}`), `/shipments`, `/shortages`, `/materials`; `PATCH /api/orders/:id` nhận `{prepare:true}`; `POST /api/rates` nhận `{copy_from}`; `POST /api/production/log` nhận `{workers:[...]}`; `GET|PUT /api/settings/policy`.
- Logic nghiệp vụ chính: `src/lib/server/business.ts` (lớn, ~1700 dòng), `departments.ts`, `shipments.ts`, `shortages.ts`, `materials.ts`, `rates.ts`, `policy.ts`. UI chính: `src/components/DepartmentWorkspace.tsx` (~2400 dòng), `ProductionForms.tsx` (Đơn giá + Quy định xưởng), `OrderWorkspace.tsx`.
- Test: `tests/system.test.mts`. Bộ test theo mô hình chuyền cũ ở `tests/legacy/`, không chạy.
- Hai thay đổi hành vi làm hỏng test cũ và đã sửa test: cắt vượt đơn (trước bị chặn), sửa hàng chuyển từ QC sang May.

## 4. Cách chạy lại

```bash
# PostgreSQL tạm cho test
docker run -d --rm --name luuta-test-pg -e POSTGRES_PASSWORD=test -p 55499:5432 postgres:17
TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55499/postgres npm test
npx tsc --noEmit && npx eslint

# Chạy app trên DB tạm (cần INITIAL_ADMIN_USERNAME/PASSWORD ở local, không commit)
DATABASE_URL=postgresql://postgres:test@127.0.0.1:55499/luuta_ui APP_ORIGIN=http://localhost:3010 \
SESSION_COOKIE_SECURE=false npm run bootstrap && npm run seed && npm run seed:accounts
npx next dev --webpack -H 127.0.0.1 --port 3010
```

Lưu ý môi trường:
- Trên máy dev, **Turbopack lỗi "Too many open files"** (`fs.inotify.max_user_instances` = 128). Dùng `--webpack`, hoặc tăng giới hạn đó.
- `gh pr edit` lỗi GraphQL (Projects classic). Sửa mô tả PR bằng `gh api -X PATCH repos/long-dr03/lu-order/pulls/1 -F body=@file`.
- `.env.seed-accounts.local` chứa mật khẩu seed; đã bị git bỏ qua. Không đưa vào commit hay tài liệu.
- Đừng chạy `prettier --write` trên `src/app/globals.css`: file chưa từng được format, sẽ tạo diff cả nghìn dòng. Bốn file có cảnh báo prettier cũ: `globals.css`, `AuthScreen.tsx`, `instrumentation.ts`, `tests/legacy/system.test.mts`.

## 5. Quyết định còn mở (cần chủ xưởng / khách)

1. **NPL/Vải có thực sự cần không?** Nếu xưởng không ghi số vải thật thì gỡ tab (giữ giải trình "Lỗi vải" ở cột Thiếu). Gỡ được gọn: tab, bảng, sheet Excel `NPL-Vải`, dòng nhắc ở màn chuẩn bị.
2. **Mức cắt dư và có trả công phần dư không** (hiện 10% và có trả). Admin chỉnh ở tab Đơn giá → Quy định xưởng.
3. **Có trừ công thợ làm lỗi không, bao nhiêu %** (hiện 0 = chỉ theo dõi).
4. **Là ủi và cắt chỉ** trước đóng gói: chưa có công đoạn này. Khách chưa trả lời; duyệt mẫu đã quyết không đưa vào.
5. Đơn giá "Sửa hàng" nay thuộc thợ may; cần báo khách.

## 6. Việc phải làm trước khi merge/triển khai

- [ ] Chạy `npm run db:migrate-departments` (cần `TEST_DATABASE_URL`) theo [department-migration.md](department-migration.md) trên **bản sao dữ liệu thật** và đối chiếu báo cáo `artifacts/department-migration.json`. Migration 12 tự áp khi khởi động ứng dụng sau migration 11; chưa có bước kiểm riêng cho nó ngoài `npm test`.
- [ ] **Gán lại phân công "Sửa hàng"** đang giao cho thợ QC sang thợ May (thợ QC không còn hợp lệ ở công đoạn này).
- [ ] Admin gán bộ phận cho từng hồ sơ thợ và duyệt tài khoản người ghi nhận (README mục "Thiết lập").
- [ ] Nghiệm thu bằng [department-qa.md](department-qa.md) trên điện thoại và iPad thật, đặc biệt: nhập nhiều thợ, QC quy lỗi, Đợt giao, thanh lưu cố định trên màn nhỏ.
- [ ] Cập nhật [postgresql-deployment.md](postgresql-deployment.md): vẫn ghi 63 test và migration 10 (thực tế 58 test, migration 12).
- [ ] Thêm CI chạy `tsc`, `eslint`, `npm test`.

## 7. Giới hạn và rủi ro đã biết

- Quy lỗi chỉ ở QC lần đầu, chưa ở QC lại. Mỗi dòng quy lỗi kiểm tra không vượt sản lượng thợ đã ghi.
- "Gợi ý trừ công" tính theo đơn giá trung bình của thợ cho đơn/công đoạn đó; chỉ để tham khảo.
- Cảnh báo "Có vấn đề" ở bảng tiến trình chỉ bật khi đơn trễ/nguy cơ trễ ở đúng công đoạn đang chạy.
- Chưa có ô nhập số kiểu +/−; chưa rà bằng mắt các màn Tổng quan, Tạo đơn, QC, Giao hàng sau đợt UX.
- Ước tính "giảm thao tác ~280 → ~180 mỗi đơn" là từ đọc mã, chưa đo trên người dùng thật.
- Thay đổi lớn gộp trong một nhánh (≈67 file); cân nhắc review theo từng commit.

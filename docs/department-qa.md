# QA, QC và ca nghiệm thu bộ phận

## Phạm vi và tiêu chí chốt

Bám mô hình sáu bộ phận. Thợ chỉ có hồ sơ; người ghi nhận có vai trò nghiệp vụ và bộ phận. Chấp nhận khi nhập liệu rõ người làm/người ghi, không vượt đầu vào, không trùng tiền công, không lộ lương ngoài phạm vi; dữ liệu cũ được giữ. Chỉ push/triển khai sau nghiệm thu local.

Kiểm thử tự động tại `tests/system.test.mts`: PostgreSQL riêng, tạo database ngẫu nhiên và xóa sau chạy. Có kiểm tra API trực tiếp, nhiều request cạnh tranh, đọc lại Excel bằng ExcelJS, snapshot/restore cả ảnh và dữ liệu cũ. SSR kiểm tra giới hạn số dòng hiển thị; **không thay thế kiểm tra trình duyệt**.

Fixture độc lập: Admin; Quản lý không quyền giá/lương/quản trị; người ghi nhận Cắt/May/QC/Đóng gói/Giao hàng; người kiêm Cắt+May; người chưa phân loại; tài khoản thợ cũ. Mỗi bộ phận có ít nhất hai thợ, một thợ kiêm nhiệm. Đơn 100 sản phẩm, nhiều màu–size; đơn nhiều phần việc; đơn trễ; tháng mở/khóa. Không dùng đơn/dữ liệu khách để thử ghi.

## Ca nghiệp vụ và phân quyền tự động

| Mã | Thực hiện | Kết quả phải có |
|---|---|---|
| DEP-01 | Chạy migration/khởi động hai lần; gỡ quyền rồi khởi động lại | Sáu mã bộ phận ổn định; không tự cấp lại quyền đã gỡ |
| DEP-02 | Gọi API không session/hết hạn/sai Origin/CSRF | 401 hoặc 403, không có dữ liệu ghi |
| DEP-03 | Đăng nhập tài khoản chỉ vai trò Nhân viên | Bị chặn, không cấp session nghiệp vụ |
| DEP-04 | Hồ sơ chưa phân loại gọi nghiệp vụ | 403 và thông báo cần cấu hình; Admin vẫn quản lý được |
| DEP-05 | Vai trò scope toàn xưởng ở Cắt gọi May/QC/Giao | Không vượt giới hạn bộ phận; xem tiến độ chung vẫn được |
| DEP-06 | Người kiêm Cắt+May ghi cả hai rồi bị rút Cắt | Cả hai được nhập trước; phiên cũ thu hồi và Cắt bị chặn sau rút |
| DEP-07 | Quản lý nhập các công đoạn rồi gọi quản trị/giá/lương | Nghiệp vụ được phép; quyền quản trị/tài chính không tự cấp |
| DEP-08 | Người quản lý thợ sửa hồ sơ có tài khoản hoặc cấp Quản lý | 403; chỉ Admin được đổi phạm vi đăng nhập/Quản lý |
| DEP-09 | Đổi hồ sơ liên kết tài khoản, tự nâng vai trò | Bị từ chối; danh tính tài khoản giữ đúng người |
| DEP-10 | Tạo/sửa hồ sơ không tạo tài khoản | Hồ sơ thuộc nhiều bộ phận được lưu; không có account phát sinh |
| ASN-01 | Chọn May/Cắt/Sửa hàng, thử phân công thợ sai bộ phận/ngừng hoạt động | Danh sách đúng bước; server từ chối thợ không hợp lệ |
| ASN-02 | Phân công nhiều thợ cùng phần việc; nhập khi chưa phân công | Nhiều thợ được lưu; chưa phân công không nhập được |
| ASN-03 | Bỏ phân công/đổi bộ phận sau có công | Chặn lần ghi mới; giữ công, giá và bộ phận lịch sử |
| ASN-04 | Phân công trùng thợ hoặc dùng version cũ | 422/409, không thay phân công/số lượng một phần |
| PROD-01 | Một thợ nhập nhiều màu–size một lần | Mỗi dòng lưu đúng một lần; tổng công bằng tổng lượng nhân giá lịch sử |
| PROD-02 | Trùng màu–size, một dòng vượt hoặc giả giá/bộ phận | Cả batch rollback; server xác định giá/bộ phận |
| PROD-03 | Hai người cùng nhập vượt đầu vào; retry cùng key | Không vượt, không trùng công; request cũ 409 nếu khác thao tác |
| PROD-04 | Nhiều thợ chia lượng cùng một phần việc | Tổng không vượt đầu vào; công riêng từng người |
| PROD-05 | Hai phần việc bắt buộc, hoàn thành lệch nhau | Sản phẩm hoàn thành bằng mức nhỏ nhất; không cộng gấp đôi |
| PROD-06 | Đổi giá sau có công | Công cũ không đổi; lần mới theo giá mới |
| PROD-07 | Tháng chốt: nhập công/đóng gói | Công thường bị chặn; đóng gói lưu vật lý + công chờ, không ghi vào lương khóa |
| QC-01 | QC gửi ID người kiểm khác | 403; người kiểm lấy từ session |
| QC-02 | QC gửi sửa hàng; người phụ trách May sửa bằng thợ May được giao | QC bị chặn (403); May ghi sửa, QC kiểm lại được |
| QC-03 | QC lỗi → sửa → kiểm lại nhiều vòng | Đầu vào/lỗi/đạt đúng; không đóng gói vượt lượng đạt |
| QC-04 | Thợ A nhận tiền công QC/sửa đã do B xử lý | Bị từ chối, không lấy lượng xử lý của người khác |
| CUT-01 | Cắt nhập vượt số đặt tới mức cắt dư (mặc định 10%) rồi vượt mức | Nhập được tới mức cho phép, hiện "cắt dư +n"; vượt mức bị từ chối; May không vượt số đặt |
| CUT-02 | Tắt "Trả công phần cắt dư", nhập cắt dư | Phần dư lưu thành bản ghi đơn giá 0, lý do ghi "không tính công" |
| SHORT-01 | Bấm số ở cột Thiếu, ghi nguyên nhân | Thấy sản phẩm đang ở công đoạn nào và các nguyên nhân; tổng giải trình không vượt số thiếu; số lượng sản xuất không đổi |
| NPL-01 | Khai báo vải, ghi nhận về/lỗi/dùng | Còn trong kho và còn thiếu tính đúng; không dùng quá số còn; chỉ Quản lý và Cắt thấy tab |
| POL-01 | Quản lý (không quyền đơn giá) đổi Quy định xưởng | 403; Admin đổi được và có trong nhật ký |
| UX-01 | Tổ trưởng mở Bộ phận | Thấy hạn giao, việc cần làm và nút đúng việc; đơn còn việc xếp trên; màn trống nêu lý do |
| FLOW-01 | Đơn 100: Cắt/May/QC/Đóng gói/Giao 20; làm tiếp 80 | Giao 20 được khi phần còn lại đang sản xuất; cuối đủ 100 |
| FLOW-02 | Kéo thẻ khi chưa có đầu vào; hoàn thành khi giao thiếu | Bị chặn; không tự thêm sản lượng; chỉ Quản lý xác nhận hoàn thành |
| FLOW-03 | Bộ phận khác chuyển bước; chuyển khâu chuẩn bị | Kiểm tra đồng thời quyền và bộ phận; chuẩn bị thuộc Quản lý |
| SHIP-01 | Đợt giao nhiều màu–size, một số kiện, ngày giờ có múi giờ | Một mã đợt; số kiện ghi một lần; chi tiết/người giao/người ghi rõ ràng |
| SHIP-02 | Giao vượt đóng gói, trùng dòng, retry | Không vượt, không nhân đôi; rollback cả đợt khi lỗi |
| SHIP-03 | Giao sau hạn/đánh dấu sự cố không lý do; giao từng phần đúng hạn | Hai trường hợp đầu yêu cầu lý do; giao thường không bị coi là thiếu |
| SEC-01 | Đăng ký/duyệt, đổi/reset mật khẩu, khóa, expired session/rate limit | Quy trình chờ duyệt đúng; phiên thu hồi; mật khẩu salt riêng |
| SEC-02 | Admin đại diện tài khoản một bộ phận | Theo bộ phận/quyền người đại diện; lịch sử giữ cả hai người |
| XLS-01 | Xuất rồi đọc lại Excel đơn/sản lượng/giao | Header cố định, số/tổng đúng; chuỗi bắt đầu '=' là văn bản |
| XLS-02 | Lọc người/màu/size/bộ phận, tài khoản không quyền lương | Các sheet theo bộ lọc; không nhận cột tiền ngoài quyền |
| IMG-01 | Tải ảnh mẫu/ảnh lỗi, dữ liệu ảnh hỏng, người không quyền | Ảnh hợp lệ lưu JPEG; ảnh hỏng/sai quyền bị chặn; đọc yêu cầu session |
| BK-01 | Backup/restore đầy đủ model mới | Giữ bộ phận/phân công/đợt giao/ảnh/công; archive không chứa credentials |
| BK-02 | Restore snapshot trước bộ phận | Giữ số chuyền/công cũ; không đoán bộ phận/giờ/đợt; session cũ hết hiệu lực |
| DATA-01 | Tạo đơn/hồ sơ mới | Không sinh số chuyền giả; không bắt chọn chuyền |
| DATA-02 | Seed trên database trống, chạy seed lần hai | Dữ liệu thật trong PostgreSQL; không nhân bản/ghi đè lần hai |
| UI-SSR-01 | Render danh sách >100 đơn/thợ | Chỉ hiện trang hiện tại; không đổ toàn bộ hàng trăm card |

Một test có thể xác minh nhiều dòng trên. Kết quả chạy chi tiết lưu local tại `artifacts/department-tests.log`; không đưa dữ liệu fixture hoặc credentials vào báo cáo công khai.

## QC trình duyệt và nghiệm thu người dùng — chưa chạy

Phải kiểm tra riêng tại **390, 768, 1024, 1366 và 1920px**, cả ngang/dọc nơi có ý nghĩa. Mỗi dòng dưới ghi người kiểm, viewport, kết quả, ảnh và lỗi phát hiện. Không đánh dấu đạt từ build hoặc API test.

| Mã | Thao tác | Điều kiện đạt |
|---|---|---|
| UI-01 | Đăng nhập từng bộ phận | Mở Công việc bộ phận tôi; dễ nhận ra việc được nhập và việc chỉ xem |
| UI-02 | Admin phân loại hồ sơ cũ | Tìm “Chưa phân loại”, gán nhiều bộ phận; thấy rõ ảnh hưởng thu hồi session |
| UI-03 | Mở đơn → Phân công → chọn công đoạn/phần việc | Chỉ thợ đúng bộ phận; chọn nhiều thợ; không hiểu nhầm người phụ trách là người làm tất cả |
| UI-04 | Chưa có phân công, bấm Ghi nhận | Có giải thích/đường dẫn; không có dropdown trống khó hiểu |
| UI-05 | Nhập bảng nhiều màu–size, Điền tối đa | Lượng còn dễ nhìn, không mất dữ liệu khi đổi thợ/phần việc; tiền chỉ hiện đúng quyền |
| UI-06 | QC lỗi/kiểm lại, thêm ảnh lỗi, quy lỗi cho thợ May/Cắt | Người kiểm cố định; chọn được thợ gây lỗi từ thợ đã phân công; tổng lỗi quy cho thợ không vượt số lỗi |
| UI-07 | Đóng gói/giao 20 rồi 80 | Thấy lượng còn lại, mã đợt, ngày giờ, người làm/người ghi, số kiện và lý do |
| UI-08 | List/Kanban chuyển bước | Cùng điều kiện/quyền; kéo có tay nắm; trên điện thoại dùng Chuyển bước tương đương |
| UI-09 | >100 đơn/thợ/phân công/lịch sử | Tìm kiếm/phân trang dùng được; thay bộ lọc trở về trang hợp lệ |
| UI-10 | Mở/đóng modal bằng Tab/Escape | Focus trong modal, nhãn rõ, trả focus khi đóng; không bị bàn phím mobile che nút lưu |
| UI-11 | Bật prefers-reduced-motion | Không animation gây khó chịu; transition nhẹ khi chế độ bình thường |
| UI-12 | Năm kích thước màn hình | Không tràn trang; bảng chỉ cuộn trong vùng; sidebar drawer không che tác vụ; chữ nội dung16/nhãn14/vùng chạm44px |
| UI-13 | Chỉnh ảnh/size riêng/màu phối/giá | Color picker kéo được; giá có dấu nhóm; ảnh xem lớn được; size riêng lưu đúng |
| UI-14 | Nhấn Xem hướng dẫn trên sidebar | Hướng dẫn đúng sáu bộ phận; không còn chỉ dẫn thợ tự đăng nhập/chọn chuyền |

**Giới hạn phiên kiểm tra hiện tại:** truy cập trình duyệt tới ứng dụng local bị chặn bởi thiết lập quyền đã lưu. Chưa chạy tương tác/chụp ảnh hoặc xác nhận responsive bằng trình duyệt. Tự động kiểm tra CSS/SSR chỉ xác nhận một phần bố cục. Không coi bản này đã hoàn tất nghiệm thu mobile/UAT.

## Phân loại lỗi và bàn giao

- Chặn phát hành: mất lịch sử, vượt phạm vi, sai tiền, nhập/giao trùng hoặc vượt, không khôi phục được backup.
- Cần sửa trước nghiệm thu: thao tác đúng bị chặn, dropdown không giải thích, không thao tác được mobile/bàn phím.
- Cải thiện: khoảng cách/nhãn/bố cục chưa rõ nhưng vẫn hoàn thành được tác vụ.

Lưu bằng chứng lỗi với thao tác, vai trò+bộ phận, dữ liệu đầu vào, mong đợi/thực tế và viewport. Không đưa mật khẩu/token/dữ liệu thật vào ảnh hoặc log chia sẻ. Sau sửa chạy test liên quan và bộ hồi quy khi ảnh hưởng quyền/tiền/quy trình.

## Kết quả local ngày 08/10/2026

- 58/58 kiểm thử tự động đạt trên PostgreSQL riêng; TypeScript, ESLint và production build đạt (kiểm tra lại trên `main` sau khi gộp PR #1).
- Migration 11 đã thử trên bản khôi phục rồi áp dụng local. Đối chiếu nguồn sau chuyển: giữ nguyên 7 đơn, 15 hồ sơ, 13 dòng tiền công và toàn bộ giá trị lịch sử/mật khẩu đã đối chiếu.
- 15 hồ sơ cũ chưa phân loại được giữ nguyên để Admin gán bộ phận. Không tạo dữ liệu thử hoặc tự đoán bộ phận trên database local.
- Đã có snapshot trước chuyển, báo cáo riêng `artifacts/department-migration.json` và log test local. Chưa push/triển khai.
- 14 ca UI trình duyệt ở bảng trên, năm viewport và ảnh nghiệm thu: **chưa chạy do quyền truy cập trình duyệt tới local bị chặn**.

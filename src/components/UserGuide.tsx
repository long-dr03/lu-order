"use client";

import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { PERMISSIONS, SCOPE_LABELS, type Account } from "@/lib/permissions";

const sections = [
  {
    title: "Bắt đầu: ai làm gì trong xưởng?",
    paragraphs: [
      "Admin chuẩn bị tài khoản và quyền. Người điều phối tạo đơn, giao chuyền, đặt đơn giá và chuyển bước. Nhân viên báo số lượng thực tế mình làm. QC ghi kết quả kiểm tra. Người giao hàng ghi số đã giao. Người có quyền chốt lương đối chiếu tiền công cuối tháng.",
      "Các vai trò mặc định: Admin quản trị toàn hệ thống; Giám đốc điều phối nghiệp vụ toàn xưởng và chốt lương; Trợ lý sản xuất điều phối nghiệp vụ; Tổ trưởng theo dõi và ghi nhận sản xuất trong chuyền được giao; QC kiểm tra chất lượng; Nhân viên ghi công và xem lương riêng. Quyền thực tế có thể được admin cấu hình lại.",
      "Chuyền là nhóm người sản xuất, còn công đoạn là bước đơn đang đi qua. Chuyền 4 có thể cùng lúc làm nhiều đơn ở các công đoạn khác nhau. Đổi chuyền phụ trách của tổ trưởng không có nghĩa là đổi danh tính hay chọn một nhân viên cấp dưới thay cho tổ trưởng.",
      "Một sản phẩm có thể do nhiều người cùng làm. Người phụ trách đơn là đầu mối theo dõi, không phải người duy nhất được ghi công cho đơn đó.",
    ],
  },
  {
    title: "Tạo đơn và chuẩn bị trước khi sản xuất",
    steps: [
      "Mở Đơn hàng → Tạo đơn. Kiểm tra mã tự sinh hoặc sửa mã theo cách đặt tên của xưởng. Điền khách hàng, tên và mã sản phẩm; thêm ảnh mẫu để mọi người dễ nhận diện.",
      "Chọn tổ phụ trách, ngày nhận, hạn giao và mức ưu tiên. Chỉ chọn người phụ trách nếu cần một đầu mối cá nhân.",
      "Thêm từng biến thể màu / size và số lượng. Một áo phối ba màu vẫn là một chiếc: thêm các màu vào cùng phối màu, không tạo ba dòng số lượng giống nhau. Chọn size có sẵn hoặc nhập size riêng.",
      "Lưu đơn, mở chi tiết để kiểm tra tổng số lượng. Nếu nhiều người làm các phần khác nhau, cấu hình công việc Cắt / May phù hợp trước khi nhập sản lượng.",
      "Mở Đơn giá, chọn đúng đơn và công đoạn / công việc, nhập giá rồi lưu. Nhân viên không tự đặt giá khi ghi công. Đổi giá chỉ áp dụng cho lần ghi nhận tiếp theo; tiền công đã lưu giữ giá lịch sử.",
    ],
  },
  {
    title: "Điều phối đơn từ nhận đơn đến hoàn thành",
    paragraphs: [
      "Luồng thông thường: Nhận đơn → Kiểm NPL/Vải → Kiểm rập → Cắt → May → QC → Đóng gói → Giao hàng → Hoàn thành. Nếu QC có lỗi: Sửa hàng → QC lại, sau đó mới đóng gói khi đạt đủ.",
      "Chuyển bước là xác nhận đơn được sang công đoạn tiếp theo. Thao tác này không tự ghi số đã cắt, may, đóng gói hay giao hàng. Những số đó phải được người thực hiện ghi nhận riêng.",
    ],
    steps: [
      "Trong Đơn hàng, tìm đơn bằng mã hoặc tên. Ở Danh sách dùng Chuyển đến…; ở Kanban dùng tay nắm kéo đơn tới bước đích hoặc dùng Chuyển đến… trên thẻ.",
      "Đọc thông báo điều kiện rồi xác nhận. Cần cắt đủ từng màu–size trước May, may đủ trước QC, QC đạt đủ trước Đóng gói, đóng gói đủ trước Giao hàng và giao đủ trước Hoàn thành.",
      "Nếu QC đạt hết, chuyển thẳng Đóng gói; không chọn Sửa hàng. Chỉ đi qua Sửa hàng / QC lại khi có hàng lỗi.",
      "Quay lại hoặc nhảy bước cần quyền chuyển bước ngoại lệ và lý do. Việc này không xóa số lượng hay tiền công đã ghi, cũng không bỏ qua điều kiện QC, đóng gói và giao đủ ở các bước cuối.",
    ],
  },
  {
    title: "Nhân viên: ghi nhận công việc và phối hợp nhiều người",
    steps: [
      "Mở Công việc, tìm đúng đơn rồi nhấn Ghi nhận công việc. Kiểm tra ngày làm việc, công đoạn, màu / size và công việc cụ thể nếu đơn có chia phần.",
      "Nhập số lượng chính bạn vừa hoàn thành, không nhập lại tổng lũy kế. Ví dụ hôm qua đã ghi 5, hôm nay làm thêm 2 thì chỉ ghi 2.",
      "Kiểm tra đơn giá và tiền công dự kiến, nhấn ghi nhận một lần. Nếu chưa có giá hoặc chưa đủ đầu vào, đọc thông báo và báo người điều phối xử lý.",
      "Mở Lịch sử sản lượng để đối chiếu bản ghi. Mở Lương của tôi để xem tiền công trong tháng và xuất Excel khi có quyền.",
    ],
    paragraphs: [
      "Ví dụ cùng công việc may: A làm 3 áo, B làm 2 áo thì mỗi người ghi phần của mình, tổng 5 áo. Nếu A may thân, B may tay, C ráp áo thì phải dùng các công việc riêng đã cấu hình; không cộng thân và tay thành số áo hoàn chỉnh.",
      "Với công việc chia phần, 5 thân + 5 tay + 3 áo ráp hoàn chỉnh không phải 13 áo. Số áo hoàn thành phụ thuộc các phần cần thiết; tiền công từng người theo công việc họ ghi.",
      "Tài khoản nhân viên ghi cho chính mình. Nếu không thấy đơn hoặc không ghi được, kiểm tra chuyền được giao và quyền với admin; không chọn hồ sơ của người khác để ghi thay.",
    ],
  },
  {
    title: "QC: kiểm đạt, ghi lỗi, sửa hàng và kiểm lại",
    steps: [
      "Mở Kiểm soát chất lượng, chọn đơn đang ở bước QC và mở thao tác kiểm tra.",
      "Chọn ngày, màu / size, số lượng xử lý và số đạt. Ví dụ kiểm 5 chiếc, đạt 3: nhập xử lý 5, đạt 3; còn 2 chiếc lỗi. Thêm mô tả và ảnh lỗi nếu có.",
      "Lưu kết quả cho từng màu–size. Tài khoản QC gắn với chính người kiểm; người có quyền ghi thay phải kiểm tra đúng danh tính được ghi nhận.",
      "Có lỗi thì người có quyền chuyển đơn sang Sửa hàng. Ghi số đã sửa, chuyển QC lại và ghi kết quả kiểm lại. Đạt đủ thì chuyển Đóng gói.",
    ],
    paragraphs: [
      "QC đạt không có nghĩa là đã đóng gói. Nếu không hiện thao tác, kiểm tra đơn có đang ở đúng bước QC / Sửa hàng / QC lại và tài khoản có quyền trong phạm vi đơn đó hay chưa.",
    ],
  },
  {
    title: "Đóng gói và giao hàng: người làm báo số thực tế",
    steps: [
      "Khi đơn ở Đóng gói, nhân viên dùng Ghi nhận công việc → Đóng gói, chọn màu / size và số vừa đóng. Hệ thống ghi số đóng gói và tiền công cùng lần xử lý; không ghi lại cùng số ở một màn hình khác.",
      "Đóng đủ mọi màu–size thì người điều phối chuyển đơn sang Giao hàng.",
      "Người được cấp quyền ghi nhận giao hàng mở đơn, ghi số thực giao theo màu / size, ngày giao, số kiện và ghi chú. Có thể giao nhiều lần: giao 2 trên 3 thì chỉ ghi 2, lần sau ghi 1.",
      "Kiểm tra số chưa giao. Khi đã giao đủ, người có quyền chuyển đơn sang Hoàn thành. Ghi giao hàng không tự tạo tiền công sản phẩm.",
    ],
    paragraphs: [
      "Quyền giao hàng cần được cấp cho người giao, không mặc định mọi nhân viên đều có. Nếu tháng công đã khóa khi đóng gói, số đóng thực tế vẫn được ghi và tiền công chờ xử lý; quản lý đưa khoản chờ sang kỳ mở, không nhập đóng gói lại.",
    ],
  },
  {
    title: "Theo dõi chuyền, sản lượng, lương và xuất Excel",
    steps: [
      "Mở Chuyền sản xuất để chọn chuyền và xem các đơn đang làm. Mở chi tiết màu / size khi cần tìm phần còn thiếu; hạn giao và cảnh báo hỗ trợ điều phối.",
      "Ở Sản lượng hoặc Lương sản phẩm, chọn tháng, đơn / sản phẩm, công đoạn và nhân viên trong phạm vi được xem. Mở Bộ lọc thêm khi cần ngày, màu, size hoặc chuyền.",
      "Đối chiếu tổng hợp với từng bản ghi. Nếu sai, người có quyền điều chỉnh nhập thay đổi và lý do; lịch sử giữ dấu vết. Không tạo thêm bản ghi để bù tùy tiện.",
      "Trước khi chốt lương, kiểm tra khoản chờ đóng gói và các điều chỉnh. Người có quyền chốt lương khóa tháng sau khi đối chiếu; các nghiệp vụ ghi công bị ràng buộc bởi tháng đã khóa.",
      "Nhấn Excel / Xuất báo cáo tại phân hệ cần tải. File theo bộ lọc và phạm vi quyền hiện tại. Muốn xuất tháng khác, đổi bộ lọc trước; nhân viên chỉ xuất tiền công của mình.",
    ],
  },
  {
    title: "Admin: tài khoản, chuyền, quyền và thao tác đại diện",
    steps: [
      "Người mới đăng ký tên đăng nhập, họ tên và mật khẩu; chờ admin duyệt trước khi làm việc.",
      "Mở Tài khoản, duyệt và cấu hình vai trò cùng chuyền được giao. Hồ sơ nhân viên là danh tính của chính tài khoản, không phải danh sách cấp dưới.",
      "Muốn chuyển tổ trưởng từ chuyền 1 sang chuyền 4, cập nhật Chuyền được giao. Tổ trưởng tiếp cận dữ liệu của chuyền mới theo quyền; không đổi hồ sơ thành một người đang ở chuyền 4.",
      "Mở Vai trò và quyền để cấu hình từng thao tác và phạm vi cá nhân / chuyền / toàn xưởng. Một người có nhiều vai trò sẽ hợp nhất quyền; thứ bậc vai trò chỉ giới hạn việc quản lý vai trò thấp hơn.",
      "Cần thử trải nghiệm của tài khoản khác: dùng chế độ đại diện và xác nhận lại mật khẩu admin. Banner cho biết đang thao tác thay ai; mọi thao tác dùng quyền người đó và có nhật ký. Nhấn Thoát đại diện để về admin.",
      "Khóa tài khoản khi cần ngừng truy cập. Đặt lại mật khẩu tạm yêu cầu người dùng đổi ở lần đăng nhập tiếp theo. Người dùng mở tên tài khoản góc trên để đổi mật khẩu hoặc đăng xuất.",
    ],
  },
  {
    title: "Sao lưu: đặt lịch, tải dữ liệu và khôi phục",
    steps: [
      "Admin mở Sao lưu ngoài chế độ đại diện. Thiết lập chu kỳ sao lưu và khoảng thời gian dữ liệu cần lưu trữ, rồi lưu cấu hình.",
      "Có thể tạo bản sao lưu ngay và tải file về nơi lưu trữ của xưởng. Lịch chạy khi máy chủ ứng dụng hoạt động; không tự tải xuống máy cá nhân khi trình duyệt đóng.",
      "Bản sao lưu toàn bộ PostgreSQL chứa dữ liệu hệ thống, tài khoản và ảnh; bản lưu trữ theo khoảng ngày phục vụ tra cứu dữ liệu nghiệp vụ. Không dùng bản theo ngày thay cho bản khôi phục toàn hệ thống.",
      "Để khôi phục, nhờ người vận hành máy chủ dùng hướng dẫn PostgreSQL của dự án, kiểm tra bản sao trên cơ sở dữ liệu trống trước. Giao diện hiện không có nút tự khôi phục đè dữ liệu.",
    ],
    paragraphs: [
      "Giữ bản sao ở nơi chỉ người được phép truy cập. File sao lưu toàn bộ có dữ liệu tài khoản và thông tin nội bộ; không gửi công khai.",
    ],
  },
  {
    title: "Gặp lỗi: kiểm tra gì trước?",
    paragraphs: [
      "Không có nút thao tác: kiểm tra vai trò, chuyền và công đoạn hiện tại. Xem được đơn không đồng nghĩa có quyền chuyển bước hoặc sửa tiền công.",
      "Không có đơn giá: nhờ quản lý đặt giá đúng đơn, công đoạn và công việc. Không nhập giá bằng ghi chú hoặc ghi sang công đoạn khác.",
      "Không đủ đầu vào / vượt số lượng: mở chi tiết đúng màu–size, đối chiếu số đã cắt, may, QC, đóng gói, giao. Ghi phần mới làm, không ghi lại tổng đã có.",
      "QC đã đạt nhưng không chuyển được: chọn Đóng gói, không chọn Sửa hàng; kiểm tra tất cả màu–size đều đạt đủ và tài khoản có quyền chuyển bước đó.",
      "Dữ liệu đã thay đổi: nhấn Làm mới, đọc số mới rồi thao tác lại. Một người khác có thể vừa cập nhật đơn; không gửi lại liên tục.",
      "Tháng đã khóa: nhờ người phụ trách lương kiểm tra. Không đổi ngày tùy tiện để vượt khóa. Với tiền đóng gói chờ, xử lý qua khoản chờ theo kỳ mở.",
      "Phiên hết hạn: đăng nhập lại. Nếu bị khóa hoặc thiếu quyền, liên hệ admin. Khi báo lỗi, cung cấp mã đơn, bước hiện tại, thao tác, số lượng và thông báo; không gửi mật khẩu.",
    ],
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

export function UserGuide({ user }: { user: Account }) {
  const [query, setQuery] = useState("");
  const filtered = sections.filter((section) =>
    normalize(
      [
        section.title,
        ...(section.paragraphs || []),
        ...(section.steps || []),
      ].join(" "),
    ).includes(normalize(query.trim())),
  );
  const grants = Array.from(
    new Set(
      user.roles.flatMap((role) =>
        role.grants.map(
          (grant) =>
            `${PERMISSIONS[grant.permission]} — ${SCOPE_LABELS[grant.scope]}`,
        ),
      ),
    ),
  );
  return (
    <div className="user-guide">
      <section className="panel guide-intro">
        <h2>
          <BookOpen size={24} aria-hidden="true" /> Dùng LUUTA trong công việc
          hằng ngày
        </h2>
        <p>
          Chọn chủ đề bên dưới hoặc tìm việc bạn muốn làm. Các bước hướng dẫn
          dùng tên chức năng trên giao diện; nút thao tác chỉ hiện khi tài khoản
          có quyền phù hợp.
        </p>
        <label className="guide-search">
          <span>Tìm trong hướng dẫn</span>
          <div>
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: QC, đóng gói, chốt lương…"
            />
          </div>
        </label>
        <details className="guide-permissions">
          <summary>
            Quyền của tài khoản hiện tại ·{" "}
            {user.roles.map((role) => role.name).join(", ")}
          </summary>
          <p>
            Phạm vi chuyền áp dụng theo các chuyền admin đã giao. Quyền cá nhân
            chỉ áp dụng cho chính bạn.
          </p>
          <ul>
            {grants.map((grant) => (
              <li key={grant}>{grant}</li>
            ))}
          </ul>
        </details>
      </section>
      <p className="muted" role="status">
        {filtered.length} chủ đề
        {query.trim() ? " phù hợp" : " · Nhấn tiêu đề để xem các bước"}
      </p>
      {filtered.map((section) => (
        <details
          className="panel guide-topic"
          key={`${section.title}-${!!query.trim()}`}
          open={query.trim() ? true : undefined}
        >
          <summary>{section.title}</summary>
          <div className="guide-content">
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.steps && (
              <ol>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        </details>
      ))}
      {filtered.length === 0 && (
        <p>
          Không tìm thấy chủ đề. Thử từ ngắn hơn như “may”, “QC” hoặc “lương”.
        </p>
      )}
    </div>
  );
}

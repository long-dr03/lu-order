"use client";

import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { PERMISSIONS, SCOPE_LABELS, type Account } from "@/lib/permissions";

const sections = [
  {
    title: "Ai sử dụng LUUTA?",
    paragraphs: [
      "Thợ chỉ có hồ sơ và không cần đăng nhập. Tổ trưởng, người phụ trách bộ phận, QC và quản lý ghi nhận thay thợ. Mỗi bản ghi lưu riêng người làm và tài khoản ghi nhận.",
      "Có sáu bộ phận: Quản lý, Cắt, May, QC, Đóng gói, Giao hàng. Một người có thể kiêm nhiệm nhiều bộ phận. QC phụ trách cả sửa hàng và kiểm lại.",
      "Vai trò quyết định thao tác được phép; bộ phận giới hạn công đoạn được nhập. Quản lý có thể nhập mọi công đoạn khi được cấp quyền nghiệp vụ, nhưng không tự có quyền quản trị, sửa giá hay xem/chốt lương. Admin có toàn quyền.",
    ],
  },
  {
    title: "Chuẩn bị hồ sơ và tài khoản",
    steps: [
      "Admin mở Danh sách thợ, phân loại hồ sơ chưa có bộ phận. Chọn một hoặc nhiều bộ phận đúng với việc người đó thực hiện; không cần tạo tài khoản cho thợ.",
      "Người cần vận hành web đăng ký và chờ Admin duyệt. Tại Tài khoản, Admin cấu hình vai trò và bộ phận trên chính hồ sơ của tài khoản; không liên kết tổ trưởng với một thợ cấp dưới.",
      "Chỉ Admin được đổi bộ phận của hồ sơ có tài khoản và giao bộ phận Quản lý. Đổi bộ phận thu hồi các phiên đăng nhập. Quyền vai trò có thể cấu hình riêng.",
      "Tài khoản chỉ có vai trò Nhân viên cũ được khóa; lịch sử sản lượng và tiền công giữ nguyên. Các hồ sơ chưa phân loại chưa được ghi nghiệp vụ mới.",
    ],
  },
  {
    title: "Tạo đơn, đặt giá và phân công nhiều thợ",
    steps: [
      "Quản lý mở Đơn hàng → Tạo đơn. Nhập khách, tên sản phẩm, ngày nhận, hạn giao; kiểm tra mã tự sinh, thêm ảnh và các biến thể màu–size. Thêm size cùng màu tạo dòng mới giữ nguyên màu, không phải gõ lại. Không chọn chuyền hoặc gán đơn cố định cho một bộ phận.",
      "Người phụ trách đơn là đầu mối điều phối, không phải người làm mọi công đoạn. Một áo phối nhiều màu vẫn tính số lượng một lần.",
      "Người có quyền Đơn giá cấu hình giá từng công đoạn, hoặc dùng Sao chép từ đơn trước để chép giá và phần việc Cắt/May của một đơn cùng sản phẩm. Nếu nhiều người làm thân, tay và ráp riêng, cấu hình các phần việc trước khi phân công. Thay giá không sửa tiền công lịch sử.",
      "Mở chi tiết đơn → Phân công → chọn công đoạn và phần việc → chọn nhiều thợ (hoặc Chọn tất cả) → Lưu phân công. Phân công nhanh cả bộ phận giao mọi thợ đang làm cho các công đoạn/phần việc chưa có người; phần đã phân công giữ nguyên. Chọn May chỉ hiện thợ thuộc May; sửa hàng cũng do thợ May thực hiện (QC chỉ kiểm và kiểm lại). Phân công không tự tạo tiền công.",
      "Nếu đơn cần kiểm vải, mở tab NPL/Vải để khai báo vải/phụ liệu cần dùng rồi ghi số nhận về, số lỗi, số đã dùng (bộ phận Cắt cũng ghi được số dùng và số lỗi). Ở tab Tiến độ, ô “Việc tiếp theo” nói bằng một câu việc cần làm lúc này (giao thợ, chuyển bước, giải trình số thiếu) và có nút đi thẳng tới đó. Quản lý nhấn Hoàn tất chuẩn bị → Cắt để qua Nhận đơn, Kiểm NPL/Vải, Kiểm rập trong một lần (lịch sử từng bước vẫn lưu) rồi bắt đầu sản xuất. Các bước sau chuyển bằng nút Chuyển sang… Khi một thợ ngừng làm, ngừng hoạt động hồ sơ hoặc bỏ phân công; lịch sử vẫn giữ nguyên.",
    ],
  },
  {
    title: "Ghi sản lượng nhiều màu–size trong một lần",
    steps: [
      "Mở Bộ phận: mỗi đơn hiện hạn giao (còn bao nhiêu ngày), việc bộ phận cần làm (ví dụ “Cần cắt thêm: 100”) và nút lớn để bắt đầu (Ghi sản lượng, Kiểm hàng hoặc Ghi giao hàng). Đơn còn việc được xếp lên trên, đơn gấp lên trước. Quản lý có thể chọn toàn quy trình theo quyền được cấp.",
      "Công đoạn thuộc bộ phận của bạn được chọn sẵn; ngày làm việc mặc định là hôm nay (bấm “Làm vào ngày khác” nếu cần). Thanh dưới cùng luôn hiện tổng số và nút lưu. Chọn phần việc nếu có, rồi bấm tên thợ đã được phân công. Nhiều thợ cùng làm: bấm thợ thứ nhất, nhập số; bấm thợ tiếp theo, nhập số của người đó — một lần lưu ghi cho tất cả, mỗi thợ nhận công riêng. Nếu chưa có thợ, dùng Mở đơn để phân công; không nhập vào hồ sơ của người khác để thay thế.",
      "Nhập lượng vừa làm thêm cho các màu–size trong cùng bảng. Ví dụ hôm qua 5, hôm nay thêm 2 thì ghi 2. Điền tối đa còn lại chỉ dùng khi đã thực sự làm xong số hiển thị.",
      "Công đoạn Cắt được nhập dư so với đơn vì thực tế thường cắt nhiều hơn. Mức dư tối đa (mặc định 10%) và việc có trả công phần dư hay không do người có quyền Đơn giá chỉnh ở mục Quy định xưởng của tab Đơn giá. May và các bước sau luôn chỉ tính tối đa theo số lượng đặt.",
      "Nhấn Ghi nhận một lần. Cả bảng được lưu trong cùng giao dịch; một dòng sai khiến toàn bộ lần nhập bị từ chối. Nếu dữ liệu đã thay đổi, tải lại số lượng trước khi nhập tiếp.",
    ],
    paragraphs: [
      "Nhiều thợ chia cùng phần việc không được ghi vượt đầu vào. Nếu chia thành nhiều phần việc bắt buộc, số sản phẩm hoàn thành là số đủ tất cả các phần; tiền công vẫn ghi riêng theo thợ và đơn giá tại thời điểm thực hiện.",
      "Lương khóa sẽ chặn ghi công mới. Riêng đóng gói thực tế vẫn có thể ghi với khoản công chờ đối chiếu; người có quyền lương xử lý khoản chờ, không đóng gói lại để tính công.",
    ],
  },
  {
    title: "Theo dõi tiến trình và giải trình số thiếu",
    steps: [
      "Mở chi tiết đơn → Tiến độ. Bảng tiến trình cho thấy từng công đoạn đang Chưa bắt đầu, Đang thực hiện, Hoàn thành hay Có vấn đề, kèm số nhận, số xong, số còn lại, người được giao và giờ bắt đầu/xong.",
      "Cột Thiếu của bảng màu–size cho biết số sản phẩm chưa giao. Bấm vào số đó để xem sản phẩm đang nằm ở công đoạn nào và mọi nguyên nhân đã ghi (QC, cắt, giao trễ…).",
      "Người có quyền ghi nhận chọn nguyên nhân (Lỗi vải, Kỹ thuật may, Cắt thiếu, Hỏng khi QC/sửa hàng, Khách đổi hoặc hủy, Chờ xe/chờ giao, Khác), nhập số lượng và giải thích rồi Lưu. Tổng số giải trình không vượt số còn thiếu và không làm đổi số lượng sản xuất.",
      "Lịch sử giao hàng nằm ngay dưới bảng: mỗi lần giao có ngày giờ cụ thể và số lượng từng màu–size, ví dụ ngày 1/10 giao 5 size S và 5 size M, ngày 3/10 giao 5 size M và 5 size L.",
    ],
  },
  {
    title: "QC, sửa hàng và kiểm lại",
    steps: [
      "Người phụ trách QC mở Kiểm soát chất lượng hoặc chi tiết đơn → Kiểm QC. Người kiểm được lấy từ tài khoản, không chọn người khác.",
      "Chọn kiểm lần đầu hoặc kiểm lại; nhập ngày giờ, số kiểm và số đạt cho nhiều màu–size. Kiểm 5 đạt 3 thì còn 2 lỗi. Ghi mô tả lỗi và giải trình khi cần.",
      "Để sửa: phân công thợ May ở công đoạn Sửa hàng, rồi người phụ trách May mở Ghi sản lượng → Sửa hàng. Hệ thống lưu người sửa riêng với người ghi nhận. QC không sửa hàng.",
      "Khi QC lần đầu có sản phẩm lỗi, chọn Thợ gây lỗi (May hoặc Cắt) và số sản phẩm lỗi của từng người; không bắt buộc. Số lỗi quy cho thợ không vượt số lỗi QC và không vượt sản lượng thợ đó đã ghi. Tab Lương sản phẩm có bảng Lỗi quy cho từng thợ kèm gợi ý trừ công theo mức đặt ở Quy định xưởng; hệ thống không tự trừ lương, muốn trừ thì dùng Điều chỉnh có lý do.",
      "Sau sửa, QC ghi kiểm lại. Chỉ lượng QC đạt được đóng gói; lượng lỗi tiếp tục sửa và kiểm lại. Không phải chờ cả đơn đủ mới xử lý phần đạt.",
    ],
  },
  {
    title: "Đóng gói và giao nhiều đợt",
    steps: [
      "Phân công thợ Đóng gói. Người phụ trách bộ phận mở Ghi sản lượng → Đóng gói, chọn thợ và nhập nhiều màu–size. Một lần lưu ghi cả số đóng và tiền công hoặc khoản chờ.",
      "Phân công người giao thuộc Giao hàng. Mở chi tiết đơn → Đợt giao, chọn người giao, ngày giờ thực tế Việt Nam (Bây giờ lấy giờ hiện tại), số kiện, nhiều dòng màu–size và ghi chú đối soát. Giao hết phần đã đóng gói điền sẵn mọi số đang chờ giao.",
      "Bắt buộc nguyên nhân khi giao sau hạn hoặc đánh dấu sự cố. Giao từng phần bình thường không tự coi là thiếu hàng. Nguyên nhân gắn với từng lần ghi nhận, không ghi đè lên đơn.",
      "Lưu đợt giao để có mã riêng và lịch sử đối soát. Tổng giao không được vượt lượng đã đóng gói. Các lần giao cũ giữ nguyên trong Lịch sử, không bịa giờ hay tự gộp thành đợt.",
    ],
    paragraphs: [
      "Ví dụ đơn 100 áo: cắt, may, QC, đóng và giao 20 áo trước; 80 áo còn lại tiếp tục sản xuất rồi giao đợt sau. Không cần cả đơn ở bước Giao hàng mới giao được phần đủ điều kiện.",
    ],
  },
  {
    title: "Điều phối Kanban và hoàn thành đơn",
    paragraphs: [
      "Đơn hàng có Danh sách và Kanban; cả hai hỗ trợ Chuyển đến. Kanban chỉ thể hiện bước điều phối chính. Các bộ phận vẫn xử lý song song theo lũy kế màu–size thực tế.",
      "Di chuyển thẻ không tự tạo sản lượng. Người chuyển phải có quyền và thuộc bộ phận của công đoạn đang điều phối; Quản lý chuyển toàn quy trình. Khâu chuẩn bị và xác nhận hoàn thành thuộc Quản lý.",
      "Hoàn thành chỉ khi đã giao đủ từng màu–size. Quay lại/nhảy bước cần quyền ngoại lệ và nguyên nhân; không xóa số lượng, tiền công hay bỏ qua điều kiện đầu vào.",
    ],
  },
  {
    title: "Báo cáo, lương, Excel và sao lưu",
    steps: [
      "Bộ phận mặc định ưu tiên công việc của mình. Quản lý có thể lọc toàn xưởng. Dùng tìm kiếm và phân trang với danh sách dài.",
      "Lịch sử sản lượng, Lương sản phẩm và Excel dùng cùng bộ lọc, quyền và bộ phận. Tiền công chỉ hiển thị khi có quyền xem lương; nhập nghiệp vụ không đồng nghĩa được xem lương.",
      "Người có quyền điều chỉnh nhập nguyên nhân; giữ lịch sử trước/sau. Đối chiếu khoản đóng gói chờ trước khi chốt tháng.",
      "Admin mở Sao lưu để đặt chu kỳ và khoảng ngày lưu trữ. Bản toàn bộ PostgreSQL dùng khôi phục; bản theo khoảng ngày dùng tra cứu. Máy chủ phải hoạt động để lịch chạy.",
      "Trước khôi phục phải thử trên cơ sở dữ liệu trống. Backup mới lưu cả bộ phận, phân công, đợt giao và người ghi nhận; bản trước chuyển đổi giữ dữ liệu cũ và yêu cầu Admin phân loại lại.",
    ],
  },
  {
    title: "Không ghi nhận được: kiểm tra gì?",
    paragraphs: [
      "Thiếu bộ phận: nhờ Admin phân loại chính hồ sơ tài khoản. Có quyền toàn xưởng vẫn không được nhập ngoài bộ phận nếu không thuộc Quản lý.",
      "Không có thợ: khai báo đúng bộ phận, đang hoạt động và phân công đúng đơn/công đoạn/phần việc. Chọn một thợ cho mỗi lần nhập; có thể nhập nhiều màu–size cùng lúc.",
      "Thiếu đầu vào: kiểm tra lượng đã cắt, may, QC đạt, đóng gói và giao của đúng màu–size. Ghi phần mới, không ghi lại lũy kế.",
      "Thiếu đơn giá: người có quyền cấu hình giá trước khi ghi công. Không gửi giá từ form sản lượng.",
      "Dữ liệu thay đổi: làm mới rồi kiểm tra lại. Phiên hết hạn hoặc quyền/bộ phận vừa đổi: đăng nhập lại.",
      "Khi báo lỗi, cung cấp mã đơn, công đoạn, số lượng và thông báo; không gửi mật khẩu.",
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
        role.grants
          .filter((g) => g.permission !== "delivery.record")
          .map(
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
            Bộ phận lấy từ chính hồ sơ tài khoản. Quyền thao tác và bộ phận phải
            đồng thời phù hợp; thợ không đăng nhập phần mềm.
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

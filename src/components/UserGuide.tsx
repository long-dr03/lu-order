"use client";

import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { PERMISSIONS, SCOPE_LABELS, type Account } from "@/lib/permissions";

const sections: { title: string; paragraphs?: string[]; steps?: string[] }[] = [
  {
    title: "Tổng quan: ai dùng và quy trình một đơn",
    paragraphs: [
      "Thợ chỉ có hồ sơ, không cần đăng nhập. Quản lý và người phụ trách bộ phận nhập liệu thay thợ; mỗi bản ghi lưu cả người làm lẫn người nhập.",
      "Một đơn đi qua: Nhận đơn → Kiểm NPL/Vải → Kiểm rập → Cắt → May → QC → Sửa hàng → QC lại → Đóng gói → Giao hàng → Hoàn thành. Các bộ phận làm song song theo số lượng thực tế: xong đến đâu chuyển tiếp đến đó, không phải chờ cả đơn.",
      "Có sáu bộ phận: Quản lý, Cắt, May, QC, Đóng gói, Giao hàng. Một người có thể thuộc nhiều bộ phận.",
    ],
  },
  {
    title: "Bước 1 · Tạo đơn hàng",
    steps: [
      "Mở Đơn hàng → Tạo đơn. Nhập khách hàng, tên sản phẩm, ngày nhận, hạn giao.",
      "Thêm ảnh mẫu nếu có (nhiều ảnh, mỗi ảnh gắn với một màu hoặc dùng chung).",
      "Khai báo từng màu–size và số lượng. “Thêm size cùng màu” tạo dòng mới giữ nguyên màu.",
      "Bấm Tạo đơn hàng. Đơn mới nằm ở bước Nhận đơn.",
    ],
  },
  {
    title: "Bước 2 · Đặt đơn giá",
    steps: [
      "Mở chi tiết đơn → tab Tiến độ → ô “Đơn giá công đoạn”.",
      "Nhập giá (đ / sản phẩm) cho từng khâu, hoặc bấm “Lấy giá đơn trước” rồi sửa lại nếu cần. Bấm Lưu đơn giá.",
      "Phải có giá Cắt mới bấm được “Hoàn tất chuẩn bị → Cắt”. Khâu nào chưa có giá thì chưa nhập được sản lượng cho khâu đó.",
      "Giá của Kiểm NPL/Vải, Kiểm rập và Giao hàng không bắt buộc; chỉ đặt nếu xưởng trả công các khâu này theo sản phẩm.",
    ],
    paragraphs: [
      "Đổi giá chỉ áp dụng cho lần nhập sau; tiền công đã ghi giữ nguyên. Muốn chia Cắt hoặc May thành nhiều phần việc (thân, tay, ráp…) thì cấu hình ở trang Đơn giá.",
    ],
  },
  {
    title: "Bước 3 · Phân công thợ, chia màu và size",
    steps: [
      "Mở chi tiết đơn → tab Phân công. Mỗi khâu là một dòng, hiện sẵn ai đang được giao.",
      "Chạm vào một khâu → chạm tên thợ để chọn hoặc bỏ → Lưu. “Phân công nhanh cả bộ phận” giao hết thợ đang làm cho những khâu chưa có người.",
      "Đơn có nhiều màu hoặc nhiều size: ở mục “Chia màu / size”, chạm màu và size cho từng thợ, hoặc bấm “Mỗi thợ một màu”, “Mỗi thợ một size”. Không chọn gì nghĩa là thợ đó làm tất cả.",
    ],
  },
  {
    title: "Bước 4 · Kiểm NPL/Vải, Kiểm rập và chuyển sang Cắt",
    steps: [
      "Tab NPL/Vải: khai báo vải, phụ liệu cần dùng; ghi số nhận về, số lỗi, số đã dùng và kết quả kiểm.",
      "Tab Kiểm rập: ghi kết quả bằng một trong ba cách — Nhập trên web (đo theo bảng thông số hoặc đánh giá bằng chữ), Ảnh chụp bảng đo, hoặc File đính kèm. Chọn kết quả, người kiểm, người duyệt rồi Lưu. Mỗi lần lưu là một lượt kiểm, lượt cũ vẫn giữ.",
      "Muốn đo theo bảng: bấm “Khai báo bảng thông số”, chọn đơn vị và size, rồi dán bảng POM từ Excel.",
      "Khi kết quả đã đạt, bấm “Hoàn tất chuẩn bị → Cắt” ngay dưới kết quả. Nếu nút bị khóa vì thiếu giá Cắt, nhập giá ở ô hiện ngay tại đó.",
    ],
  },
  {
    title: "Bước 5 · Nhập sản lượng",
    steps: [
      "Bấm nút “Nhập sản lượng” ở góc màn hình (hoặc mở chi tiết đơn → tab Ghi sản lượng). Chọn đơn và công đoạn; mỗi công đoạn ghi rõ còn bao nhiêu.",
      "Chạm tên thợ rồi nhập số theo từng màu–size. Nhiều thợ cùng làm: chạm thợ kế tiếp và nhập tiếp — một lần lưu ghi cho tất cả, mỗi người nhận công riêng.",
      "Có người qua phụ: bấm “Thêm thợ”, chọn tên (Quản lý chọn được cả thợ bộ phận khác) rồi nhập số cho người đó.",
      "Thợ đã được chia màu/size chỉ thấy phần của mình; bấm “Hiện cả màu / size khác” nếu cần ghi ngoài phần đó.",
      "Chỉ nhập số vừa làm thêm, không nhập lại tổng. Ví dụ hôm qua 5, hôm nay thêm 2 thì ghi 2.",
      "Ngày làm mặc định là hôm nay; bấm “Làm vào ngày khác” để đổi. Bấm “Ghi nhận một lần” để lưu.",
    ],
    paragraphs: [
      "Giới hạn từng khâu: Cắt được dư tối đa theo Quy định xưởng (mặc định +10%); May theo số đã cắt; Đóng gói theo số QC đạt; QC theo số đã kiểm ở tab Kiểm QC; Giao hàng theo số đã giao ở tab Đợt giao; Kiểm NPL/Vải và Kiểm rập theo số lượng đặt.",
    ],
  },
  {
    title: "Bước 6 · QC, sửa hàng và kiểm lại",
    steps: [
      "Mở chi tiết đơn → tab Kiểm QC. Chọn Kiểm lần đầu hoặc Kiểm lại sau sửa, nhập ngày giờ, số kiểm và số lỗi cho từng màu–size. Không có lỗi thì để trống ô Số lỗi; số đạt tự tính bằng số kiểm trừ số lỗi.",
      "Có hàng lỗi thì có thể chọn thợ gây lỗi (May hoặc Cắt) và số lỗi của từng người; không bắt buộc.",
      "Hàng lỗi do thợ May sửa: nhập ở Nhập sản lượng → Sửa hàng. Sửa xong, QC ghi Kiểm lại.",
      "Chỉ số QC đạt mới được đóng gói.",
    ],
    paragraphs: [
      "Số lỗi quy cho thợ hiện ở trang Lương sản phẩm kèm gợi ý trừ công. Hệ thống không tự trừ lương; muốn trừ thì dùng Điều chỉnh và ghi lý do.",
    ],
  },
  {
    title: "Bước 7 · Đóng gói và giao hàng",
    steps: [
      "Đóng gói: Nhập sản lượng → Đóng gói, chọn thợ và nhập số theo màu–size.",
      "Giao hàng: mở chi tiết đơn → tab Đợt giao. Chọn người giao, ngày giờ giao, số kiện và số lượng từng màu–size. “Giao hết phần đã đóng gói” điền sẵn mọi số đang chờ giao.",
      "Giao sau hạn hoặc có sự cố thì phải ghi nguyên nhân. Bấm Lưu đợt giao.",
      "Bảng lịch sử giao hiện từng lần giao theo ngày, số lượng từng size và số còn lại.",
    ],
    paragraphs: [
      "Giao được nhiều đợt: ví dụ đơn 100 áo, giao trước 20 áo đã đóng gói, 80 áo còn lại sản xuất tiếp rồi giao sau.",
    ],
  },
  {
    title: "Theo dõi tiến độ, chuyển bước và hoàn thành đơn",
    steps: [
      "Tab Tiến độ: ô “Việc tiếp theo” nói việc cần làm lúc này; bảng tiến trình cho biết từng khâu đã nhận, đã xong, còn lại bao nhiêu và ai làm.",
      "Cột Thiếu của bảng màu–size là số chưa giao. Bấm vào số đó để xem hàng đang nằm ở khâu nào và ghi nguyên nhân thiếu.",
      "Chuyển bước bằng nút “Chuyển sang…” cuối tab Tiến độ, hoặc ô “Chuyển bước” ở trang Đơn hàng (dạng Danh sách hoặc Bảng theo bước).",
      "Quản lý được quay lại hoặc nhảy bước, chỉ cần ghi lý do; số lượng và tiền công đã ghi giữ nguyên.",
      "Đơn chỉ chuyển sang Hoàn thành khi đã giao đủ từng màu–size.",
    ],
    paragraphs: [
      "Trang Bộ phận liệt kê việc còn lại của từng bộ phận trên mỗi đơn, đơn gấp xếp trước; bấm nút ở mỗi dòng để mở đúng chỗ nhập.",
    ],
  },
  {
    title: "Sản lượng, lương và xuất Excel",
    steps: [
      "Trang Sản lượng: xem các lần đã nhập, lọc theo tháng, công đoạn, nhân viên, sản phẩm.",
      "Trang Lương sản phẩm: tiền công theo thợ trong tháng. Người có quyền được điều chỉnh một bản ghi (phải ghi lý do, hệ thống giữ lại số trước và sau) và chốt lương tháng.",
      "Tháng đã chốt thì không ghi công mới vào tháng đó. Riêng đóng gói vẫn ghi được, tiền công nằm ở mục chờ đối chiếu.",
      "Ở trang Đơn hàng, nút “Xuất danh sách đơn” tải danh sách đơn, phân công và đợt giao theo bộ lọc đang chọn; trang Sản lượng và Lương có nút Xuất Excel riêng.",
      "Ở trang Đơn hàng, nút “Xuất bảng theo dõi giao hàng” tải file theo dõi đơn hàng theo mẫu của xưởng: mỗi khách một sheet, mỗi sản phẩm một khối gồm hình, số đặt theo size, số cắt, từng lần giao theo ngày, số còn lại, ghi chú, ngày cắt xong, nhóm may và số may theo ngày.",
    ],
  },
  {
    title: "Hồ sơ thợ, tài khoản và sao lưu",
    steps: [
      "Danh sách thợ: thêm thợ, chọn bộ phận, ngừng hoạt động khi thợ nghỉ. Lịch sử sản lượng và tiền công của thợ đã nghỉ vẫn giữ.",
      "Tài khoản và quyền: người cần đăng nhập thì đăng ký rồi chờ Admin duyệt, gán vai trò và bộ phận.",
      "Sao lưu (chỉ Admin): đặt lịch sao lưu tự động và tải bản sao lưu về máy.",
    ],
  },
  {
    title: "Không nhập được: kiểm tra gì?",
    paragraphs: [
      "“Chưa có thợ”: bấm “Thêm thợ” trong form, hoặc phân công ở tab Phân công của đơn.",
      "“Chưa có đơn giá”: đặt giá ở tab Tiến độ → Đơn giá công đoạn.",
      "“Quản lý cần hoàn tất chuẩn bị”: đơn còn ở khâu chuẩn bị; bấm “Hoàn tất chuẩn bị → Cắt”.",
      "Số lượng bị từ chối: kiểm tra số đã cắt, may, QC đạt, đóng gói của đúng màu–size; khâu sau không ghi vượt khâu trước.",
      "“Đơn đã thay đổi”: bấm Làm mới rồi nhập lại. Bị đẩy về màn đăng nhập: phiên đã hết hạn, đăng nhập lại.",
      "Khi báo lỗi, gửi kèm mã đơn, công đoạn, số lượng và nội dung thông báo; không gửi mật khẩu.",
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
          <BookOpen size={24} aria-hidden="true" /> Hướng dẫn sử dụng
        </h2>
        <p>
          Các bước dưới đây theo đúng thứ tự làm một đơn hàng. Chạm vào tiêu đề
          để mở, hoặc gõ việc bạn cần vào ô tìm.
        </p>
        <label className="guide-search">
          <span>Tìm trong hướng dẫn</span>
          <div>
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: đơn giá, thêm thợ, giao hàng…"
            />
          </div>
        </label>
        <details className="guide-permissions">
          <summary>
            Quyền của tài khoản hiện tại ·{" "}
            {user.roles.map((role) => role.name).join(", ")}
          </summary>
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
            {section.steps && (
              <ol>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
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

import ExcelJS from "exceljs";

// The workshop's own tracking sheet ("THEO DÕI VÀ KIỂM SOÁT ĐƠN HÀNG"): one sheet per customer,
// one block of rows per product, sizes down the block, and each delivery as a line across it.
// This writes the same layout from the system's data so it can be handed to customers as before.

export type TrackingLine = { color: string; size: string; quantity: number };
export type TrackingOrder = {
  id: string;
  customer: string;
  product_name: string;
  order_date: string;
  deadline: string;
  notes: string;
  completed: boolean;
  variants: {
    color: string;
    size: string;
    quantity: number;
    cut_qty: number;
    delivered_qty: number;
  }[];
  /** Deliveries to the customer, oldest first. */
  deliveries: { date: string; items: TrackingLine[] }[];
  /** Pieces handed back by the sewers, per working day. */
  sewing: { date: string; items: TrackingLine[] }[];
  cutDone?: string;
  sewingStart?: string;
  sewers: string[];
  image?: { buffer: Buffer; width: number; height: number };
};

const BASE_SIZES = ["XS", "S", "M", "L", "XL"];
const SIZE_RANK = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
const rank = (size: string) => {
  const at = SIZE_RANK.indexOf(size.trim().toUpperCase());
  return at < 0 ? SIZE_RANK.length : at;
};
const bySize = (a: string, b: string) =>
  rank(a) - rank(b) || a.localeCompare(b, "vi");

const ROW_HEIGHT = 23.25; // points, as in the workshop's sheet
const ROW_PX = 31;
const IMAGE_COLUMN_PX = 150;
const EMU = 9525; // per pixel
const HEAD: Partial<ExcelJS.Font> = {
  name: "Times New Roman",
  size: 9,
  bold: true,
};
const BODY: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HAIR: Partial<ExcelJS.Borders> = {
  top: { style: "hair" },
  left: { style: "hair" },
  bottom: { style: "hair" },
  right: { style: "hair" },
};
const DONE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};
const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

const asDate = (iso?: string) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Date(`${iso.slice(0, 10)}T00:00:00Z`)
    : null;

/** Excel sheet names: 31 characters, none of []:*?/\ and unique within the book. */
function sheetName(customer: string, taken: Set<string>) {
  const base =
    customer
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 31) || "Khách hàng";
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++)
    name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  taken.add(name.toLowerCase());
  return name;
}

export function trackingWorkbook(orders: TrackingOrder[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LUUTA";
  const customers = [...new Set(orders.map((o) => o.customer))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const taken = new Set<string>();
  for (const customer of customers) {
    const mine = orders
      .filter((o) => o.customer === customer)
      .sort(
        (a, b) =>
          a.order_date.localeCompare(b.order_date) || a.id.localeCompare(b.id),
      );
    const sizes = [
      ...BASE_SIZES,
      ...[
        ...new Set(mine.flatMap((o) => o.variants.map((v) => v.size))),
      ].filter((s) => !BASE_SIZES.includes(s)),
    ].sort(bySize);
    const n = sizes.length;
    // Column numbers, laid out exactly as the workshop's sheet with n size columns.
    const col = {
      image: 1,
      name: 2,
      date: 3,
      ordered: 4,
      size: 5,
      cut: 6,
      delivered: 7,
      left: 8,
      ship: 9,
      shipDate: 9 + n,
      note: 10 + n,
      cutDone: 11 + n,
      sewingStart: 12 + n,
      sewers: 13 + n,
      due: 14 + n,
      sewn: 15 + n,
      sewnDate: 15 + 2 * n,
    };
    const ws = workbook.addWorksheet(sheetName(customer, taken), {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    // Printed the way the workshop sends it: one page wide, headers repeated.
    ws.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:2",
    };
    const letter = (c: number) => ws.getColumn(c).letter;
    const widths: [number, number][] = [
      [col.image, 20.6],
      [col.name, 24.8],
      [col.date, 10.6],
      [col.ordered, 10.2],
      [col.size, 9],
      [col.cut, 10.5],
      [col.delivered, 10.5],
      [col.left, 9],
      [col.shipDate, 11],
      [col.note, 22],
      [col.cutDone, 11.1],
      [col.sewingStart, 11.1],
      [col.sewers, 16],
      [col.due, 11.1],
      [col.sewnDate, 11],
    ];
    for (const [c, width] of widths) ws.getColumn(c).width = width;
    for (let i = 0; i < n; i++) {
      ws.getColumn(col.ship + i).width = 6.5;
      ws.getColumn(col.sewn + i).width = 6.5;
    }
    // Two header rows, merged the way the sheet has them.
    const head = (r: number, c: number, text: string, r2 = r, c2 = c) => {
      if (r2 !== r || c2 !== c) ws.mergeCells(r, c, r2, c2);
      ws.getCell(r, c).value = text;
    };
    head(1, col.image, "HÌNH SẢN PHẨM", 2, col.image);
    head(1, col.name, "TÊN SẢN PHẨM GHI BILL", 2, col.name);
    head(1, col.date, "NGÀY NHẬN ĐƠN", 2, col.date);
    head(1, col.ordered, "ĐƠN HÀNG", 1, col.left);
    head(2, col.ordered, "SL KHÁCH ĐẶT");
    head(2, col.size, "SIZE");
    head(2, col.cut, "SỐ LƯỢNG CẮT THỰC TẾ");
    head(2, col.delivered, "TỔNG SỐ LƯỢNG ĐÃ GIAO");
    head(2, col.left, "CÒN LẠI");
    head(1, col.ship, "SỐ LƯỢNG GIAO KHÁCH", 1, col.ship + n - 1);
    head(1, col.shipDate, "NGÀY GIAO", 2, col.shipDate);
    head(1, col.note, "GHI CHÚ", 2, col.note);
    head(1, col.cutDone, "Ngày cắt xong", 2, col.cutDone);
    head(1, col.sewingStart, "Ngày giao thợ", 2, col.sewingStart);
    head(1, col.sewers, "Nhóm gia công", 2, col.sewers);
    head(1, col.due, "Ngày dự kiến xong", 2, col.due);
    head(1, col.sewn, "SỐ LƯỢNG NHÓM GIA CÔNG GIAO", 1, col.sewnDate);
    sizes.forEach((s, i) => {
      head(2, col.ship + i, s);
      head(2, col.sewn + i, s);
    });
    head(2, col.sewnDate, "NGÀY GIAO");
    for (const r of [1, 2]) {
      ws.getRow(r).height = r === 1 ? 24 : 36;
      for (let c = 1; c <= col.sewnDate; c++) {
        const cell = ws.getCell(r, c);
        cell.font = HEAD;
        cell.alignment = CENTER;
        cell.border = THIN;
      }
    }

    let row = 3;
    for (const order of mine) {
      const colors = [...new Set(order.variants.map((v) => v.color))];
      for (const color of colors) {
        const variants = order.variants
          .filter((v) => v.color === color)
          .sort((a, b) => bySize(a.size, b.size));
        const pick = (lines: TrackingLine[]) =>
          Object.fromEntries(
            lines
              .filter((l) => l.color === color)
              .map((l) => [l.size, l.quantity]),
          ) as Record<string, number>;
        const deliveries = order.deliveries
          .map((d) => ({ date: d.date, qty: pick(d.items) }))
          .filter((d) => Object.keys(d.qty).length);
        // Pieces counted as delivered with no delivery record still have to add up.
        const unrecorded: Record<string, number> = {};
        for (const v of variants) {
          const gap =
            v.delivered_qty -
            deliveries.reduce((sum, d) => sum + (d.qty[v.size] || 0), 0);
          if (gap > 0) unrecorded[v.size] = gap;
        }
        if (Object.keys(unrecorded).length)
          deliveries.unshift({ date: "", qty: unrecorded });
        const sewing = order.sewing
          .map((d) => ({ date: d.date, qty: pick(d.items) }))
          .filter((d) => Object.keys(d.qty).length);
        const height = Math.max(
          variants.length + 1,
          deliveries.length,
          sewing.length,
          5,
        );
        const r0 = row;
        const r1 = row + height - 1;
        const range = (c: number) => `${letter(c)}${r0}:${letter(c)}${r1}`;
        for (let r = r0; r <= r1; r++) {
          ws.getRow(r).height = ROW_HEIGHT;
          for (let c = 1; c <= col.sewnDate; c++) {
            const cell = ws.getCell(r, c);
            cell.font = BODY;
            cell.alignment = CENTER;
            cell.border = HAIR;
            if (order.completed) cell.fill = DONE_FILL;
          }
        }
        for (const c of [
          col.image,
          col.name,
          col.date,
          col.note,
          col.cutDone,
          col.sewingStart,
          col.sewers,
          col.due,
        ])
          ws.mergeCells(r0, c, r1, c);
        ws.getCell(r0, col.name).value =
          `${order.product_name}${colors.length > 1 ? ` — ${color}` : ""}\n(${order.id})`;
        ws.getCell(r0, col.name).font = { ...BODY, bold: true };
        const dated = (c: number, iso?: string) => {
          const value = asDate(iso);
          if (!value) return;
          ws.getCell(r0, c).value = value;
          ws.getCell(r0, c).numFmt = "dd/mm/yyyy";
        };
        dated(col.date, order.order_date);
        dated(col.cutDone, order.cutDone);
        dated(col.sewingStart, order.sewingStart);
        dated(col.due, order.deadline);
        ws.getCell(r0, col.sewers).value = order.sewers.join(", ");
        ws.getCell(r0, col.note).value = [
          order.completed && !/hoàn thành/i.test(order.notes)
            ? "HOÀN THÀNH"
            : "",
          order.notes,
        ]
          .filter(Boolean)
          .join("\n");
        ws.getCell(r0, col.note).alignment = { ...CENTER, horizontal: "left" };

        variants.forEach((v, i) => {
          const r = r0 + i;
          const at = sizes.indexOf(v.size);
          ws.getCell(r, col.ordered).value = v.quantity;
          ws.getCell(r, col.size).value = v.size;
          if (v.cut_qty) ws.getCell(r, col.cut).value = v.cut_qty;
          ws.getCell(r, col.delivered).value = {
            formula: `SUM(${range(col.ship + at)})`,
            result: v.delivered_qty,
          };
          ws.getCell(r, col.left).value = {
            formula: `${letter(col.ordered)}${r}-${letter(col.delivered)}${r}`,
            result: v.quantity - v.delivered_qty,
          };
        });
        const totalRow = r0 + variants.length;
        const first = r0;
        const last = totalRow - 1;
        const total = (c: number, result: number) => {
          ws.getCell(totalRow, c).value = {
            formula: `SUM(${letter(c)}${first}:${letter(c)}${last})`,
            result,
          };
          ws.getCell(totalRow, c).font = { ...BODY, bold: true };
        };
        ws.getCell(totalRow, col.size).value = "TỔNG";
        ws.getCell(totalRow, col.size).font = { ...BODY, bold: true };
        const sum = (key: "quantity" | "cut_qty" | "delivered_qty") =>
          variants.reduce((s, v) => s + v[key], 0);
        total(col.ordered, sum("quantity"));
        if (sum("cut_qty")) total(col.cut, sum("cut_qty"));
        total(col.delivered, sum("delivered_qty"));
        total(col.left, sum("quantity") - sum("delivered_qty"));
        for (let r = r0; r <= totalRow; r++)
          ws.getCell(r, col.left).font = {
            ...BODY,
            bold: r === totalRow,
            color: { argb: "FFFF0000" },
          };

        const lines = (
          rows: { date: string; qty: Record<string, number> }[],
          start: number,
          dateColumn: number,
        ) =>
          rows.forEach((d, i) => {
            const r = r0 + i;
            for (const [size, quantity] of Object.entries(d.qty))
              ws.getCell(r, start + sizes.indexOf(size)).value = quantity;
            const value = asDate(d.date);
            if (value) {
              ws.getCell(r, dateColumn).value = value;
              ws.getCell(r, dateColumn).numFmt = "dd/mm/yyyy";
            } else ws.getCell(r, dateColumn).value = "Trước đây";
          });
        lines(deliveries, col.ship, col.shipDate);
        lines(sewing, col.sewn, col.sewnDate);

        if (order.image) {
          const box = {
            width: IMAGE_COLUMN_PX - 8,
            height: height * ROW_PX - 8,
          };
          const scale = Math.min(
            box.width / order.image.width,
            box.height / order.image.height,
          );
          const width = Math.round(order.image.width * scale);
          const heightPx = Math.round(order.image.height * scale);
          const top = (height * ROW_PX - heightPx) / 2;
          ws.addImage(
            workbook.addImage({
              // exceljs types predate Node's generic Buffer
              buffer: order.image.buffer as unknown as ExcelJS.Buffer,
              extension: "jpeg",
            }),
            {
              // Native offsets (EMU) centre the picture in its cell; fractional columns do not,
              // because they are measured against the default column width.
              tl: {
                nativeCol: 0,
                nativeColOff: Math.round(((IMAGE_COLUMN_PX - width) / 2) * EMU),
                nativeRow: r0 - 1 + Math.floor(top / ROW_PX),
                nativeRowOff: Math.round((top % ROW_PX) * EMU),
              } as unknown as ExcelJS.Anchor,
              ext: { width, height: heightPx },
              editAs: "oneCell",
            },
          );
        }
        row = r1 + 1;
      }
    }
  }
  if (!customers.length) workbook.addWorksheet("Chưa có đơn");
  return workbook;
}

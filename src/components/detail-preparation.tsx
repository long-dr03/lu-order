"use client";
import { useRef, useState } from "react";
import { Check, Plus, Pencil, X, Camera, Paperclip } from "lucide-react";
import { type Api, day, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { departmentFor } from "@/lib/departments";
import { type Employee } from "@/lib/types";
import {
  type MeasureUnit,
  DEFAULT_TOLERANCE,
  MEASURE_STEP,
  UNIT_LABELS,
  formatDeviation,
  formatMeasure,
  parseMeasure,
  parsePomPaste,
  withinTolerance,
} from "@/lib/measure";
import { Action, Field, ErrorNotice } from "./Primitives";
import {
  ProductPhoto,
  fitProductPhoto,
  uploadCheckFile,
  uploadProductImage,
} from "./ProductImage";
import { Detail } from "./order-detail-shared";

export const PREPARATION_CHECKS = [
  { key: "kiem_npl", stage: "Kiểm NPL/Vải" },
  { key: "kiem_rap", stage: "Kiểm rập" },
] as const;

export const NPL_RESULTS = {
  dat: "Đạt",
  dat_co_ghi_chu: "Đạt, có ghi chú",
  khong_dat: "Không đạt",
} as const;

export const PATTERN_RESULTS = {
  dat: "Duyệt rập",
  dat_co_ghi_chu: "Duyệt, có chỉnh sửa",
  khong_dat: "Chưa duyệt, làm lại rập",
} as const;

export const CHECK_FILE_TYPES = ["pdf", "xlsx", "xls", "docx", "doc"];

export const formatBytes = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
/** Returns a message when the file cannot be attached, otherwise null. */

export function checkFileProblem(file: File) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!CHECK_FILE_TYPES.includes(extension))
    return `"${file.name}": chỉ nhận file PDF, Excel (xlsx, xls) hoặc Word (docx, doc).`;
  if (file.size > 10 * 1024 * 1024) return `"${file.name}" lớn hơn 10 MB.`;
  return null;
}

export const PATTERN_PHASES = {
  rap_thu: "Rập thử",
  fit: "Mẫu fit",
  pps: "PPS (trước sản xuất)",
  bulk: "Hàng đại trà",
} as const;

export const phaseLabel = (phase: string) =>
  PATTERN_PHASES[phase as keyof typeof PATTERN_PHASES] || "";

export type CheckRecord = NonNullable<Detail["checks"]>[number];
/** Common measurement points so nobody types them again for every order. */

export const SPEC_TEMPLATES: Record<string, string[]> = {
  Áo: [
    "Dài áo",
    "Rộng vai",
    "Vòng ngực",
    "Vòng eo",
    "Dài tay",
    "Bắp tay",
    "Cửa tay",
  ],
  "Váy / đầm": [
    "Dài váy",
    "Rộng vai",
    "Vòng ngực",
    "Vòng eo",
    "Vòng mông",
    "Dài tay",
  ],
  Quần: [
    "Dài quần",
    "Vòng eo",
    "Vòng mông",
    "Đáy trước",
    "Đáy sau",
    "Rộng ống",
  ],
};

export type MeasureRow = {
  key: string;
  code: string;
  point: string;
  size: string;
  spec: string;
  actual: string;
  tolerance: string;
  /** Point, size and standard come from the POM chart or the previous round; only the measured value is typed. */
  fixed: boolean;
};

export const newRow = (unit: MeasureUnit = "cm"): MeasureRow => ({
  key: crypto.randomUUID(),
  code: "",
  point: "",
  size: "",
  spec: "",
  actual: "",
  tolerance: formatMeasure(DEFAULT_TOLERANCE[unit], unit),
  fixed: false,
});

export const rowState = (r: MeasureRow, unit: MeasureUnit) => {
  const spec = parseMeasure(r.spec);
  const actual = parseMeasure(r.actual);
  if (spec === null || actual === null) return "empty";
  return withinTolerance(
    spec,
    actual,
    parseMeasure(r.tolerance) ?? DEFAULT_TOLERANCE[unit],
  )
    ? "ok"
    : "out";
};

export const rowKey = (point: string, size: string) => `${point}|${size}`;

export function PreparationCheck({
  stage,
  order,
  session,
  api,
  employees,
  onChanged,
}: {
  stage: (typeof PREPARATION_CHECKS)[number]["stage"];
  order: Detail;
  session: SessionInfo;
  api: Api;
  employees: Employee[];
  onChanged: () => Promise<void>;
}) {
  const check = PREPARATION_CHECKS.find((c) => c.stage === stage)!;
  return (
    <section className="prep-checks">
      <p className="muted desktop-hint">
        Ghi kết quả kiểm để giữ lịch sử. Kết quả không chặn việc cắt; quản lý
        vẫn bấm Hoàn tất chuẩn bị khi sẵn sàng.
      </p>
      {check.key === "kiem_rap" && (
        <PatternSpecSheet
          order={order}
          session={session}
          api={api}
          onChanged={onChanged}
        />
      )}
      <PreparationCard
        order={order}
        session={session}
        stage={check.stage}
        storedKey={check.key}
        allowed={permits(session.user, "production.create", {
          stage: check.stage,
        })}
        employees={employees}
        api={api}
        onChanged={onChanged}
      />
    </section>
  );
}

export type EditablePom = {
  key: string;
  code: string;
  point: string;
  tolerance: string;
  values: Record<string, string>;
};

export const splitSizes = (text: string) => [
  ...new Set(
    text
      .split(/[,;]+|\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
/** POM chart for the order (points × sizes), declared once from the tech pack and reused by every round. */

export function PatternSpecSheet({
  order,
  session,
  api,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const sheet = order.pattern_sheet;
  const allowed =
    permits(session.user, "orders.edit", { stage: "nhan_don" }) ||
    permits(session.user, "production.create", { stage: "Kiểm rập" });
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<MeasureUnit>("inch");
  const [sizesText, setSizesText] = useState("");
  const [base, setBase] = useState("");
  const [poms, setPoms] = useState<EditablePom[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sizes = splitSizes(sizesText);
  const blankPom = (point = ""): EditablePom => ({
    key: crypto.randomUUID(),
    code: "",
    point,
    tolerance: "",
    values: {},
  });
  const update = (key: string, patch: Partial<EditablePom>) =>
    setPoms((old) => old.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  function start() {
    const u = sheet?.unit || "inch";
    setUnit(u);
    setSizesText(
      (sheet?.sizes.length ? sheet.sizes : ["S", "M", "L", "XL"]).join(", "),
    );
    setBase(sheet?.base_size || "");
    setPoms(
      sheet?.poms.length
        ? sheet.poms.map((p) => ({
            key: crypto.randomUUID(),
            code: p.code,
            point: p.point,
            tolerance: formatMeasure(p.tolerance, u),
            values: Object.fromEntries(
              Object.entries(p.values).map(([size, v]) => [
                size,
                formatMeasure(v, u),
              ]),
            ),
          }))
        : [blankPom()],
    );
    setPaste("");
    setError("");
    setEditing(true);
  }
  function applyPaste() {
    const parsed = parsePomPaste(paste, sizes);
    if (!parsed.rows.length) {
      setError(
        "Không đọc được dòng nào. Copy các cột Mã POM, Điểm đo, Dung sai và các cột size từ Excel rồi dán lại.",
      );
      return;
    }
    if (parsed.sizes.join(",") !== sizes.join(","))
      setSizesText(parsed.sizes.join(", "));
    if (parsed.baseSize) setBase(parsed.baseSize);
    setPoms((old) => [
      ...old.filter(
        (p) => p.point.trim() && !parsed.rows.some((r) => r.point === p.point),
      ),
      ...parsed.rows.map((r) => ({
        key: crypto.randomUUID(),
        code: r.code,
        point: r.point,
        tolerance: r.tolerance === null ? "" : formatMeasure(r.tolerance, unit),
        values: Object.fromEntries(
          Object.entries(r.values).map(([size, v]) => [
            size,
            formatMeasure(v, unit),
          ]),
        ),
      })),
    ]);
    setPaste("");
    setError("");
  }
  async function save() {
    setError("");
    const rows = poms.filter((p) => p.point.trim());
    const unreadable: string[] = [];
    const payload = rows.map((p) => {
      const tolerance = p.tolerance.trim()
        ? parseMeasure(p.tolerance)
        : DEFAULT_TOLERANCE[unit];
      if (tolerance === null) unreadable.push(`${p.point} (dung sai)`);
      const values: Record<string, number> = {};
      for (const size of sizes) {
        const raw = (p.values[size] || "").trim();
        if (!raw) continue;
        const value = parseMeasure(raw);
        if (value === null) unreadable.push(`${p.point} size ${size}`);
        else values[size] = value;
      }
      return {
        code: p.code.trim(),
        point: p.point.trim(),
        tolerance: tolerance ?? 0,
        values,
      };
    });
    if (unreadable.length) {
      setError(`Không đọc được số ở: ${unreadable.slice(0, 5).join(", ")}.`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/pattern-specs`, {
        unit,
        sizes,
        base_size: sizes.includes(base) ? base : "",
        poms: payload,
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="prep-card">
      <h4>Bảng thông số rập (POM)</h4>
      {!editing &&
        (sheet?.poms.length ? (
          <details className="prep-more">
            <summary>
              {sheet.poms.length} điểm đo · size {sheet.sizes.join(", ")} ·{" "}
              {UNIT_LABELS[sheet.unit]}
              {sheet.base_size ? ` · size gốc ${sheet.base_size}` : ""}
            </summary>
            <div className="table-scroll">
              <table className="prep-measures pom-table">
                <thead>
                  <tr>
                    <th>POM</th>
                    <th>Điểm đo</th>
                    <th>±</th>
                    {sheet.sizes.map((size) => (
                      <th
                        key={size}
                        className={
                          size === sheet.base_size ? "base" : undefined
                        }
                      >
                        {size}
                        {size === sheet.base_size ? " (gốc)" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.poms.map((p) => (
                    <tr key={p.point}>
                      <td>{p.code}</td>
                      <td>{p.point}</td>
                      <td>{formatMeasure(p.tolerance, sheet.unit)}</td>
                      {sheet.sizes.map((size) => (
                        <td
                          key={size}
                          className={
                            size === sheet.base_size ? "base" : undefined
                          }
                        >
                          {formatMeasure(p.values[size], sheet.unit)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : (
          <p className="muted desktop-hint">
            Chưa khai báo. Dán bảng POM từ tech pack (Excel) một lần để khi kiểm
            chỉ cần nhập số đo.
          </p>
        ))}
      {allowed && !editing && (
        <Action type="button" tone="secondary" onClick={start}>
          {sheet?.poms.length ? "Sửa bảng thông số" : "Khai báo bảng thông số"}
        </Action>
      )}
      {editing && (
        <div className="stack">
          <ErrorNotice error={error} />
          <div className="form-grid">
            <Field label="Đơn vị">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MeasureUnit)}
              >
                <option value="inch">inch (28 1/4, 3/8…)</option>
                <option value="cm">cm</option>
              </select>
            </Field>
            <Field label="Các size (cách nhau dấu phẩy)">
              <input
                value={sizesText}
                onChange={(e) => setSizesText(e.target.value)}
                placeholder="S, M, L, XL, XXL"
              />
            </Field>
            <Field label="Size gốc (base)">
              <select value={base} onChange={(e) => setBase(e.target.value)}>
                <option value="">Chưa chọn</option>
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Thêm điểm đo theo mẫu">
              <select
                value=""
                onChange={(e) => {
                  const points = SPEC_TEMPLATES[e.target.value] || [];
                  setPoms((old) => [
                    ...old.filter((p) => p.point.trim()),
                    ...points
                      .filter((point) => !old.some((p) => p.point === point))
                      .map((point) => blankPom(point)),
                  ]);
                }}
              >
                <option value="">Chọn mẫu…</option>
                {Object.keys(SPEC_TEMPLATES).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <details className="prep-more" open={!sheet?.poms.length}>
            <summary>Dán bảng từ Excel / tech pack</summary>
            <div className="stack">
              <textarea
                rows={4}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={
                  "Copy các cột POM, Điểm đo, Dung sai, S, M, L … từ Excel (có thể kèm dòng tiêu đề) rồi dán vào đây. Dùng dấu | để ngăn cột cũng được."
                }
              />
              <Action
                type="button"
                tone="secondary"
                disabled={!paste.trim()}
                onClick={applyPaste}
              >
                Đọc bảng đã dán
              </Action>
            </div>
          </details>
          <div className="table-scroll">
            <table className="pom-editor">
              <thead>
                <tr>
                  <th>POM</th>
                  <th>Điểm đo</th>
                  <th>±</th>
                  {sizes.map((size) => (
                    <th
                      key={size}
                      className={size === base ? "base" : undefined}
                    >
                      {size}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {poms.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <input
                        aria-label="Mã POM"
                        className="pom-code"
                        value={p.code}
                        onChange={(e) =>
                          update(p.key, { code: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Điểm đo"
                        className="pom-point"
                        value={p.point}
                        onChange={(e) =>
                          update(p.key, { point: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Dung sai ${p.point}`}
                        className="pom-value"
                        placeholder={formatMeasure(
                          DEFAULT_TOLERANCE[unit],
                          unit,
                        )}
                        value={p.tolerance}
                        onChange={(e) =>
                          update(p.key, { tolerance: e.target.value })
                        }
                      />
                    </td>
                    {sizes.map((size) => (
                      <td
                        key={size}
                        className={size === base ? "base" : undefined}
                      >
                        <input
                          aria-label={`${p.point} size ${size}`}
                          className="pom-value"
                          value={p.values[size] || ""}
                          onChange={(e) =>
                            update(p.key, {
                              values: { ...p.values, [size]: e.target.value },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Xoá ${p.point || "dòng"}`}
                        onClick={() =>
                          setPoms((old) => old.filter((x) => x.key !== p.key))
                        }
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Nhập kiểu {unit === "inch" ? "28 1/4, 3/8 hoặc 28.25" : "70,5"}. Bỏ
            trống ô size không có thông số.
          </p>
          <div className="inline-actions">
            <Action
              type="button"
              tone="secondary"
              onClick={() => setPoms((old) => [...old, blankPom()])}
            >
              <Plus size={16} />
              Thêm điểm đo
            </Action>
            <Action type="button" busy={busy} onClick={() => void save()}>
              Lưu bảng thông số
            </Action>
            <Action
              type="button"
              tone="secondary"
              onClick={() => setEditing(false)}
            >
              Hủy
            </Action>
          </div>
        </div>
      )}
    </article>
  );
}
/** Every measured round side by side, one table per size: standard, then each round with its deviation. */

export function PatternCompare({ checks }: { checks: CheckRecord[] }) {
  const rounds = checks
    .map((check, index) => ({ check, round: index + 1 }))
    .filter(({ check }) => check.mode !== "text" && check.measurements.length);
  if (!rounds.length) return null;
  const sizes = [
    ...new Set(
      rounds.flatMap(({ check }) => check.measurements.map((m) => m.size)),
    ),
  ];
  return (
    <details className="prep-more prep-compare" open={rounds.length > 1}>
      <summary>
        So sánh các lượt đo ({rounds.length} lượt, {sizes.length} size)
      </summary>
      {sizes.map((size) => {
        const points: { code: string; point: string }[] = [];
        for (const { check } of rounds)
          for (const m of check.measurements)
            if (m.size === size && !points.some((p) => p.point === m.point))
              points.push({ code: m.code || "", point: m.point });
        return (
          <div className="stack" key={size || "all"}>
            {size && <strong className="measure-size">Size {size}</strong>}
            <div className="table-scroll">
              <table className="prep-measures compare-table">
                <thead>
                  <tr>
                    <th>POM</th>
                    <th>Điểm đo</th>
                    <th>Chuẩn</th>
                    {rounds.map(({ check, round }) => (
                      <th key={check.id}>
                        Lượt {round}
                        {phaseLabel(check.phase) ? (
                          <small>{phaseLabel(check.phase)}</small>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => {
                    // The standard shown is the one from the most recent round that measured this point.
                    const standard = [...rounds]
                      .reverse()
                      .map(({ check }) => ({
                        check,
                        m: check.measurements.find(
                          (x) => x.point === p.point && x.size === size,
                        ),
                      }))
                      .find((x) => x.m);
                    return (
                      <tr key={p.point}>
                        <td>{p.code}</td>
                        <td>{p.point}</td>
                        <td>
                          {standard?.m
                            ? formatMeasure(
                                standard.m.spec,
                                standard.check.unit,
                              )
                            : ""}
                        </td>
                        {rounds.map(({ check }) => {
                          const m = check.measurements.find(
                            (x) => x.point === p.point && x.size === size,
                          );
                          if (!m)
                            return (
                              <td key={check.id} className="empty">
                                –
                              </td>
                            );
                          const off = !withinTolerance(
                            m.spec,
                            m.actual,
                            m.tolerance,
                          );
                          return (
                            <td
                              key={check.id}
                              className={off ? "out" : undefined}
                            >
                              {formatMeasure(m.actual, check.unit)}
                              <small>
                                {formatDeviation(m.actual - m.spec, check.unit)}
                                {off ? " ✕" : ""}
                              </small>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </details>
  );
}

export function PreparationCard({
  order,
  session,
  stage,
  storedKey,
  allowed,
  employees,
  api,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  stage: string;
  storedKey: string;
  allowed: boolean;
  employees: Employee[];
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const isPattern = storedKey === "kiem_rap";
  const results = isPattern ? PATTERN_RESULTS : NPL_RESULTS;
  const checks = (order.checks || []).filter((c) => c.stage === storedKey);
  const last = checks[checks.length - 1];
  const sheet =
    isPattern && order.pattern_sheet?.poms.length ? order.pattern_sheet : null;
  const unit: MeasureUnit = sheet?.unit || last?.unit || "cm";
  const checkers = employees.filter(
    (e) => e.active !== 0 && e.department_ids?.includes(departmentFor(stage)),
  );
  const approvers = employees.filter(
    (e) => e.active !== 0 && e.department_ids?.includes("management"),
  );
  const me = checkers.some((e) => e.id === session.user.employee_id)
    ? session.user.employee_id || ""
    : "";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sizesOn, setSizesOn] = useState<string[]>([]);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [carried, setCarried] = useState<MeasureRow[]>([]);
  const [extra, setExtra] = useState<MeasureRow[]>([]);
  const [chosenResult, setChosenResult] = useState<string | null>(null);
  // Photo / file confirmations must say which points were checked on the paper.
  // Three ways to confirm: type it on the web (measure or written), a photo of the filled sheet, or an attached file.
  const [channel, setChannel] = useState<"web" | "photo" | "file">("web");
  const [webMode, setWebMode] = useState<"measure" | "text">("measure");
  const mode = channel === "web" ? webMode : channel;
  const [phase, setPhase] = useState<string>("");
  const measureMode = isPattern && mode === "measure";
  const textMode = isPattern && mode === "text";
  const photoMode = isPattern && mode === "photo";
  const fileMode = isPattern && mode === "file";
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<
    { key: string; file: File; preview: string }[]
  >([]);
  const camera = useRef<HTMLInputElement>(null);
  // Fixed rows: the POM chart for the chosen sizes, or the points of the previous round.
  const fixedRows: MeasureRow[] = sheet
    ? sizesOn.flatMap((size) =>
        sheet.poms
          .filter((p) => p.values[size] !== undefined)
          .map((p) => ({
            key: rowKey(p.point, size),
            code: p.code,
            point: p.point,
            size,
            spec: formatMeasure(p.values[size], unit),
            actual: actuals[rowKey(p.point, size)] || "",
            tolerance: formatMeasure(p.tolerance, unit),
            fixed: true,
          })),
      )
    : carried.map((r) => ({ ...r, actual: actuals[r.key] || "" }));
  const rows = [...fixedRows, ...extra];
  const out = !measureMode
    ? 0
    : rows.filter((r) => rowState(r, unit) === "out").length;
  const measured = rows.filter((r) => rowState(r, unit) !== "empty").length;
  const pending = fixedRows.filter((r) => !r.actual).length;
  // Suggest the result from the measurements until the checker picks one.
  const attachmentMode = photoMode || fileMode;
  const result =
    chosenResult ??
    (attachmentMode ? "" : isPattern && out > 0 ? "dat_co_ghi_chu" : "dat");
  const setActual = (key: string, value: string) =>
    setActuals((old) => ({ ...old, [key]: value }));
  const step = (r: MeasureRow, direction: 1 | -1) => {
    const current = parseMeasure(r.actual) ?? parseMeasure(r.spec) ?? 0;
    setActual(
      r.key,
      formatMeasure(
        Math.max(0, current + direction * MEASURE_STEP[unit]),
        unit,
      ),
    );
  };
  const updateExtra = (key: string, patch: Partial<MeasureRow>) =>
    setExtra((old) => old.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  async function addShots(files: FileList | null) {
    setError("");
    const added: { key: string; file: File; preview: string }[] = [];
    try {
      for (const file of Array.from(files || []).slice(0, 6 - shots.length)) {
        const fitted = await fitProductPhoto(file);
        added.push({
          key: crypto.randomUUID(),
          file: fitted,
          preview: URL.createObjectURL(fitted),
        });
      }
    } catch (err) {
      setError(message(err));
    } finally {
      if (added.length) setShots((old) => [...old, ...added]);
    }
  }
  function start(forced?: "web" | "photo" | "file") {
    setSizesOn(
      sheet ? [sheet.base_size || sheet.sizes[0]].filter(Boolean) : [],
    );
    setActuals({});
    const fromLast = (last?.measurements || []).map((m) => ({
      ...newRow(unit),
      key: rowKey(m.point, m.size),
      code: m.code || "",
      point: m.point,
      size: m.size,
      spec: formatMeasure(m.spec, last?.unit || "cm"),
      tolerance: formatMeasure(m.tolerance, last?.unit || "cm"),
      fixed: true,
    }));
    setCarried(sheet ? [] : fromLast);
    setExtra(isPattern && !sheet && !fromLast.length ? [newRow(unit)] : []);
    setChosenResult(null);
    // Keep the way this order was checked last time; without a POM chart a written assessment is quicker.
    const lastMode = last?.mode;
    setChannel(
      forced ??
        (lastMode === "photo" ? "photo" : lastMode === "file" ? "file" : "web"),
    );
    setWebMode(
      lastMode === "text" || lastMode === "measure"
        ? lastMode
        : sheet || fromLast.length
          ? "measure"
          : "text",
    );
    setAttachments([]);
    // The next round usually continues from the stage of the previous one.
    setPhase(last?.phase || "rap_thu");
    setShots([]);
    setError("");
    setOpen(true);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const optionalNumber = (name: string) =>
      f.get(name) === "" || f.get(name) === null ? null : Number(f.get(name));
    const measurements = rows.flatMap((r) => {
      const spec = parseMeasure(r.spec);
      const actual = parseMeasure(r.actual);
      if (!r.point.trim() || spec === null || actual === null) return [];
      return [
        {
          ...(r.code ? { code: r.code } : {}),
          point: r.point.trim(),
          size: r.size.trim(),
          spec,
          actual,
          tolerance: parseMeasure(r.tolerance) ?? DEFAULT_TOLERANCE[unit],
        },
      ];
    });
    if (photoMode && !shots.length) {
      setError("Chọn hoặc chụp ít nhất một ảnh bảng đo đã điền.");
      return;
    }
    if (fileMode && !attachments.length) {
      setError("Chọn ít nhất một file để đính kèm.");
      return;
    }
    if (attachmentMode) {
      if (!result) {
        setError("Chọn kết quả duyệt trước khi lưu.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const photos: string[] = [];
      for (const shot of shots)
        photos.push(await uploadProductImage(shot.file, session));
      const files = fileMode
        ? await Promise.all(
            attachments.map((file) => uploadCheckFile(file, session)),
          )
        : [];
      await api(`/api/orders/${encodeURIComponent(order.id)}/checks`, {
        stage,
        result,
        photos,
        unit,
        mode: isPattern ? mode : "measure",
        files,
        phase: isPattern ? phase : "",
        defect_qty: isPattern ? 0 : Number(f.get("defect_qty") || 0),
        notes: String(f.get("notes") || "").trim(),
        pattern_version: isPattern
          ? String(f.get("pattern_version") || "")
          : "",
        sizes_checked: !isPattern
          ? ""
          : sheet && measureMode
            ? sizesOn.join(", ")
            : String(f.get("sizes_checked") || ""),
        pieces_expected: isPattern ? optionalNumber("pieces_expected") : null,
        pieces_received: isPattern ? optionalNumber("pieces_received") : null,
        measurements: measureMode ? measurements : [],
        checked_by: String(f.get("checked_by") || "") || null,
        approved_by: isPattern
          ? String(f.get("approved_by") || "") || null
          : null,
        checked_on: f.get("checked_on"),
      });
      setOpen(false);
      shots.forEach((shot) => URL.revokeObjectURL(shot.preview));
      setShots([]);
      setAttachments([]);
      await onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const bySize = sheet
    ? sizesOn.map((size) => ({
        size,
        rows: fixedRows.filter((r) => r.size === size),
      }))
    : [{ size: "", rows: fixedRows }];
  return (
    <article className="prep-card">
      <h4>{stage}</h4>
      {isPattern && <PatternCompare checks={checks} />}
      {checks.length ? (
        <div className="prep-history">
          {checks
            .map((check, index) => ({ check, round: index + 1 }))
            .reverse()
            .map(({ check, round }) => (
              <details
                key={check.id}
                className="prep-round"
                open={round === checks.length}
              >
                <summary>
                  <strong>Lượt {round}</strong>
                  {phaseLabel(check.phase)
                    ? ` · ${phaseLabel(check.phase)}`
                    : ""}{" "}
                  · {results[check.result]} ·{" "}
                  {check.checked_on.split("-").reverse().join("/")}
                  {!isPattern
                    ? ` · Số lỗi: ${check.defect_qty}`
                    : check.mode === "text"
                      ? " · Đánh giá bằng chữ"
                      : check.mode === "photo"
                        ? ` · Ảnh chụp bảng đo${check.total_points ? ` · Đã kiểm ${check.checked_points}/${check.total_points} điểm` : ""}`
                        : check.mode === "file"
                          ? ` · File đính kèm${check.total_points ? ` · Đã kiểm ${check.checked_points}/${check.total_points} điểm` : ""}`
                          : ` · Vượt dung sai: ${check.defect_qty}`}
                </summary>
                <dl>
                  {isPattern && (
                    <>
                      <dt>Phiên bản rập</dt>
                      <dd>{check.pattern_version || "Chưa ghi"}</dd>
                      <dt>Size đã kiểm</dt>
                      <dd>{check.sizes_checked || "Chưa ghi"}</dd>
                      {check.pieces_expected !== null && (
                        <>
                          <dt>Mảnh rập</dt>
                          <dd>
                            {check.pieces_received ?? "?"}/
                            {check.pieces_expected}
                          </dd>
                        </>
                      )}
                    </>
                  )}
                  <dt>Người kiểm</dt>
                  <dd>{check.checked_by_name || "Chưa ghi"}</dd>
                  {isPattern && (
                    <>
                      <dt>Người duyệt</dt>
                      <dd>{check.approved_by_name || "Chưa ghi"}</dd>
                    </>
                  )}
                  {check.notes && (
                    <>
                      <dt>{check.mode === "text" ? "Đánh giá" : "Ghi chú"}</dt>
                      <dd className="prep-note">{check.notes}</dd>
                    </>
                  )}
                </dl>
                {check.files.length > 0 && (
                  <ul className="prep-files">
                    {check.files.map((file) => (
                      <li key={file.url}>
                        <a href={file.url} download={file.name}>
                          {file.name}
                        </a>
                        <span className="muted">
                          {" "}
                          · {formatBytes(file.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {check.photos.length > 0 && (
                  <div className="prep-photos">
                    {check.photos.map((url, i) => (
                      <ProductPhoto
                        key={url}
                        url={url}
                        name={`${stage} · lượt ${round} · ảnh ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
                {isPattern && check.measurements.length > 0 && (
                  <div className="table-scroll">
                    <table className="prep-measures">
                      <thead>
                        <tr>
                          <th>POM</th>
                          <th>Điểm đo</th>
                          <th>Size</th>
                          <th>Chuẩn</th>
                          <th>Thực đo</th>
                          <th>Lệch ({UNIT_LABELS[check.unit]})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {check.measurements.map((m, i) => {
                          const off = !withinTolerance(
                            m.spec,
                            m.actual,
                            m.tolerance,
                          );
                          return (
                            <tr key={i} className={off ? "out" : undefined}>
                              <td>{m.code || ""}</td>
                              <td>{m.point}</td>
                              <td>{m.size}</td>
                              <td>{formatMeasure(m.spec, check.unit)}</td>
                              <td>{formatMeasure(m.actual, check.unit)}</td>
                              <td>
                                {formatDeviation(m.actual - m.spec, check.unit)}
                                {off ? " ✕" : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            ))}
        </div>
      ) : (
        <p className="muted">Chưa ghi kết quả kiểm.</p>
      )}
      {allowed && !open && !isPattern && (
        <Action type="button" onClick={() => start()}>
          {checks.length ? "Ghi lượt kiểm mới" : "Ghi kết quả"}
        </Action>
      )}
      {allowed && !open && isPattern && (
        <div className="stack">
          <span className="field-label">
            {checks.length ? "Ghi lượt kiểm mới bằng" : "Ghi kết quả bằng"}
          </span>
          <div className="confirm-choices">
            <Action type="button" onClick={() => start("web")}>
              <Pencil size={18} />
              Nhập trên web
            </Action>
            <Action
              type="button"
              tone="secondary"
              onClick={() => start("photo")}
            >
              <Camera size={18} />
              Ảnh chụp bảng đo
            </Action>
            <Action
              type="button"
              tone="secondary"
              onClick={() => start("file")}
            >
              <Paperclip size={18} />
              File đính kèm
            </Action>
          </div>
        </div>
      )}
      {allowed && open && (
        <form className="stack" onSubmit={submit}>
          <ErrorNotice error={error} />
          {isPattern && (
            <div className="stack">
              <span className="field-label">Cách xác nhận</span>
              <div
                className="segmented fit"
                role="group"
                aria-label="Cách xác nhận"
              >
                <button
                  type="button"
                  aria-pressed={channel === "web"}
                  onClick={() => setChannel("web")}
                >
                  Nhập trên web
                </button>
                <button
                  type="button"
                  aria-pressed={channel === "photo"}
                  onClick={() => setChannel("photo")}
                >
                  Ảnh chụp
                </button>
                <button
                  type="button"
                  aria-pressed={channel === "file"}
                  onClick={() => setChannel("file")}
                >
                  File đính kèm
                </button>
              </div>
              {channel === "web" && (
                <div
                  className="segmented fit"
                  role="group"
                  aria-label="Cách nhập"
                >
                  <button
                    type="button"
                    aria-pressed={webMode === "measure"}
                    onClick={() => setWebMode("measure")}
                  >
                    Đo theo bảng thông số
                  </button>
                  <button
                    type="button"
                    aria-pressed={webMode === "text"}
                    onClick={() => setWebMode("text")}
                  >
                    Đánh giá bằng chữ
                  </button>
                </div>
              )}
              {photoMode && (
                <p className="muted desktop-hint">
                  Chụp tờ bảng đo đã điền tay rồi xác nhận kết quả. Không cần
                  nhập số đo.
                </p>
              )}
              {fileMode && (
                <p className="muted desktop-hint">
                  Đính kèm file bảng đo đã điền (PDF, Excel, Word) rồi xác nhận
                  kết quả. Không cần nhập số đo.
                </p>
              )}
            </div>
          )}
          {isPattern && (
            <Field label="Giai đoạn kiểm">
              <select value={phase} onChange={(e) => setPhase(e.target.value)}>
                {Object.entries(PATTERN_PHASES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isPattern && (
            <div className="form-grid">
              <Field label="Phiên bản rập">
                <input
                  name="pattern_version"
                  maxLength={40}
                  placeholder="VD: Rev B"
                  defaultValue={last?.pattern_version || ""}
                />
              </Field>
              {(!sheet || !measureMode) && (
                <Field label="Size đã kiểm">
                  <input
                    name="sizes_checked"
                    maxLength={200}
                    placeholder="VD: M, L hoặc cả bộ"
                    defaultValue={last?.sizes_checked || ""}
                  />
                </Field>
              )}
            </div>
          )}
          {textMode && (
            <Field label="Nội dung đánh giá">
              <textarea
                name="notes"
                maxLength={2000}
                rows={5}
                required
                placeholder="VD: Rập đủ mảnh, đường may tay áo khớp; cổ lệch nhẹ, cần chỉnh lại đường cong cổ sau."
              />
            </Field>
          )}
          {sheet && measureMode && (
            <div className="stack">
              <span className="field-label">Size đang đo</span>
              <div className="size-chips">
                {sheet.sizes.map((size) => (
                  <button
                    type="button"
                    key={size}
                    aria-pressed={sizesOn.includes(size)}
                    onClick={() =>
                      setSizesOn((old) =>
                        old.includes(size)
                          ? old.filter((s) => s !== size)
                          : sheet.sizes.filter(
                              (s) => s === size || old.includes(s),
                            ),
                      )
                    }
                  >
                    {size}
                    {size === sheet.base_size ? " · gốc" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          {measureMode && (
            <fieldset className="prep-fieldset">
              <legend>Đo rập ({UNIT_LABELS[unit]})</legend>
              <div className="stack">
                {bySize.map((group) => (
                  <div className="stack" key={group.size || "rows"}>
                    {group.size && sheet && (
                      <strong className="measure-size">
                        Size {group.size}
                        {group.size === sheet.base_size ? " (gốc)" : ""}
                      </strong>
                    )}
                    {group.rows.map((r) => {
                      const state = rowState(r, unit);
                      const spec = parseMeasure(r.spec);
                      const actual = parseMeasure(r.actual);
                      return (
                        <div className={`measure-entry ${state}`} key={r.key}>
                          <div className="measure-label">
                            <strong>
                              {r.code ? `${r.code}. ` : ""}
                              {r.point}
                            </strong>
                            <span>
                              {!sheet && r.size ? `Size ${r.size} · ` : ""}
                              Chuẩn {r.spec} ±{r.tolerance}
                              {state !== "empty" &&
                              spec !== null &&
                              actual !== null
                                ? ` · lệch ${formatDeviation(actual - spec, unit)}`
                                : ""}
                            </span>
                          </div>
                          <div className="measure-input">
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Giảm ${formatMeasure(MEASURE_STEP[unit], unit)} ${r.point}`}
                              onClick={() => step(r, -1)}
                            >
                              −
                            </button>
                            <input
                              aria-label={`Số đo ${r.point}${r.size ? ` size ${r.size}` : ""}`}
                              inputMode={unit === "cm" ? "decimal" : "text"}
                              placeholder="Số đo"
                              value={r.actual}
                              onChange={(e) => setActual(r.key, e.target.value)}
                            />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Tăng ${formatMeasure(MEASURE_STEP[unit], unit)} ${r.point}`}
                              onClick={() => step(r, 1)}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="action secondary measure-ok"
                            aria-label={`${r.point}: đúng chuẩn ${r.spec}`}
                            onClick={() => setActual(r.key, r.spec)}
                          >
                            <Check size={16} />
                            <span className="label-long">Đúng chuẩn</span>
                            <span className="label-short">Đạt</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {extra.map((r) => (
                  <div className="measure-row" key={r.key}>
                    <input
                      aria-label="Điểm đo"
                      placeholder="Điểm đo (VD: dài áo)"
                      value={r.point}
                      onChange={(e) =>
                        updateExtra(r.key, { point: e.target.value })
                      }
                    />
                    <input
                      aria-label="Size"
                      placeholder="Size"
                      value={r.size}
                      onChange={(e) =>
                        updateExtra(r.key, { size: e.target.value })
                      }
                    />
                    <input
                      aria-label="Số chuẩn"
                      inputMode={unit === "cm" ? "decimal" : "text"}
                      placeholder="Chuẩn"
                      value={r.spec}
                      onChange={(e) =>
                        updateExtra(r.key, { spec: e.target.value })
                      }
                    />
                    <input
                      aria-label="Số thực đo"
                      inputMode={unit === "cm" ? "decimal" : "text"}
                      placeholder="Thực đo"
                      value={r.actual}
                      onChange={(e) =>
                        updateExtra(r.key, { actual: e.target.value })
                      }
                    />
                    <input
                      aria-label="Dung sai"
                      inputMode={unit === "cm" ? "decimal" : "text"}
                      placeholder="±"
                      value={r.tolerance}
                      onChange={(e) =>
                        updateExtra(r.key, { tolerance: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Xoá điểm đo"
                      onClick={() =>
                        setExtra((old) => old.filter((x) => x.key !== r.key))
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {sheet && !sizesOn.length && (
                  <p className="muted">Chọn ít nhất một size để đo.</p>
                )}
                <div className="inline-actions">
                  {pending > 0 && (
                    <Action
                      type="button"
                      tone="secondary"
                      onClick={() =>
                        setActuals((old) => {
                          const next = { ...old };
                          for (const r of fixedRows)
                            if (!r.actual) next[r.key] = r.spec;
                          return next;
                        })
                      }
                    >
                      <Check size={16} />
                      Các điểm còn lại đúng chuẩn
                    </Action>
                  )}
                  <Action
                    type="button"
                    tone="secondary"
                    onClick={() => setExtra((old) => [...old, newRow(unit)])}
                  >
                    <Plus size={16} />
                    Thêm điểm đo ngoài bảng
                  </Action>
                </div>
                <p className={`measure-summary ${out ? "out" : ""}`}>
                  Đã đo {measured}/{rows.length} điểm · Vượt dung sai: {out}
                  {pending ? ` · Còn ${pending} điểm chưa đo` : ""}
                </p>
              </div>
            </fieldset>
          )}
          <Field label={measureMode ? "Kết quả (gợi ý theo số đo)" : "Kết quả"}>
            <select
              value={result}
              onChange={(e) => setChosenResult(e.target.value)}
            >
              {attachmentMode && (
                <option value="" disabled>
                  — chọn kết quả —
                </option>
              )}
              {Object.entries(results).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {!isPattern && (
            <Field label="Số lỗi">
              <input
                name="defect_qty"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={0}
              />
            </Field>
          )}
          <div className="stack">
            <span className="field-label">
              {photoMode ? "Ảnh bảng đo đã điền" : "Ảnh chỗ lệch / lỗi"}{" "}
              <span className="muted">
                ({photoMode ? "bắt buộc" : "không bắt buộc"}, tối đa 6)
              </span>
            </span>
            <div className="prep-photos">
              {shots.map((shot, i) => (
                <div className="prep-shot" key={shot.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.preview} alt={`Ảnh ${i + 1}`} />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Bỏ ảnh ${i + 1}`}
                    onClick={() => {
                      URL.revokeObjectURL(shot.preview);
                      setShots((old) => old.filter((x) => x.key !== shot.key));
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {shots.length < 6 && (
                <button
                  type="button"
                  className="photo-add prep-camera"
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={22} />
                  {photoMode ? "Chụp ảnh" : "Chụp / chọn ảnh"}
                </button>
              )}
              {photoMode && shots.length < 6 && (
                <button
                  type="button"
                  className="photo-add prep-camera"
                  onClick={() => gallery.current?.click()}
                >
                  <Plus size={22} />
                  Chọn từ thư viện
                </button>
              )}
            </div>
            <input
              ref={gallery}
              type="file"
              accept="image/*"
              multiple
              aria-label="Chọn ảnh từ thư viện"
              className="image-file-input"
              onChange={(e) => {
                void addShots(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              aria-label="Chụp hoặc chọn ảnh chỗ lệch"
              className="image-file-input"
              onChange={(e) => {
                void addShots(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {fileMode && (
            <div className="stack">
              <span className="field-label">
                File bảng đo{" "}
                <span className="muted">
                  (bắt buộc, tối đa 3, mỗi file 10 MB)
                </span>
              </span>
              <ul className="prep-files">
                {attachments.map((file, i) => (
                  <li key={`${file.name}-${i}`}>
                    {file.name}
                    <span className="muted"> · {formatBytes(file.size)}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Bỏ file ${file.name}`}
                      onClick={() =>
                        setAttachments((old) => old.filter((_, n) => n !== i))
                      }
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              {attachments.length < 3 && (
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus size={16} />
                  Chọn file (PDF, Excel, Word)
                </Action>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.xlsx,.xls,.docx,.doc"
                multiple
                aria-label="Chọn file bảng đo"
                className="image-file-input"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  e.target.value = "";
                  const problem = picked.map(checkFileProblem).find(Boolean);
                  if (problem) {
                    setError(problem);
                    return;
                  }
                  setError("");
                  setAttachments((old) => [...old, ...picked].slice(0, 3));
                }}
              />
            </div>
          )}
          {!textMode && (
            <Field label="Ghi chú / nội dung chỉnh sửa">
              <textarea name="notes" maxLength={2000} rows={2} />
            </Field>
          )}
          <div className="prep-more">
            <div className="form-grid">
              <Field label="Người kiểm">
                <select name="checked_by" defaultValue={me}>
                  <option value="">Chưa chọn</option>
                  {checkers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              {isPattern && (
                <Field label="Người duyệt">
                  <select name="approved_by" defaultValue="">
                    <option value="">Chưa chọn</option>
                    {approvers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {isPattern && (
                <>
                  <Field label="Số mảnh rập cần">
                    <input
                      name="pieces_expected"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={last?.pieces_expected ?? ""}
                    />
                  </Field>
                  <Field label="Số mảnh rập có">
                    <input
                      name="pieces_received"
                      type="number"
                      inputMode="numeric"
                      min={0}
                    />
                  </Field>
                </>
              )}
              <Field label="Ngày kiểm">
                <input
                  name="checked_on"
                  type="date"
                  defaultValue={day()}
                  required
                />
              </Field>
            </div>
          </div>
          <div className="inline-actions">
            <Action type="submit" busy={busy}>
              Lưu kết quả
            </Action>
            <Action
              type="button"
              tone="secondary"
              onClick={() => setOpen(false)}
            >
              Hủy
            </Action>
          </div>
        </form>
      )}
    </article>
  );
}

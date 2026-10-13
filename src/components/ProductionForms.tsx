"use client";
import { MoneyInput } from "./SmartInputs";
import { useEffect, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import type { Order } from "@/lib/types";
import { type Api, type ViewLog, money, message } from "@/lib/client";
import type { Rate } from "@/lib/server/business";
import { OUTPUT_STAGES } from "@/lib/workflow";
import { OPTIONAL_RATE_STAGES, PriceInput } from "./detail-rates";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { DEFAULT_POLICY, type Policy } from "@/lib/policy";
export { ProductionForm, OrderDetail } from "./DepartmentWorkspace";

const PAGE = 15;
type RateFilter = "missing" | "open" | "all";

/**
 * Piece rates, one row per order. The eye lands on what needs doing: orders still missing a
 * production price come first with an amber count; opening a row edits every stage in place.
 */
export function RatesPanel({
  orders,
  rates,
  api,
  onSaved,
}: {
  orders: Order[];
  rates: Rate[];
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RateFilter>("open");
  const [openId, setOpenId] = useState("");
  const [shown, setShown] = useState(PAGE);
  const priced = (o: Order, stage: string) =>
    rates.some((r) => r.order_id === o.id && r.stage === stage) ||
    (o.work_items || []).some((w) => w.stage === stage);
  const lacking = (o: Order) =>
    OUTPUT_STAGES.filter(
      (s) => !OPTIONAL_RATE_STAGES.includes(s) && !priced(o, s),
    );
  const running = orders.filter((o) => o.status !== "completed");
  const counts: Record<RateFilter, number> = {
    missing: running.filter((o) => lacking(o).length).length,
    open: running.length,
    all: orders.length,
  };
  const needle = search.trim().toLocaleLowerCase("vi");
  const list = (filter === "all" ? orders : running)
    .filter((o) => filter !== "missing" || lacking(o).length)
    .filter((o) =>
      `${o.id} ${o.product_name} ${o.customer}`
        .toLocaleLowerCase("vi")
        .includes(needle),
    )
    .sort(
      (a, b) =>
        Number(!!lacking(b).length) - Number(!!lacking(a).length) ||
        (b.created_at || "").localeCompare(a.created_at || ""),
    );
  return (
    <div className="stack rates-workspace">
      <section className="panel">
        <div className="panel-toolbar rates-toolbar">
          <div className="search-input">
            <Search size={20} />
            <input
              type="search"
              aria-label="Tìm đơn để đặt giá"
              placeholder="Mã đơn, sản phẩm, khách hàng…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
            />
          </div>
          <div className="segmented" role="group" aria-label="Lọc đơn">
            {(
              [
                ["missing", "Thiếu giá"],
                ["open", "Đang làm"],
                ["all", "Tất cả"],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setShown(PAGE);
                }}
              >
                {label} ({counts[key]})
              </button>
            ))}
          </div>
        </div>
        <ul className="rate-orders">
          {list.slice(0, shown).map((o) => {
            const open = openId === o.id;
            const gaps = lacking(o);
            return (
              <li key={o.id} className={open ? "open" : undefined}>
                <button
                  type="button"
                  className="rate-order-row"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? "" : o.id)}
                >
                  <span className="rate-order-name">
                    <strong>{o.product_name}</strong>
                    <small>
                      {o.id} · {o.customer}
                    </small>
                  </span>
                  <span
                    className={`rate-badge ${gaps.length ? "missing" : "done"}`}
                  >
                    {gaps.length ? `Thiếu ${gaps.length} giá` : "Đủ giá"}
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                {open && (
                  <OrderRatesEditor
                    order={o}
                    rates={rates}
                    sources={orders.filter(
                      (x) =>
                        x.id !== o.id && rates.some((r) => r.order_id === x.id),
                    )}
                    api={api}
                    onSaved={onSaved}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {!list.length && (
          <Empty>
            {filter === "missing"
              ? "Không còn đơn nào thiếu giá."
              : "Không có đơn phù hợp."}
          </Empty>
        )}
        {list.length > shown && (
          <div className="padded">
            <Action
              type="button"
              tone="secondary"
              onClick={() => setShown(shown + PAGE)}
            >
              Xem thêm {Math.min(PAGE, list.length - shown)} đơn
            </Action>
          </div>
        )}
      </section>
      <PolicyCard api={api} />
    </div>
  );
}

/** Every stage price of one order, edited together; work parts are priced per part. */
function OrderRatesEditor({
  order,
  rates,
  sources,
  api,
  onSaved,
}: {
  order: Order;
  rates: Rate[];
  sources: Order[];
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, number | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  // The same product first, then the most recent orders.
  const ranked = [...sources].sort(
    (a, b) =>
      Number(
        b.product_code === order.product_code ||
          b.product_name === order.product_name,
      ) -
        Number(
          a.product_code === order.product_code ||
            a.product_name === order.product_name,
        ) || (b.order_date || "").localeCompare(a.order_date || ""),
  );
  const [sourceValue, setSource] = useState("");
  const source = ranked.some((o) => o.id === sourceValue)
    ? sourceValue
    : ranked[0]?.id || "";
  const fields = OUTPUT_STAGES.flatMap((stage) => {
    const parts = (order.work_items || []).filter((p) => p.stage === stage);
    return parts.length
      ? parts.map((p) => ({
          key: `part:${p.id}`,
          stage,
          part: p.id as number | undefined,
          label: `${stage} · ${p.name}`,
          current: rates.find((r) => r.work_item_id === p.id)?.unit_price,
        }))
      : [
          {
            key: stage,
            stage,
            part: undefined as number | undefined,
            label: stage,
            current: rates.find(
              (r) =>
                r.order_id === order.id && r.stage === stage && !r.work_item_id,
            )?.unit_price,
          },
        ];
  });
  const pending = fields.filter(
    (f) => draft[f.key] !== undefined && draft[f.key] !== f.current,
  );
  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const done = await work();
      setDraft({});
      await onSaved();
      setSaved(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rate-order-edit">
      <ErrorNotice error={error} />
      <div className="rates-grid">
        {fields.map((f) => (
          <label key={f.key} className="rates-cell">
            <span>{f.label}</span>
            <PriceInput
              label={`Đơn giá ${f.label}`}
              value={f.key in draft ? draft[f.key] : f.current}
              missing={
                !OPTIONAL_RATE_STAGES.includes(f.stage) &&
                f.current === undefined &&
                draft[f.key] === undefined
              }
              placeholder={
                OPTIONAL_RATE_STAGES.includes(f.stage)
                  ? "Không bắt buộc"
                  : "Chưa có"
              }
              onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
            />
          </label>
        ))}
      </div>
      <div className="rates-foot">
        {!!ranked.length && (
          <span className="rate-copy">
            <select
              aria-label="Đơn để lấy giá"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {ranked.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.product_name}
                </option>
              ))}
            </select>
            <Action
              type="button"
              tone="secondary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    copied: string[];
                    skipped: string[];
                  }>("/api/rates", {
                    order_id: order.id,
                    copy_from: source,
                    version: order.version,
                  });
                  return `Đã lấy giá từ ${source}: ${result.copied.join(", ") || "không có gì mới"}.`;
                })
              }
            >
              Lấy giá đơn này
            </Action>
          </span>
        )}
        {saved && <span className="muted">{saved}</span>}
        <Action
          type="button"
          busy={busy}
          disabled={!pending.length}
          onClick={() =>
            void run(async () => {
              for (const f of pending)
                await api("/api/rates", {
                  order_id: order.id,
                  stage: f.stage,
                  unit_price: draft[f.key],
                  ...(f.part ? { work_item_id: f.part } : {}),
                });
              return "Đã lưu đơn giá.";
            })
          }
        >
          Lưu đơn giá
        </Action>
      </div>
      {(["Cắt", "May"] as const).map((stage) => (
        <WorkPlanForm
          key={`${order.id}-${stage}`}
          order={order}
          stage={stage}
          rates={rates}
          api={api}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}
export function ProductionHistory({
  logs,
  hideEmployee = false,
}: {
  logs: ViewLog[];
  hideEmployee?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="mobile-stack-table">
        <thead>
          <tr>
            <th>Ngày</th>
            {!hideEmployee && <th>Nhân viên</th>}
            <th>Đơn / màu / size</th>
            <th>Công đoạn</th>
            <th>Số lượng</th>
            <th>Tiền công</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td data-label="Ngày">{l.log_date}</td>
              {!hideEmployee && (
                <td data-label="Nhân viên">{l.employee_name}</td>
              )}
              <td data-label="Đơn / màu / size">
                <div className="mobile-cell-value">
                  {l.order_id}
                  <span className="table-subtitle">
                    {l.color} / {l.size}
                  </span>
                </div>
              </td>
              <td data-label="Công đoạn">
                <div className="mobile-cell-value">
                  {l.stage}
                  {l.work_item_name && (
                    <span className="table-subtitle">{l.work_item_name}</span>
                  )}
                </div>
              </td>
              <td data-label="Số lượng">
                {l.quantity.toLocaleString("vi-VN")}
              </td>
              <td data-label="Tiền công">
                {l.total_pay === null
                  ? "Không có quyền xem"
                  : money(l.total_pay)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!logs.length && <Empty>Chưa có dữ liệu theo bộ lọc.</Empty>}
    </div>
  );
}

function WorkPlanForm({
  order,
  stage,
  rates,
  api,
  onSaved,
}: {
  order: Order;
  stage: string;
  rates: Rate[];
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const existing = (order.work_items || []).filter((p) => p.stage === stage);
  const [rows, setRows] = useState(
    existing.length
      ? existing.map((p) => ({
          key: String(p.id),
          name: p.name,
          unit_price:
            rates.find((r) => r.work_item_id === p.id)?.unit_price || 0,
        }))
      : [
          { key: "initial-1", name: "", unit_price: 0 },
          { key: "initial-2", name: "", unit_price: 0 },
        ],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/rates", {
        order_id: order.id,
        stage,
        version: order.version,
        work_items: rows.map(({ name, unit_price }) => ({ name, unit_price })),
      });
      await onSaved();
      setNotice(
        "Đã lưu phần việc. Người quản lý có thể phân công thợ và ghi nhận từng phần việc.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="record-disclosure">
      <summary>Chia {stage} thành các phần việc cho nhiều người</summary>
      <form
        className="stack padded"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="muted">
          Mỗi sản phẩm cần đủ tất cả phần việc dưới đây. Nhiều người có thể chia
          nhau cùng một phần việc; tổng số lượng mỗi phần không vượt đầu vào.
          Cấu hình trước khi có sản lượng công đoạn; sau đó chỉ sửa đơn giá ở
          form phía trên.
        </p>
        {rows.map((row, i) => (
          <div className="form-grid work-plan-row" key={row.key}>
            <Field label={`Phần việc ${i + 1}`}>
              <input
                required
                maxLength={80}
                placeholder="Ví dụ: May thân, may tay, ráp áo"
                value={row.name}
                onChange={(e) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Đơn giá phần việc / sản phẩm">
              <MoneyInput
                defaultValue={row.unit_price}
                onValueChange={(value) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, unit_price: value } : r,
                    ),
                  )
                }
              />
            </Field>
            <Action
              type="button"
              tone="secondary"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
            >
              <X size={18} />
              Bỏ phần việc
            </Action>
          </div>
        ))}
        <Action
          type="button"
          tone="secondary"
          disabled={rows.length >= 30}
          onClick={() =>
            setRows([
              ...rows,
              { key: crypto.randomUUID(), name: "", unit_price: 0 },
            ])
          }
        >
          <Plus size={18} />
          Thêm phần việc
        </Action>
        <ErrorNotice error={error} />
        {notice && <p role="status">{notice}</p>}
        <Action type="submit" busy={busy}>
          Lưu danh sách phần việc
        </Action>
      </form>
    </details>
  );
}

function PolicyCard({ api }: { api: Api }) {
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<Policy>("/api/settings/policy")
      .then((p) => live && setPolicy(p))
      .catch((e) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [api]);
  return (
    <section className="panel padded">
      <h2>Quy định xưởng</h2>
      <p className="muted">
        Áp dụng cho các lần ghi nhận tiếp theo; sản lượng và tiền công đã lưu
        giữ nguyên.
      </p>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setSaved("");
          try {
            setPolicy(await api<Policy>("/api/settings/policy", policy, "PUT"));
            setSaved("Đã lưu quy định xưởng.");
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorNotice error={error} />
        <div className="form-grid">
          <Field
            label="Cắt dư tối đa so với đơn (%)"
            hint="Ví dụ 10: đơn 100 được nhập cắt tới 110."
          >
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={policy.overcut_percent}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  overcut_percent: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field
            label="Gợi ý trừ công khi sản phẩm lỗi (%)"
            hint="0 là chỉ theo dõi lỗi theo thợ; hệ thống không tự trừ lương."
          >
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={policy.defect_penalty_percent}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  defect_penalty_percent: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={policy.overcut_paid}
            onChange={(e) =>
              setPolicy({ ...policy, overcut_paid: e.target.checked })
            }
          />
          Trả công phần cắt dư (bỏ chọn nếu chỉ trả công theo số lượng đặt)
        </label>
        {saved && (
          <p role="status" className="rate-save-notice">
            {saved}
          </p>
        )}
        <Action type="submit" busy={busy}>
          Lưu quy định
        </Action>
      </form>
    </section>
  );
}

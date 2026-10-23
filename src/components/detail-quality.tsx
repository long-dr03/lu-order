"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { type Api, day, message } from "@/lib/client";
import { type SessionInfo } from "@/lib/permissions";
import { type Employee } from "@/lib/types";
import { remainingOperation } from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { ProductImagePicker, uploadProductImage } from "./ProductImage";
import { Detail, keyFor } from "./order-detail-shared";
import { DateInput, TimeInput } from "./DateInput";

const PAY_NOTE: Record<string, string> = {
  recorded: "Đã lưu kết quả kiểm và tính công QC.",
  no_rate:
    "Đã lưu kết quả kiểm. Chưa có đơn giá QC nên chưa tính công; đặt giá ở tab Tiến độ rồi ghi bù ở Ghi sản lượng.",
  no_permission:
    "Đã lưu kết quả kiểm. Tài khoản này không được ghi công QC; quản lý ghi bù ở Ghi sản lượng.",
  locked: "Đã lưu kết quả kiểm. Tháng lương đã chốt nên chưa tính công QC.",
  split:
    "Đã lưu kết quả kiểm. QC của đơn này chia theo phần việc, nên ghi công từng phần ở Ghi sản lượng.",
  no_inspector:
    "Đã lưu kết quả kiểm. Chưa chọn người kiểm nên chưa tính công QC.",
};

export function QualityForm({
  order,
  session,
  employees,
  api,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  employees: Employee[];
  api: Api;
  onChanged: () => Promise<void>;
}) {
  // Who did the inspecting and gets paid for it: QC staff, or anyone already assigned to QC here.
  const assignedQc = (order.assignments || [])
    .filter((a) => a.active === 1 && a.stage === "QC")
    .map((a) => a.employee_id);
  const inspectors = employees.filter(
    (e) =>
      e.active !== 0 &&
      (e.department_ids?.includes("quality") || assignedQc.includes(e.id)),
  );
  const [inspectorValue, setInspector] = useState("");
  const inspector = inspectors.some((e) => e.id === inspectorValue)
    ? inspectorValue
    : assignedQc.find((id) => inspectors.some((e) => e.id === id)) ||
      (inspectors.some((e) => e.id === session.user.employee_id)
        ? session.user.employee_id!
        : inspectors[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  // What waits for each kind of inspection; open on the one that has work, so re-inspection
  // after repair is not hidden behind the first-inspection view.
  const waiting = (kind: "qc" | "reinspect") =>
    (order.variants || []).reduce((n, v) => n + remainingOperation(v, kind), 0);
  const [chosen, setAction] = useState<"qc" | "reinspect" | null>(null);
  const action =
    chosen ||
    (waiting("qc") === 0 && waiting("reinspect") > 0 ? "reinspect" : "qc");
  const [qty, setQty] = useState<Record<string, number>>({});
  // Inspectors count defects, not passes: "kiểm 10, lỗi 2" is how the floor reports it.
  const [defects, setDefects] = useState<Record<string, number>>({});
  const defectsOf = (key: string) => Math.min(defects[key] || 0, qty[key] || 0);
  const passedOf = (key: string) => (qty[key] || 0) - defectsOf(key);
  // Defects can be attributed to the sewers/cutters who made the pieces.
  const [blame, setBlame] = useState<
    Record<string, { who: string; quantity: number }[]>
  >({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const culprits = ["May", "Cắt"].flatMap((stage) => {
    const seen = new Set<string>();
    return (order.assignments || [])
      .filter((a) => a.active === 1 && a.stage === stage)
      .filter((a) => !seen.has(a.employee_id) && seen.add(a.employee_id))
      .map((a) => ({
        key: `${stage}|${a.employee_id}`,
        label: `${a.employee_name} (${stage})`,
      }));
  });
  const rows = (order.variants || [])
    .map((v) => ({ ...v, remaining: remainingOperation(v, action) }))
    .filter((v) => v.remaining > 0);
  const entries = rows
    .filter((v) => (qty[keyFor(v)] || 0) > 0)
    .map((v) => ({
      color: v.color,
      size: v.size,
      quantity: qty[keyFor(v)],
      passed: passedOf(keyFor(v)),
      ...(action === "qc" && (blame[keyFor(v)] || []).some((b) => b.who)
        ? {
            blame: (blame[keyFor(v)] || [])
              .filter((b) => b.who && b.quantity > 0)
              .map((b) => ({
                employee_id: b.who.split("|")[1],
                stage: b.who.split("|")[0],
                quantity: b.quantity,
              })),
          }
        : {}),
    }));
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        const f = new FormData(e.currentTarget);
        try {
          const imageUrl = imageFile
            ? await uploadProductImage(imageFile, session)
            : undefined;
          const saved = await api<{ qc_pay?: string }>(
            `/api/orders/${encodeURIComponent(order.id)}/operations`,
            {
              version: order.version,
              worker_id: inspector || undefined,
              action,
              operation_date: f.get("date"),
              operation_time: f.get("time"),
              image_url: imageUrl,
              defect_type: String(f.get("defect") || ""),
              reason: String(f.get("reason") || "").trim() || undefined,
              entries,
            },
          );
          setNotice(PAY_NOTE[saved.qc_pay || ""] || "Đã lưu kết quả kiểm.");
          setQty({});
          setDefects({});
          setBlame({});
          setImageFile(null);
          await onChanged();
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorNotice error={error} />
      {notice && (
        <p role="status" className="rate-save-notice">
          {notice}
        </p>
      )}
      <div className="segmented qc-kind" role="group" aria-label="Loại kiểm">
        {(
          [
            ["qc", "Kiểm lần đầu"],
            ["reinspect", "QC lại sau sửa"],
          ] as const
        ).map(([kind, label]) => (
          <button
            type="button"
            key={kind}
            aria-pressed={action === kind}
            onClick={() => {
              setAction(kind);
              setQty({});
              setDefects({});
            }}
          >
            {label}
            <small> · chờ {waiting(kind).toLocaleString("vi-VN")}</small>
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Người kiểm (nhận công QC)">
          {inspectors.length ? (
            <select
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
            >
              {inspectors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">
              Chưa có ai ở bộ phận QC. Khai báo ở Danh sách thợ.
            </span>
          )}
        </Field>
        <Field label="Ngày kiểm">
          <DateInput name="date" required max={day()} defaultValue={day()} />
        </Field>
        <Field label="Giờ kiểm">
          <TimeInput name="time" />
        </Field>
      </div>
      {rows.map((v) => (
        <div className="qc-entry" key={keyFor(v)}>
          <strong>
            {v.color} / {v.size} · Chờ kiểm {v.remaining}
          </strong>
          <Field label="Số kiểm">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={v.remaining}
              value={qty[keyFor(v)] || ""}
              placeholder="0"
              onChange={(e) =>
                setQty({ ...qty, [keyFor(v)]: Number(e.target.value) })
              }
            />
          </Field>
          <Field
            label="Số lỗi"
            hint={
              qty[keyFor(v)]
                ? `Đạt ${passedOf(keyFor(v))} / ${qty[keyFor(v)]}`
                : undefined
            }
          >
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={qty[keyFor(v)] || 0}
              value={defects[keyFor(v)] || ""}
              placeholder="0"
              onChange={(e) =>
                setDefects({ ...defects, [keyFor(v)]: Number(e.target.value) })
              }
            />
          </Field>
          {action === "qc" && defectsOf(keyFor(v)) > 0 && (
            <div className="stack">
              <span className="muted">
                {defectsOf(keyFor(v))} sản phẩm lỗi. Thợ nào gây lỗi? (không bắt
                buộc)
              </span>
              {(blame[keyFor(v)] || []).map((b, i) => (
                <div className="inline-actions" key={i}>
                  <select
                    aria-label="Thợ gây lỗi"
                    value={b.who}
                    onChange={(e) =>
                      setBlame({
                        ...blame,
                        [keyFor(v)]: blame[keyFor(v)].map((x, n) =>
                          n === i ? { ...x, who: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">Chọn thợ</option>
                    {culprits.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Số sản phẩm lỗi của thợ này"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={b.quantity || ""}
                    onChange={(e) =>
                      setBlame({
                        ...blame,
                        [keyFor(v)]: blame[keyFor(v)].map((x, n) =>
                          n === i
                            ? { ...x, quantity: Number(e.target.value) }
                            : x,
                        ),
                      })
                    }
                  />
                  <Action
                    type="button"
                    tone="secondary"
                    onClick={() =>
                      setBlame({
                        ...blame,
                        [keyFor(v)]: blame[keyFor(v)].filter((_, n) => n !== i),
                      })
                    }
                  >
                    Bỏ
                  </Action>
                </div>
              ))}
              <Action
                type="button"
                tone="secondary"
                disabled={!culprits.length}
                onClick={() =>
                  setBlame({
                    ...blame,
                    [keyFor(v)]: [
                      ...(blame[keyFor(v)] || []),
                      {
                        who: "",
                        quantity: Math.max(
                          1,
                          defectsOf(keyFor(v)) -
                            (blame[keyFor(v)] || []).reduce(
                              (n, x) => n + (x.quantity || 0),
                              0,
                            ),
                        ),
                      },
                    ],
                  })
                }
              >
                <Plus size={18} />
                {(blame[keyFor(v)] || []).length
                  ? "Thêm thợ khác"
                  : "Chọn thợ gây lỗi"}
              </Action>
              {!culprits.length && (
                <span className="muted">
                  Chưa phân công thợ May/Cắt nên chưa quy lỗi được.
                </span>
              )}
            </div>
          )}
        </div>
      ))}
      {!rows.length && (
        <Empty>Chưa có số lượng chờ kiểm ở loại kiểm này.</Empty>
      )}
      <Field label="Mô tả lỗi">
        <textarea name="defect" maxLength={500} />
      </Field>
      <ProductImagePicker
        file={imageFile}
        onFile={setImageFile}
        onRemove={() => setImageFile(null)}
        label="Ảnh lỗi"
        prompt="Thêm ảnh để đối chiếu lỗi"
      />
      <Field label="Nguyên nhân / giải trình">
        <textarea name="reason" maxLength={2000} />
      </Field>
      <Action type="submit" busy={busy} disabled={!entries.length}>
        Lưu kết quả QC
      </Action>
    </form>
  );
}

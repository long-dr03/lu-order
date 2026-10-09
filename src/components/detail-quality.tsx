"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { type Api, day, message } from "@/lib/client";
import { type SessionInfo } from "@/lib/permissions";
import { remainingOperation } from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { ProductImagePicker, uploadProductImage } from "./ProductImage";
import { Detail, keyFor } from "./order-detail-shared";

export function QualityForm({
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [action, setAction] = useState<"qc" | "reinspect">("qc");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [passed, setPassed] = useState<Record<string, number>>({});
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
      passed: passed[keyFor(v)] ?? qty[keyFor(v)],
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
        const f = new FormData(e.currentTarget);
        try {
          const imageUrl = imageFile
            ? await uploadProductImage(imageFile, session)
            : undefined;
          await api(`/api/orders/${encodeURIComponent(order.id)}/operations`, {
            version: order.version,
            action,
            operation_date: f.get("date"),
            operation_time: f.get("time"),
            image_url: imageUrl,
            defect_type: String(f.get("defect") || ""),
            reason: String(f.get("reason") || "").trim() || undefined,
            entries,
          });
          setQty({});
          setPassed({});
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
      <p>
        Người kiểm: <strong>{session.user.name}</strong>. Sửa hàng do thợ may
        thực hiện và được ghi tại “Ghi sản lượng” bởi người phụ trách May; QC
        kiểm lại sau khi sửa.
      </p>
      <ErrorNotice error={error} />
      <div className="form-grid">
        <Field label="Loại kiểm">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as "qc" | "reinspect");
              setQty({});
              setPassed({});
            }}
          >
            <option value="qc">Kiểm lần đầu</option>
            <option value="reinspect">Kiểm lại sau sửa</option>
          </select>
        </Field>
        <Field label="Ngày kiểm">
          <input
            name="date"
            type="date"
            required
            max={day()}
            min={order.order_date}
            defaultValue={day()}
          />
        </Field>
        <Field label="Giờ kiểm">
          <input
            name="time"
            type="time"
            required
            defaultValue={new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Ho_Chi_Minh",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date())}
          />
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
          <Field label="Số đạt">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={qty[keyFor(v)] || 0}
              value={passed[keyFor(v)] ?? qty[keyFor(v)] ?? ""}
              onChange={(e) =>
                setPassed({ ...passed, [keyFor(v)]: Number(e.target.value) })
              }
            />
          </Field>
          {action === "qc" &&
            (qty[keyFor(v)] || 0) - (passed[keyFor(v)] ?? qty[keyFor(v)] ?? 0) >
              0 && (
              <div className="stack">
                <span className="muted">
                  {(qty[keyFor(v)] || 0) -
                    (passed[keyFor(v)] ?? qty[keyFor(v)] ?? 0)}{" "}
                  sản phẩm lỗi. Thợ nào gây lỗi? (không bắt buộc)
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
                          [keyFor(v)]: blame[keyFor(v)].filter(
                            (_, n) => n !== i,
                          ),
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
                            (qty[keyFor(v)] || 0) -
                              (passed[keyFor(v)] ?? qty[keyFor(v)] ?? 0) -
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

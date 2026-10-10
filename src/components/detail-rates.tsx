"use client";
import { useCallback, useEffect, useState } from "react";
import { type Api, message, money } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import type { Rate } from "@/lib/server/business";
import { Action, ErrorNotice } from "./Primitives";
import { MoneyInput } from "./SmartInputs";
import type { Detail } from "./order-detail-shared";

const PAY_STAGES = ["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"] as const;

/** Piece rates of this order, for a manager who may price at least one stage. */
export function useOrderRates(
  order: Detail,
  session: SessionInfo,
  api: Api,
  enabled: boolean,
) {
  const [all, setAll] = useState<Rate[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setAll(await api<Rate[]>("/api/rates"));
    } catch {
      setAll([]);
    }
  }, [api]);
  useEffect(() => {
    let live = true;
    if (enabled)
      void api<Rate[]>("/api/rates")
        .then((rows) => live && setAll(rows))
        .catch(() => live && setAll([]));
    return () => {
      live = false;
    };
  }, [enabled, api, order.version]);
  const own = (all || []).filter(
    (r) => r.order_id === order.id && !r.work_item_id,
  );
  const priced = (stage: string) =>
    own.some((r) => r.stage === stage) ||
    (order.work_items || []).some((w) => w.stage === stage);
  return {
    ready: all !== null,
    all: all || [],
    own,
    priced,
    cutPriced: priced("Cắt"),
    reload,
    canPrice: PAY_STAGES.some((s) =>
      permits(session.user, "rates.manage", { stage: s }),
    ),
  };
}

/**
 * Piece rates are fixed before production, as workshops do: set (or copy from the
 * previous order) here, then prepare the order. Recording output never asks for a price.
 */
export function RatesSetup({
  order,
  session,
  api,
  rates,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  api: Api;
  rates: ReturnType<typeof useOrderRates>;
  onChanged: () => Promise<void>;
}) {
  const stages = PAY_STAGES.filter((s) =>
    permits(session.user, "rates.manage", { stage: s }),
  );
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [fill, setFill] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const split = (stage: string) =>
    (order.work_items || []).some((w) => w.stage === stage);
  const current = (stage: string) =>
    rates.own.find((r) => r.stage === stage)?.unit_price;
  // Most recent other order that priced the stage (the list arrives oldest first).
  const previous = (stage: string) =>
    [...rates.all]
      .reverse()
      .find(
        (r) => r.order_id !== order.id && r.stage === stage && !r.work_item_id,
      )?.unit_price;
  const shown = (stage: string) => draft[stage] ?? current(stage);
  const missing = stages.filter((s) => !split(s) && !rates.priced(s));
  if (!rates.ready || !stages.length) return null;
  const pending = Object.entries(draft).filter(
    ([stage, price]) => !split(stage) && price !== current(stage),
  );
  const copyable = stages.some(
    (s) => !split(s) && !rates.priced(s) && previous(s) !== undefined,
  );
  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      for (const [stage, price] of pending)
        await api("/api/rates", {
          order_id: order.id,
          stage,
          unit_price: price,
        });
      setDraft({});
      await rates.reload();
      await onChanged();
      setSaved("Đã lưu đơn giá.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rates-setup" aria-label="Đơn giá công đoạn">
      <h3>Đơn giá công đoạn</h3>
      <p className="muted desktop-hint">
        Chốt đơn giá trước khi sản xuất; khi ghi sản lượng hệ thống tự lấy giá
        này để tính công.
      </p>
      <ErrorNotice error={error} />
      {copyable && (
        <Action
          type="button"
          tone="secondary"
          onClick={() => {
            setDraft((d) => ({
              ...Object.fromEntries(
                stages
                  .filter((s) => !split(s) && !rates.priced(s))
                  .flatMap((s) =>
                    previous(s) === undefined ? [] : [[s, previous(s)!]],
                  ),
              ),
              ...d,
            }));
            setFill((n) => n + 1);
          }}
        >
          Điền theo đơn trước
        </Action>
      )}
      <div className="rates-grid">
        {stages.map((stage) => (
          <label key={`${stage}-${fill}`} className="rates-row">
            <span>
              {stage}
              {split(stage) && (
                <small> · chia phần việc, đặt giá ở trang Đơn giá</small>
              )}
            </span>
            {split(stage) ? (
              <strong>Theo phần việc</strong>
            ) : (
              <MoneyInput
                aria-label={`Đơn giá ${stage}`}
                placeholder="đ / sản phẩm"
                defaultValue={shown(stage) ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, [stage]: v }))}
              />
            )}
            {!split(stage) && current(stage) !== undefined && (
              <small>Đang áp dụng: {money(current(stage)!)}</small>
            )}
          </label>
        ))}
      </div>
      <div className="inline-actions">
        <Action
          type="button"
          busy={busy}
          disabled={!pending.length}
          onClick={() => void save()}
        >
          Lưu đơn giá
        </Action>
        {saved && <span className="muted">{saved}</span>}
        {!!missing.length && !saved && (
          <span className="muted">Chưa có giá: {missing.join(", ")}</span>
        )}
      </div>
    </section>
  );
}

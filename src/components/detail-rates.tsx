"use client";
import { useCallback, useEffect, useState } from "react";
import { type Api, message, money } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import type { Rate } from "@/lib/server/business";
import { Action, ErrorNotice } from "./Primitives";
import type { Detail } from "./order-detail-shared";
import { OUTPUT_STAGES } from "@/lib/workflow";

const PAY_STAGES = OUTPUT_STAGES;
export const OPTIONAL_RATE_STAGES: readonly string[] = [
  "Kiểm NPL/Vải",
  "Kiểm rập",
  "Giao hàng",
];

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
  const [editing, setEditing] = useState(false);
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
  const priceable = stages.filter((s) => !split(s));
  // Production stages need a price to record output at all. Checks and delivery are priced only
  // by workshops that pay them per piece, so they are never chased.
  const missing = stages.filter(
    (s) => !OPTIONAL_RATE_STAGES.includes(s) && !split(s) && !rates.priced(s),
  );
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
      setEditing(false);
      await rates.reload();
      await onChanged();
      setSaved("Đã lưu.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  // Once every stage has a price the section folds into one line; it opens again to change one.
  if (!missing.length && !editing)
    return (
      <section className="rates-setup done" aria-label="Đơn giá công đoạn">
        <div className="rates-head">
          <h3>Đơn giá công đoạn</h3>
          <button
            type="button"
            className="rates-link"
            onClick={() => {
              setSaved("");
              setEditing(true);
            }}
          >
            Sửa
          </button>
        </div>
        <p className="rates-summary">
          {stages.map((stage) => (
            <span key={stage}>
              {stage}{" "}
              <strong>
                {split(stage)
                  ? "theo phần việc"
                  : current(stage) === undefined
                    ? "chưa đặt"
                    : money(current(stage)!)}
              </strong>
            </span>
          ))}
          {saved && <em>{saved}</em>}
        </p>
      </section>
    );
  return (
    <section className="rates-setup" aria-label="Đơn giá công đoạn">
      <div className="rates-head">
        <h3>
          Đơn giá công đoạn <small>đ / sản phẩm</small>
        </h3>
        {copyable && (
          <button
            type="button"
            className="rates-link"
            onClick={() =>
              setDraft((d) => ({
                ...Object.fromEntries(
                  priceable
                    .filter((s) => !rates.priced(s))
                    .flatMap((s) =>
                      previous(s) === undefined ? [] : [[s, previous(s)!]],
                    ),
                ),
                ...d,
              }))
            }
          >
            Lấy giá đơn trước
          </button>
        )}
      </div>
      <ErrorNotice error={error} />
      <div className="rates-grid">
        {stages.map((stage) => (
          <label key={stage} className="rates-cell">
            <span>{stage}</span>
            {split(stage) ? (
              <em>Theo phần việc</em>
            ) : (
              <PriceInput
                label={`Đơn giá ${stage}`}
                value={shown(stage)}
                missing={
                  !OPTIONAL_RATE_STAGES.includes(stage) &&
                  !rates.priced(stage) &&
                  draft[stage] === undefined
                }
                placeholder={
                  OPTIONAL_RATE_STAGES.includes(stage)
                    ? "Không bắt buộc"
                    : "Chưa có"
                }
                onChange={(v) =>
                  setDraft((d) => {
                    const next = { ...d };
                    if (v === undefined) delete next[stage];
                    else next[stage] = v;
                    return next;
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
      <div className="rates-foot">
        {!!missing.length && (
          <span className="muted">
            Còn {missing.length} công đoạn chưa có giá
          </span>
        )}
        {editing && (
          <button
            type="button"
            className="rates-link"
            onClick={() => {
              setDraft({});
              setEditing(false);
            }}
          >
            Hủy
          </button>
        )}
        <Action
          type="button"
          busy={busy}
          disabled={!pending.length}
          onClick={() => void save()}
        >
          Lưu đơn giá
        </Action>
      </div>
    </section>
  );
}

/** Whole đồng with a dot every three digits and the unit inside the field. */
export function PriceInput({
  label,
  value,
  missing,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | undefined;
  missing: boolean;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <span className={`price-input${missing ? " missing" : ""}`}>
      <input
        aria-label={label}
        inputMode="numeric"
        placeholder={placeholder}
        value={value === undefined ? "" : value.toLocaleString("vi-VN")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
          onChange(digits ? Number(digits) : undefined);
        }}
      />
      <span aria-hidden="true">đ</span>
    </span>
  );
}

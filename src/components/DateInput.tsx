"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { day } from "@/lib/client";

// The browser's own date picker follows the device language, so a phone set to English shows
// "October" and "Mon". These pickers always speak Vietnamese and keep the same ISO values.

type Mode = "date" | "month" | "datetime";
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function shown(value: string, mode: Mode) {
  if (!value) return "";
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-");
  if (mode === "month") return `Tháng ${Number(m)}/${y}`;
  return `${d}/${m}/${y}${mode === "datetime" && time ? ` · ${time.slice(0, 5)}` : ""}`;
}

/** Vietnam-local "now" as HH:mm. */
const clock = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

export function DateInput({
  name,
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  required,
  mode = "date",
  label,
}: {
  name?: string;
  /** ISO value: YYYY-MM-DD, YYYY-MM (month) or YYYY-MM-DDTHH:mm (datetime). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  mode?: Mode;
  /** Accessible name when the field has no visible label. */
  label?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const proxy = useRef<HTMLInputElement>(null);
  const today = day();
  const datePart = current.slice(0, mode === "month" ? 7 : 10);
  const timePart = mode === "datetime" ? current.slice(11, 16) : "";
  const anchor = datePart || today;
  const [view, setView] = useState({
    y: Number(anchor.slice(0, 4)),
    m: Number(anchor.slice(5, 7)),
  });
  const set = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  useEffect(() => {
    proxy.current?.setCustomValidity(
      required && !current
        ? mode === "month"
          ? "Vui lòng chọn tháng."
          : "Vui lòng chọn ngày."
        : "",
    );
  }, [required, current, mode]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !root.current || !popover.current) return;
    const box = root.current.getBoundingClientRect();
    setAlignRight(
      box.left + popover.current.offsetWidth > window.innerWidth - 8,
    );
    popover.current.scrollIntoView({ block: "nearest" });
  }, [open]);
  const toggle = () => {
    if (!open)
      setView({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) });
    setOpen(!open);
  };
  const shift = (months: number) =>
    setView(({ y, m }) => {
      const at = y * 12 + (m - 1) + months;
      return { y: Math.floor(at / 12), m: (at % 12) + 1 };
    });
  const minDate = min?.slice(0, 10);
  const maxDate = max?.slice(0, 10);
  const blocked = (date: string) =>
    (!!minDate && date < minDate) || (!!maxDate && date > maxDate);
  const pickDay = (date: string) => {
    if (mode === "datetime") set(`${date}T${timePart || clock()}`);
    else {
      set(date);
      setOpen(false);
    }
  };
  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  const text = shown(current, mode);
  return (
    <div className={`date-input${open ? " open" : ""}`} ref={root}>
      <button
        type="button"
        className="date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}: ${text || "chưa chọn"}` : undefined}
        onClick={toggle}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span className={text ? undefined : "date-empty"}>
          {text ||
            (mode === "month"
              ? "Chọn tháng"
              : mode === "datetime"
                ? "Chọn ngày giờ"
                : "Chọn ngày")}
        </span>
      </button>
      {/* Carries the value in forms and lets the browser block an empty required field. */}
      <input
        ref={proxy}
        className="date-proxy"
        name={name}
        value={current}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        onChange={() => {}}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div
          ref={popover}
          className={`date-popover${alignRight ? " align-right" : ""}`}
          role="dialog"
          aria-label={mode === "month" ? "Chọn tháng" : "Chọn ngày"}
          // Inside a <label> a click on empty space would re-trigger the field.
          onClick={(e) => e.preventDefault()}
        >
          <div className="date-nav">
            <button
              type="button"
              aria-label={mode === "month" ? "Năm trước" : "Tháng trước"}
              onClick={() => shift(mode === "month" ? -12 : -1)}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>
              {mode === "month"
                ? `Năm ${view.y}`
                : `Tháng ${view.m} năm ${view.y}`}
            </strong>
            <button
              type="button"
              aria-label={mode === "month" ? "Năm sau" : "Tháng sau"}
              onClick={() => shift(mode === "month" ? 12 : 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {mode === "month" ? (
            <div className="date-months">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const key = `${view.y}-${pad(m)}`;
                return (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={key === datePart}
                    className={key === today.slice(0, 7) ? "today" : undefined}
                    onClick={() => {
                      set(key);
                      setOpen(false);
                    }}
                  >
                    Tháng {m}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="date-grid">
              {WEEKDAYS.map((w) => (
                <span key={w} className="date-weekday">
                  {w}
                </span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={`gap-${i}`} />;
                const key = iso(view.y, view.m, d);
                return (
                  <button
                    type="button"
                    key={key}
                    disabled={blocked(key)}
                    aria-pressed={key === datePart}
                    aria-label={`Ngày ${d} tháng ${view.m} năm ${view.y}`}
                    className={key === today ? "today" : undefined}
                    onClick={() => pickDay(key)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          {mode === "datetime" && (
            <div className="date-time">
              <Clock size={18} aria-hidden="true" />
              <select
                aria-label="Giờ"
                value={timePart.slice(0, 2) || "00"}
                disabled={!datePart}
                onChange={(e) =>
                  set(
                    `${datePart}T${e.target.value}:${timePart.slice(3, 5) || "00"}`,
                  )
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={pad(h)}>
                    {pad(h)} giờ
                  </option>
                ))}
              </select>
              <select
                aria-label="Phút"
                value={timePart.slice(3, 5) || "00"}
                disabled={!datePart}
                onChange={(e) =>
                  set(
                    `${datePart}T${timePart.slice(0, 2) || "00"}:${e.target.value}`,
                  )
                }
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={pad(m)}>
                    {pad(m)} phút
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="date-footer">
            <button
              type="button"
              disabled={mode !== "month" && blocked(today)}
              onClick={() => {
                if (mode === "month") {
                  set(today.slice(0, 7));
                  setOpen(false);
                } else if (mode === "datetime") {
                  set(`${today}T${clock()}`);
                  setView({
                    y: Number(today.slice(0, 4)),
                    m: Number(today.slice(5, 7)),
                  });
                } else pickDay(today);
              }}
            >
              {mode === "month"
                ? "Tháng này"
                : mode === "datetime"
                  ? "Bây giờ"
                  : "Hôm nay"}
            </button>
            {!required && !!current && (
              <button
                type="button"
                onClick={() => {
                  set("");
                  setOpen(false);
                }}
              >
                Xóa
              </button>
            )}
            {mode === "datetime" && (
              <button
                type="button"
                className="primary"
                onClick={() => setOpen(false)}
              >
                Xong
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 24-hour time as two Vietnamese pickers; submits "HH:mm" under `name`. */
export function TimeInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const [time, setTime] = useState(defaultValue || clock());
  const [h, m] = time.split(":");
  return (
    <div className="time-input">
      <input type="hidden" name={name} value={time} />
      <select
        aria-label="Giờ"
        value={h}
        onChange={(e) => setTime(`${e.target.value}:${m}`)}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={pad(i)}>
            {pad(i)} giờ
          </option>
        ))}
      </select>
      <select
        aria-label="Phút"
        value={m}
        onChange={(e) => setTime(`${h}:${e.target.value}`)}
      >
        {Array.from({ length: 60 }, (_, i) => (
          <option key={i} value={pad(i)}>
            {pad(i)} phút
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";
import { useState, useRef, type InputHTMLAttributes } from "react";
import { Plus, X, Palette } from "lucide-react";
import { hexToHsv, hsvToHex, type GarmentColor } from "@/lib/colors";
const palette = [
  ["Trắng", "#ffffff"],
  ["Đen", "#171717"],
  ["Đỏ", "#dc2626"],
  ["Hồng", "#f9a8d4"],
  ["Be", "#d6c4a7"],
  ["Nâu", "#92400e"],
  ["Xanh dương", "#2563eb"],
  ["Xanh lá", "#16a34a"],
  ["Vàng", "#facc15"],
  ["Tím", "#9333ea"],
];
export function ColorPicker({
  value,
  hex,
  alpha = 100,
  onChange,
}: {
  value: string;
  hex: string;
  alpha?: number;
  onChange: (name: string, hex: string, alpha: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [presets, setPresets] = useState(false);
  const [draft, setDraft] = useState({
    name: value,
    hex,
    alpha,
    hue: hexToHsv(hex).h,
  });
  const [hexText, setHexText] = useState(hex);
  const trigger = useRef<HTMLButtonElement>(null);
  const hsv = hexToHsv(draft.hex);
  const rgb = [1, 3, 5].map((i) => parseInt(draft.hex.slice(i, i + 2), 16));
  const valid = /^#[0-9a-f]{6}$/i.test(hexText);
  function pick(next: string, name?: string) {
    const h = hexToHsv(next);
    setHexText(next);
    setDraft((old) => ({
      ...old,
      hex: next,
      name: name ?? old.name,
      hue: h.s && h.v ? h.h : old.hue,
    }));
  }
  function close() {
    setExpanded(false);
    setPresets(false);
    trigger.current?.focus();
  }
  function apply() {
    if (valid) {
      onChange(draft.name || draft.hex, draft.hex, draft.alpha);
      close();
    }
  }
  return (
    <div className="color-control">
      <div className="color-name">
        <button
          ref={trigger}
          type="button"
          aria-label="Mở bảng chọn màu"
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) {
              close();
              return;
            }
            setDraft({ name: value, hex, alpha, hue: hexToHsv(hex).h });
            setHexText(hex);
            setExpanded(true);
          }}
        >
          <span className="transparency-grid">
            <span style={{ backgroundColor: hex, opacity: alpha / 100 }} />
          </span>
        </button>
        <input
          aria-label="Tên màu / mã vải"
          value={value}
          required
          maxLength={160}
          placeholder="Tên màu / mã vải"
          onChange={(e) => onChange(e.target.value, hex, alpha)}
        />
      </div>
      {expanded && (
        <section
          className="color-options reference-picker"
          aria-label="Bảng chọn màu"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              apply();
            }
          }}
        >
          <div
            className="color-plane"
            role="group"
            tabIndex={0}
            aria-label="Kéo chọn độ bão hòa và độ sáng"
            style={{ backgroundColor: hsvToHex(draft.hue, 1, 1) }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              pick(
                hsvToHex(
                  draft.hue,
                  Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                  Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
                ),
              );
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const r = e.currentTarget.getBoundingClientRect();
              pick(
                hsvToHex(
                  draft.hue,
                  Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                  Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
                ),
              );
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              const step = e.shiftKey ? 0.1 : 0.01;
              pick(
                hsvToHex(
                  draft.hue,
                  Math.max(
                    0,
                    Math.min(
                      1,
                      hsv.s +
                        (e.key === "ArrowRight"
                          ? step
                          : e.key === "ArrowLeft"
                            ? -step
                            : 0),
                    ),
                  ),
                  Math.max(
                    0,
                    Math.min(
                      1,
                      hsv.v +
                        (e.key === "ArrowUp"
                          ? step
                          : e.key === "ArrowDown"
                            ? -step
                            : 0),
                    ),
                  ),
                ),
              );
            }}
          >
            <span
              className="color-cursor"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          <div className="picker-sliders">
            <div className="picker-tracks">
              <input
                className="hue-slider"
                aria-label="Sắc màu"
                type="range"
                min={0}
                max={359}
                value={draft.hue}
                onChange={(e) => {
                  const hue = Number(e.target.value);
                  setHexText(hsvToHex(hue, hsv.s, hsv.v));
                  setDraft((old) => ({
                    ...old,
                    hue,
                    hex: hsvToHex(hue, hsv.s, hsv.v),
                  }));
                }}
              />
              <div
                className="alpha-track transparency-grid"
                style={{
                  backgroundImage: `linear-gradient(to right,transparent,${draft.hex}),repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%)`,
                }}
              >
                <input
                  aria-label="Độ trong suốt"
                  type="range"
                  min={0}
                  max={100}
                  value={draft.alpha}
                  onChange={(e) =>
                    setDraft({ ...draft, alpha: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div
              className="picker-preview transparency-grid"
              aria-label="Màu đang chọn"
            >
              <span
                style={{
                  backgroundColor: draft.hex,
                  opacity: draft.alpha / 100,
                }}
              />
            </div>
          </div>
          <div className="picker-channels">
            <label>
              HEX
              <input
                aria-label="Mã HEX"
                value={hexText.toUpperCase()}
                maxLength={7}
                aria-invalid={!valid}
                onChange={(e) => {
                  setHexText(e.target.value);
                  if (/^#[0-9a-f]{6}$/i.test(e.target.value))
                    pick(e.target.value.toLowerCase());
                }}
                onBlur={() => {
                  if (!valid) setHexText(draft.hex);
                }}
              />
            </label>
            {["R", "G", "B"].map((c, i) => (
              <label key={c}>
                {c}
                <input
                  aria-label={c}
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[i]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      e.target.value !== "" &&
                      Number.isInteger(n) &&
                      n >= 0 &&
                      n <= 255
                    )
                      pick(
                        "#" +
                          rgb
                            .map((v, j) =>
                              (j === i ? n : v).toString(16).padStart(2, "0"),
                            )
                            .join(""),
                      );
                  }}
                />
              </label>
            ))}
            <label>
              A
              <input
                aria-label="A (%)"
                type="number"
                min={0}
                max={100}
                value={draft.alpha}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (
                    e.target.value !== "" &&
                    Number.isInteger(n) &&
                    n >= 0 &&
                    n <= 100
                  )
                    setDraft({ ...draft, alpha: n });
                }}
              />
            </label>
          </div>
          {presets && (
            <div className="swatches">
              {palette.map(([name, color]) => (
                <button
                  type="button"
                  key={color}
                  title={name}
                  aria-label={`Chọn màu ${name}`}
                  aria-pressed={draft.hex === color}
                  style={{ backgroundColor: color }}
                  onClick={() => pick(color, name)}
                />
              ))}
            </div>
          )}
          <div className="picker-actions">
            <button
              type="button"
              className="picker-presets"
              aria-label="Màu có sẵn"
              aria-expanded={presets}
              onClick={() => setPresets(!presets)}
            >
              <Palette size={20} />
            </button>
            <button type="button" onClick={close}>
              Hủy
            </button>
            <button type="button" disabled={!valid} onClick={apply}>
              Áp dụng
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export function parseMoney(value: string) {
  return Number(value.replace(/[.,\s]/g, ""));
}
export function MoneyInput({
  onValueChange,
  defaultValue = 0,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "max"
> & { onValueChange?: (value: number) => void }) {
  const [digits, setDigits] = useState(String(defaultValue));
  const [separator, setSeparator] = useState(".");
  const display = digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return (
    <div className="money-input">
      <input
        {...props}
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const v = e.target.value.replace(/[.,\s]/g, "");
          if (/^\d*$/.test(v)) {
            setDigits(v.replace(/^0+(?=\d)/, ""));
            onValueChange?.(Number(v));
            e.target.setCustomValidity(
              Number.isSafeInteger(Number(v))
                ? ""
                : "Số tiền vượt khả năng tính chính xác của hệ thống.",
            );
          }
        }}
      />
      <select
        aria-label="Dấu phân nhóm tiền"
        value={separator}
        onChange={(e) => setSeparator(e.target.value)}
      >
        <option value=".">1.000</option>
        <option value=",">1,000</option>
      </select>
    </div>
  );
}

export function GarmentColors({
  colors,
  onChange,
}: {
  colors: GarmentColor[];
  onChange: (name: string, colors: GarmentColor[]) => void;
}) {
  function update(next: GarmentColor[]) {
    onChange(
      next
        .map((c) => c.name.trim())
        .filter(Boolean)
        .join(" / "),
      next,
    );
  }
  return (
    <div className="garment-colors stack">
      <div className="garment-colors-list">
        {colors.map((c, i) => (
          <div className="garment-color" key={i}>
            <ColorPicker
              value={c.name}
              hex={c.hex}
              alpha={c.alpha}
              onChange={(name, hex, alpha) =>
                update(
                  colors.map((part, j) =>
                    i === j ? { name, hex, alpha } : part,
                  ),
                )
              }
            />
            {colors.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Bỏ màu phối ${i + 1}`}
                onClick={() => update(colors.filter((_, j) => i !== j))}
              >
                <X size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-button"
        disabled={colors.length >= 8}
        onClick={() => update([...colors, { name: "", hex: "#808080" }])}
      >
        <Plus size={16} /> Thêm màu phối trên cùng sản phẩm
      </button>
    </div>
  );
}

const DEFAULT_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "Free size",
  "Theo số đo",
];
export function SizeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(!DEFAULT_SIZES.includes(value));
  return (
    <div className="size-select">
      <select
        aria-label="Size"
        value={custom ? "__custom" : value}
        onChange={(event) => {
          const isCustom = event.target.value === "__custom";
          setCustom(isCustom);
          onChange(isCustom ? "" : event.target.value);
        }}
      >
        {DEFAULT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
        <option value="__custom">Size khác…</option>
      </select>
      {custom && (
        <input
          aria-label="Nhập size riêng"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          maxLength={40}
          placeholder="VD: 3XL, 38, Bé 6 tuổi"
          autoFocus
        />
      )}
    </div>
  );
}

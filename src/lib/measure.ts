// Garment spec sheets (POM charts) use inches with fractions ("28 1/4", "3/8") or centimetres.
export type MeasureUnit = "inch" | "cm";
export const UNIT_LABELS: Record<MeasureUnit, string> = {
  inch: "inch",
  cm: "cm",
};
/** One tap on +/- moves this far: the usual tape resolution on the cutting floor. */
export const MEASURE_STEP: Record<MeasureUnit, number> = {
  inch: 0.125,
  cm: 0.5,
};
export const DEFAULT_TOLERANCE: Record<MeasureUnit, number> = {
  inch: 0.25,
  cm: 0.5,
};

/** Reads "28 1/4", "28-1/4", "3/8", "28.25" or "28,25". Returns null when it is not a measurement. */
export function parseMeasure(raw: string | number | null | undefined) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? "")
    .trim()
    .replace(/[″"]|in(ch)?$/i, "")
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/⅛/g, " 1/8")
    .replace(/⅜/g, " 3/8")
    .replace(/⅝/g, " 5/8")
    .replace(/⅞/g, " 7/8")
    .trim();
  if (!text) return null;
  const sign = text.startsWith("-") ? -1 : 1;
  const body = text.replace(/^[+-]/, "").trim();
  const mixed = body.match(/^(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const [, whole, top, bottom] = mixed.map(Number);
    return bottom ? sign * (whole + top / bottom) : null;
  }
  const fraction = body.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const [, top, bottom] = fraction.map(Number);
    return bottom ? (sign * top) / bottom : null;
  }
  const decimal = body.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(decimal)) return null;
  return sign * Number(decimal);
}

/** Inches show as eighths ("28 1/4"); centimetres as one decimal. */
export function formatMeasure(
  value: number | null | undefined,
  unit: MeasureUnit,
) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "";
  if (unit === "cm")
    return String(Math.round(value * 10) / 10).replace(".", ",");
  const sign = value < 0 ? "-" : "";
  const eighths = Math.round(Math.abs(value) * 8);
  const whole = Math.floor(eighths / 8);
  let top = eighths % 8;
  let bottom = 8;
  while (top && top % 2 === 0) {
    top /= 2;
    bottom /= 2;
  }
  if (!top) return `${sign}${whole}`;
  return `${sign}${whole ? `${whole} ` : ""}${top}/${bottom}`;
}

/** Deviation with an explicit sign, e.g. "+1/8" or "-0,5". */
export function formatDeviation(value: number, unit: MeasureUnit) {
  if (Math.abs(value) < 1e-9) return "0";
  return `${value > 0 ? "+" : ""}${formatMeasure(value, unit)}`;
}

export const withinTolerance = (
  spec: number,
  actual: number,
  tolerance: number,
) => Math.abs(actual - spec) <= tolerance + 1e-9;

/**
 * Parses rows copied from Excel or a tech pack (tab separated).
 * Columns: [POM code], point of measure, tolerance, then one value per size.
 * A header row ("POM", "Point of measure", "TOL", "S", "M", …) supplies the size names.
 */
export function parsePomPaste(text: string, knownSizes: string[]) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => {
      // Excel pastes use tabs; "|" is accepted too for text copied from chat or documents.
      if (l.includes("\t") || !l.includes("|"))
        return l.split("\t").map((c) => c.trim());
      const cells = l.split("|").map((c) => c.trim());
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();
      return cells;
    })
    .filter((cells) => cells.some(Boolean));
  let sizes = knownSizes;
  let baseSize = "";
  const rows: {
    code: string;
    point: string;
    tolerance: number | null;
    values: Record<string, number>;
  }[] = [];
  for (const cells of lines) {
    const numbers = cells.filter((c) => parseMeasure(c) !== null).length;
    const header =
      cells.some((c) => /point|measure|điểm đo|pom/i.test(c)) && numbers <= 1;
    if (header) {
      const tolIndex = cells.findIndex((c) => /tol|dung sai/i.test(c));
      const pointIndex = cells.findIndex((c) =>
        /point|measure|điểm đo/i.test(c),
      );
      const start = (tolIndex >= 0 ? tolIndex : pointIndex) + 1;
      const names: string[] = [];
      for (const cell of cells.slice(start)) {
        if (!cell) continue;
        const name = cell.replace(/\(.*\)/, "").trim();
        if (/base|gốc/i.test(cell)) baseSize = name;
        names.push(name);
      }
      if (names.length) sizes = names;
      continue;
    }
    const hasCode =
      /^[A-Za-z]{0,3}\d+[A-Za-z]?$/.test(cells[0] || "") &&
      parseMeasure(cells[1]) === null;
    const [code, point, tol, ...rest] = hasCode ? cells : ["", ...cells];
    if (!point || parseMeasure(point) !== null) continue;
    const values: Record<string, number> = {};
    rest.forEach((cell, i) => {
      const value = parseMeasure(cell);
      if (value !== null && sizes[i]) values[sizes[i]] = value;
    });
    rows.push({ code, point, tolerance: parseMeasure(tol), values });
  }
  return { sizes, baseSize, rows };
}

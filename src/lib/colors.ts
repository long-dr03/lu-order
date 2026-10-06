export interface GarmentColor {
  name: string;
  hex: string;
  alpha?: number;
}
export function hexToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const v = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = v - min;
  let h = 0;
  if (d)
    h =
      60 *
      (v === r
        ? ((g - b) / d) % 6
        : v === g
          ? (b - r) / d + 2
          : (r - g) / d + 4);
  return { h: (h + 360) % 360, s: v ? d / v : 0, v };
}
export function hsvToHex(h: number, s: number, v: number) {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const rgb =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    rgb
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

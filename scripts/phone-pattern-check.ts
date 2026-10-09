// Drives the app in Chrome on a real Android phone over USB (adb) and walks the pattern-check flow.
//
//   adb -s <serial> reverse tcp:3100 tcp:3100
//   adb -s <serial> forward tcp:9333 localabstract:chrome_devtools_remote
//   PHONE_SERIAL=<serial> PHONE_USER=admin PHONE_PASSWORD=... node --import tsx scripts/phone-pattern-check.ts
//
// Use a disposable test database only: the script creates a POM chart and check rounds.
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PHONE_BASE_URL || "http://localhost:3100";
const DEVTOOLS = process.env.PHONE_DEVTOOLS || "http://127.0.0.1:9333";
const OUT = process.env.PHONE_OUT || path.join("screenshots", "phone");
const USER = process.env.PHONE_USER || "";
const PASSWORD = process.env.PHONE_PASSWORD || "";
const ORDER = process.env.PHONE_ORDER || "DEMO-1";
const SERIAL = process.env.PHONE_SERIAL || "";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const steps: { step: string; ok: boolean; note?: string }[] = [];
function record(step: string, ok: boolean, note?: string) {
  steps.push({ step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${note ? ` — ${note}` : ""}`);
}
async function until<T>(
  page: Page,
  what: string,
  fn: () => Promise<T | null | false | undefined>,
  timeout = 20000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
/** A real touch tap at the centre of the element, like a finger on the glass. */
async function tap(page: Page, selector: string, text?: string) {
  // Close the soft keyboard first: while it is open the page shifts and the touch can land on a neighbour.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur?.(),
  );
  await wait(400);
  const handle = await page.evaluateHandle(
    (selector, text) => {
      const matches = [...document.querySelectorAll(selector)].filter(
        (el) => !text || (el as HTMLElement).innerText.trim().startsWith(text),
      );
      return matches.find((el) => (el as HTMLElement).offsetParent !== null);
    },
    selector,
    text,
  );
  const element = handle.asElement() as ElementHandle<Element> | null;
  if (!element) throw new Error(`Nothing to tap: ${selector} ${text || ""}`);
  await element.evaluate((el) =>
    (el as HTMLElement).scrollIntoView({
      block: "center",
      behavior: "instant",
    }),
  );
  await wait(150);
  await element.tap();
  await wait(350);
}
/** Screenshot of what is really on the phone's screen (adb), which is more reliable than CDP on old phones. */
const roundCount = (page: Page) =>
  page.$$eval(".prep-round summary", (s) => s.length);
async function saveAndWait(page: Page) {
  const before = await roundCount(page);
  await tap(page, ".prep-card form button", "Lưu kết quả");
  await until(
    page,
    "round saved",
    async () => (await roundCount(page)) > before,
  );
  await until(
    page,
    "form closed",
    async () => !(await page.$(".prep-card form")),
  );
}
async function shot(_page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await wait(400);
  const png = execFileSync(
    "adb",
    ["-s", SERIAL, "exec-out", "screencap", "-p"],
    {
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  writeFileSync(path.join(OUT, `${name}.png`), png);
}
/** Touches the field to focus it, then sets the value. Typing key by key is not representative here:
 *  the phones run the ADB keyboard, which does not receive synthetic key events reliably. */
async function typeInto(page: Page, selector: string, value: string) {
  const el = await page.$(selector);
  if (!el) throw new Error(`No field: ${selector}`);
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await el.tap();
  await el.evaluate((node, text) => {
    const input = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function main() {
  if (!USER || !PASSWORD || !SERIAL)
    throw new Error(
      "Set PHONE_SERIAL (adb devices), PHONE_USER and PHONE_PASSWORD for the test database.",
    );
  const browser = await puppeteer.connect({
    browserURL: DEVTOOLS,
    defaultViewport: null,
  });
  const page = (await browser.pages()).find((p) => p.url().startsWith(BASE));
  if (!page) throw new Error(`Open ${BASE} in Chrome on the phone first.`);
  await page.bringToFront();
  const viewport = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    touch: navigator.maxTouchPoints,
    ua: navigator.userAgent.includes("Android"),
  }));
  record(
    "Phone Chrome connected",
    viewport.ua && viewport.touch > 0,
    `${viewport.w}x${viewport.h} CSS px, ${viewport.touch} touch points`,
  );

  await page.goto(BASE, { waitUntil: "networkidle2" });
  // A session from an earlier run may still be open on the phone.
  const screen = await until(page, "login form or app", async () =>
    (await page.$(".mobile-menu"))
      ? "app"
      : (await page.$('input[type="password"]'))
        ? "login"
        : null,
  );
  if (screen === "login") {
    // The sign-in screen can be left on the registration view by an earlier run.
    const heading = await page.$eval("h2", (e) => (e as HTMLElement).innerText);
    if (/Tạo tài khoản/.test(heading))
      await tap(page, "button", "Đã có tài khoản");
    await until(page, "login view", async () =>
      /Chào mừng/.test(
        await page.$eval("h2", (e) => (e as HTMLElement).innerText),
      ),
    );
    await typeInto(page, 'form input:not([type="password"])', USER);
    await typeInto(page, 'form input[type="password"]', PASSWORD);
    await shot(page, "01-login");
    await tap(page, 'form button[type="submit"]', "Đăng nhập");
    await until(page, "signed in", () => page.$(".mobile-menu"));
  }
  record(
    "Signed in on the phone",
    true,
    screen === "app" ? "session kept" : "logged in",
  );

  await tap(page, ".mobile-menu");
  await wait(600);
  await tap(page, ".navigation-drawer nav button", "Đơn hàng");
  await until(page, "order cards", () => page.$(".mobile-order"));
  await shot(page, "02-orders");
  const card = await page.evaluateHandle((order) => {
    return [...document.querySelectorAll(".mobile-order")].find((a) =>
      (a as HTMLElement).innerText.includes(order),
    );
  }, ORDER);
  if (!card.asElement()) throw new Error(`Order ${ORDER} not found`);
  await (card.asElement() as ElementHandle<Element>).evaluate((el) => {
    [...el.querySelectorAll("button")]
      .find((b) => b.innerText.includes("Chi tiết"))
      ?.click();
  });
  await until(page, "order detail", () => page.$(".detail-tabs"));
  await tap(page, ".detail-tabs button", "Kiểm rập");
  await until(page, "pattern tab", () => page.$(".prep-card"));
  record("Opened order detail and the Kiểm rập tab", true);

  // 1. POM chart pasted the way it comes from a tech pack (pipe separated here).
  const sheetCard = (await page.$$(".prep-card"))[0];
  await sheetCard.evaluate((el) => {
    [...el.querySelectorAll("button")]
      .find((b) => /Khai báo|Sửa bảng/.test(b.innerText))
      ?.click();
  });
  await until(page, "chart editor", () => page.$(".pom-editor"));
  await page.evaluate(() => {
    const area = document.querySelector(
      ".prep-card textarea",
    ) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(
      area,
      [
        "POM | Điểm đo | Dung sai | S | M | L (gốc) | XL",
        "1 | Dài váy | 3/8 | 43 | 43 1/2 | 44 | 44 1/2",
        "2 | Rộng vai | 3/8 | 14 1/2 | 15 | 15 1/2 | 16",
        "3 | Vòng ngực | 1/2 | 34 | 36 | 38 | 40",
        "4 | Vòng eo | 1/2 | 27 | 29 | 31 | 33",
        "5 | Vòng mông | 1/2 | 36 | 38 | 40 | 42",
        "6 | Dài tay | 1/4 | 8 | 8 1/4 | 8 1/2 | 8 3/4",
      ].join("\n"),
    );
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tap(page, ".prep-card button", "Đọc bảng");
  await wait(500);
  const rowsRead = await page.$$eval(".pom-editor tbody tr", (r) => r.length);
  record(
    "Pasted POM chart read on the phone",
    rowsRead === 6,
    `${rowsRead} rows`,
  );
  await tap(page, ".prep-card button", "Lưu bảng");
  await until(page, "chart saved", async () => !(await page.$(".pom-editor")));
  await shot(page, "03-chart-saved");

  // 2. Measure round: tap "Đạt" on most points, nudge one with +/− until it is out of tolerance.
  await tap(page, ".confirm-choices button", "Nhập trên web");
  await until(page, "check form", () => page.$(".measure-entry"));
  const entries = await page.$$eval(".measure-entry", (e) => e.length);
  record(
    "Measure form shows the base size",
    entries === 6,
    `${entries} points`,
  );
  // Old phones can miss a tap while the page re-renders: confirm each tap changed the row, retry once if not.
  const entryClass = (index: number) =>
    page.evaluate(
      (i) => document.querySelectorAll(".measure-entry")[i]?.className || "",
      index,
    );
  for (let i = 1; i < 6; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate((index) => {
        document
          .querySelectorAll(".measure-entry")
          [index].scrollIntoView({ block: "center" });
      }, i);
      await wait(250);
      await (await page.$$(".measure-entry .measure-ok"))[i].tap();
      await wait(300);
      if (/\b(ok|out)\b/.test(await entryClass(i))) break;
    }
  }
  const first = (await page.$$(".measure-entry"))[0];
  await first.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(250);
  const plus = (await first.$$(".measure-input .icon-button"))[1];
  const valueOf = () =>
    first.$eval(".measure-input input", (e) => (e as HTMLInputElement).value);
  for (let i = 0; i < 5; i++) {
    const before = await valueOf();
    for (let attempt = 0; attempt < 3; attempt++) {
      await plus.tap();
      await wait(250);
      if ((await valueOf()) !== before) break;
    }
  }
  const state = await page.$$eval(".measure-entry", (e) =>
    e.map((x) => x.className.replace("measure-entry ", "")),
  );
  record(
    "+/− and Đạt buttons work with touch",
    state[0] === "out" && state.slice(1).every((s) => s === "ok"),
    state.join(","),
  );
  await shot(page, "04-measuring");
  const summary = await page.$eval(
    ".measure-summary",
    (e) => (e as HTMLElement).innerText,
  );
  record(
    "Summary counts out-of-tolerance points",
    /Vượt dung sai: 1/.test(summary),
    summary,
  );
  await saveAndWait(page);
  record(
    "Measured round saved",
    (await page.$$eval(".prep-round summary", (s) => s.length)) === 1,
  );

  // 3. Photo round: photo of the filled sheet taken from the phone's own camera roll is not
  //    available over CDP, so a generated image is attached through the same file input.
  // The three ways to confirm are visible on the card before any form is opened.
  const choices = await page.$$eval(".confirm-choices button", (b) =>
    b.map((x) => (x as HTMLElement).innerText.trim()),
  );
  record(
    "Card offers three ways to confirm before opening a form",
    choices.length === 3,
    choices.join(" | "),
  );
  await tap(page, ".confirm-choices button", "Ảnh chụp bảng đo");
  await until(page, "second form", () =>
    page.$('[aria-label="Cách xác nhận"]'),
  );
  const fits = await page.$eval('[aria-label="Cách xác nhận"]', (el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
    clipped: [...el.querySelectorAll("button")].some(
      (b) => b.scrollWidth > b.clientWidth + 1,
    ),
  }));
  record(
    "Three confirmation choices fit the phone width",
    fits.scroll <= fits.client + 1 && !fits.clipped,
    `${fits.scroll}/${fits.client}px`,
  );
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 900, 1200);
    g.fillStyle = "#111";
    g.font = "48px sans-serif";
    g.fillText("Bảng đo rập đã điền (ảnh thử)", 40, 100);
    const blob: Blob = await new Promise((r) =>
      canvas.toBlob((b) => r(b!), "image/jpeg", 0.9),
    );
    const input = document.querySelector(
      'input[aria-label="Chọn ảnh từ thư viện"]',
    ) as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "bang-do.jpg", { type: "image/jpeg" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await until(page, "photo preview", () => page.$(".prep-shot img"));
  await shot(page, "05-photo-mode");
  await saveAndWait(page);
  const rounds = await page.$$eval(".prep-round summary", (s) =>
    s.map((x) => (x as HTMLElement).innerText),
  );
  record(
    "Photo confirmation saved",
    rounds.length === 2 && /Ảnh chụp bảng đo/.test(rounds[0]),
    rounds[0],
  );
  await page.evaluate(() =>
    document.querySelector(".prep-compare")?.scrollIntoView({ block: "start" }),
  );
  await shot(page, "06-history");

  // 4. File round: a generated PDF goes through the same file input a phone would use.
  await tap(page, ".confirm-choices button", "File đính kèm");
  await until(page, "third form", () => page.$('[aria-label="Cách xác nhận"]'));

  await page.evaluate(() => {
    const input = document.querySelector(
      'input[aria-label="Chọn file bảng đo"]',
    ) as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF"], "bang-do-rap.pdf", {
        type: "application/pdf",
      }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await until(page, "file listed", () =>
    page.$(".prep-card form .prep-files li"),
  );
  await shot(page, "07-file-mode");
  await saveAndWait(page);
  const linked = await page.$eval(".prep-round .prep-files a", (a) => ({
    text: (a as HTMLElement).innerText,
    href: a.getAttribute("href") || "",
  }));
  const download = await page.evaluate(async (href) => {
    const r = await fetch(href);
    return { status: r.status, type: r.headers.get("content-type") };
  }, linked.href);
  record(
    "File confirmation saved and downloadable",
    linked.text === "bang-do-rap.pdf" &&
      download.status === 200 &&
      download.type === "application/pdf",
    `${linked.text} → ${download.status}`,
  );
  await page.evaluate(() =>
    document.querySelector(".prep-compare")?.scrollIntoView({ block: "start" }),
  );
  await shot(page, "08-history-after-file");

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
  await browser.disconnect();
  if (failed.length) process.exit(1);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

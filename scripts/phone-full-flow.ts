// Walks one order from creation to the sewing stage on a real Android phone, the way a person would:
// OS-level swipes (adb), touch taps, and text typed through the phone's input method.
//
//   adb -s <serial> reverse tcp:3100 tcp:3100
//   adb -s <serial> forward tcp:9334 localabstract:chrome_devtools_remote
//   PHONE_SERIAL=<serial> PHONE_USER=admin PHONE_PASSWORD=... node --import tsx scripts/phone-full-flow.ts
//
// Use a disposable test database only: the script creates an order, assignments, checks and production logs.
// Typing needs ADBKeyboard as the phone's input method (com.android.adbkeyboard/.AdbIME).
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PHONE_BASE_URL || "http://localhost:3100";
const DEVTOOLS = process.env.PHONE_DEVTOOLS || "http://127.0.0.1:9334";
const OUT = process.env.PHONE_OUT || path.join("screenshots", "phone-flow");
const USER = process.env.PHONE_USER || "";
const PASSWORD = process.env.PHONE_PASSWORD || "";
const SERIAL = process.env.PHONE_SERIAL || "";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const adb = (...args: string[]) =>
  execFileSync("adb", ["-s", SERIAL, ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
const steps: { step: string; ok: boolean; note?: string }[] = [];
function record(step: string, ok: boolean, note?: string) {
  steps.push({ step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${note ? ` — ${note}` : ""}`);
}
let shotIndex = 0;
async function shot(name: string) {
  mkdirSync(OUT, { recursive: true });
  await wait(500);
  shotIndex += 1;
  writeFileSync(
    path.join(OUT, `${String(shotIndex).padStart(2, "0")}-${name}.png`),
    adb("exec-out", "screencap", "-p"),
  );
}
async function until<T>(
  what: string,
  fn: () => Promise<T | null | false | undefined>,
  timeout = 25000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
/** First visible element matching the selector whose text starts with (or contains) the given text. */
async function locate(page: Page, selector: string, text?: string) {
  for (const el of await page.$$(selector)) {
    const match = await el.evaluate((node, text) => {
      const item = node as HTMLElement;
      if (item.offsetParent === null) return false;
      if (!text) return true;
      return (item.innerText || item.getAttribute("aria-label") || "")
        .trim()
        .replace(/\s+/g, " ")
        .includes(text);
    }, text);
    if (match) return el;
  }
  return null;
}
/** Where the element is on screen and whether a finger at its centre would actually hit it. */
const placement = (el: ElementHandle<Element>) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      y,
      height: window.innerHeight,
      hit: !!top && (top === node || node.contains(top) || top.contains(node)),
    };
  });
let swipes = 0;
/** Swipes the screen with a real OS gesture until the element can be touched. */
async function swipeTo(el: ElementHandle<Element>, label: string) {
  for (let i = 0; i < 30; i++) {
    const p = await placement(el);
    // "hit" already rules out anything hidden under the sticky header or a bottom bar.
    if (p.hit && p.y > 8 && p.y < p.height - 8) return true;
    // Finger moves up to reveal content below, down to reveal content above.
    const down = p.y > p.height / 2;
    const distance = Math.min(
      700,
      Math.max(220, Math.abs(p.y - p.height / 2) * 2.2),
    );
    const from = down ? 1300 : 700;
    const to = down ? from - distance : from + distance;
    adb(
      "shell",
      "input",
      "swipe",
      "540",
      String(from),
      "540",
      String(Math.round(to)),
      "260",
    );
    swipes += 1;
    await wait(650);
  }
  record(`Reach "${label}" by swiping`, false, "30 swipes were not enough");
  await el.evaluate((node) =>
    (node as HTMLElement).scrollIntoView({ block: "center" }),
  );
  return false;
}
async function touch(page: Page, selector: string, text?: string) {
  if (process.env.PHONE_TRACE) console.log(`  touch ${selector} ${text || ""}`);
  // Put the keyboard away first, as a person does: it shifts the layout when it closes.
  if (
    await page.evaluate(
      "document.activeElement && document.activeElement.matches('input, textarea') ? (document.activeElement.blur(), true) : false",
    )
  )
    await wait(700);
  for (let attempt = 0; ; attempt++) {
    const el = await until(`element ${selector} ${text || ""}`, () =>
      locate(page, selector, text),
    );
    try {
      await swipeTo(el, text || selector);
      await wait(150);
      await el.tap();
      await wait(450);
      return el;
    } catch (error) {
      // The element was replaced while a form was opening: look it up again.
      if (attempt === 2) throw error;
      await wait(900);
    }
  }
}
/** Types through the phone's input method (ADBKeyboard), so the app receives real key input. */
async function typeText(
  page: Page,
  selector: string,
  text: string,
  label: string,
  shown = text,
) {
  if (process.env.PHONE_TRACE) console.log(`  type ${label}`);
  const el = await until(`field ${label}`, () => locate(page, selector));
  await swipeTo(el, label);
  await el.tap();
  await wait(350);
  adb("shell", "am", "broadcast", "-a", "ADB_CLEAR_TEXT");
  await wait(200);
  adb(
    "shell",
    "am",
    "broadcast",
    "-a",
    "ADB_INPUT_B64",
    "--es",
    "msg",
    Buffer.from(text, "utf8").toString("base64"),
  );
  await wait(450);
  const value = await el.evaluate(
    (node) => (node as HTMLInputElement | HTMLTextAreaElement).value,
  );
  if (value !== shown)
    record(`Type "${label}"`, false, `field holds "${value.slice(0, 40)}"`);
  return value === shown;
}
/** Native pickers (select, date) open an Android dialog the script cannot drive, so the value is set directly. */
async function choose(
  page: Page,
  selector: string,
  value: string,
  label: string,
) {
  const el = await until(`picker ${label}`, () => locate(page, selector));
  await swipeTo(el, label);
  await el.evaluate((node, value) => {
    const input = node as HTMLSelectElement | HTMLInputElement;
    const proto =
      input.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await wait(300);
}
const text = (page: Page, selector: string) =>
  page.$eval(selector, (e) => (e as HTMLElement).innerText).catch(() => "");
const alerts = (page: Page) =>
  page.$$eval('[role="alert"], .entry-guidance', (list) =>
    list.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean),
  );
async function openTab(page: Page, name: string) {
  await touch(page, ".detail-tabs button", name);
  await until(
    `tab ${name}`,
    async () =>
      await page.$$eval(
        ".detail-tabs button",
        (buttons, name) =>
          buttons.some(
            (b) =>
              (b as HTMLElement).innerText.trim() === name &&
              b.getAttribute("aria-pressed") === "true",
          ),
        name,
      ),
  );
  await wait(700);
}
const stageLine = async (page: Page) =>
  (await text(page, ".order-detail-heading")).split("\n").pop() || "";

async function main() {
  if (!USER || !PASSWORD || !SERIAL)
    throw new Error("Set PHONE_SERIAL, PHONE_USER and PHONE_PASSWORD.");
  const browser = await puppeteer.connect({
    browserURL: DEVTOOLS,
    defaultViewport: null,
  });
  const page = (await browser.pages()).find((p) => p.url().startsWith(BASE));
  if (!page) throw new Error(`Open ${BASE} in Chrome on the phone first.`);
  await page.bringToFront();
  await page.goto(BASE, { waitUntil: "networkidle2" });

  // 1. Sign in
  const landed = () =>
    until(
      "login form or app",
      async () =>
        (await page.$(".mobile-menu"))
          ? "app"
          : (await page.$('input[type="password"]'))
            ? "login"
            : null,
      12000,
    );
  // A dev server sometimes leaves the first load stuck on the session check; one reload clears it.
  const screen = await landed().catch(async () => {
    await page.reload({ waitUntil: "networkidle2" });
    return landed();
  });
  await wait(2500);
  if (screen === "login") {
    if (/Tạo tài khoản/.test(await text(page, ".auth-card h2")))
      await touch(page, ".auth-switch");
    await typeText(
      page,
      'form input:not([type="password"])',
      USER,
      "Tên đăng nhập",
    );
    await typeText(page, 'form input[type="password"]', PASSWORD, "Mật khẩu");
    await shot("login");
    await touch(page, 'form button[type="submit"]', "Đăng nhập");
    // The app reloads once after signing in.
    await wait(3000);
    await until("signed in", () => page.$(".mobile-menu"));
  }
  record(
    "Sign in",
    true,
    screen === "app" ? "session kept" : "typed on the phone",
  );

  // 2. Create an order
  await touch(page, ".mobile-menu");
  await touch(page, ".navigation-drawer nav button", "Đơn hàng");
  await until("orders screen", () => locate(page, "button", "Tạo đơn"));
  await touch(page, "button", "Tạo đơn");
  await until("create form", () => page.$('input[name="customer"]'));
  const stamp = String(Date.now()).slice(-5);
  const product = `Váy thử máy ${stamp}`;
  await typeText(
    page,
    'input[name="customer"]',
    "Khách thử điện thoại",
    "Khách hàng",
  );
  await typeText(page, 'input[name="product_name"]', product, "Tên sản phẩm");
  await choose(page, 'input[name="deadline"]', "2030-12-31", "Hạn giao");
  await typeText(
    page,
    'input[placeholder="Tên màu / mã vải"]',
    "Hồng",
    "Tên màu",
  );
  const quantity = await until("quantity field", () =>
    locate(page, '.modal-body input[type="number"]'),
  );
  await swipeTo(quantity, "Số lượng");
  await quantity.tap();
  await wait(300);
  // The field starts at 0: go to the end and erase it, as a thumb on the keyboard would.
  adb("shell", "input", "keyevent", "123", "67", "67", "67", "67");
  adb("shell", "am", "broadcast", "-a", "ADB_INPUT_TEXT", "--es", "msg", "20");
  await wait(400);
  await shot("create-order");
  await touch(page, 'button[type="submit"]', "Tạo đơn hàng");
  const created = await until("new order in the list", async () => {
    const cards = await page.$$eval(".mobile-order", (list) =>
      list.map((a) => (a as HTMLElement).innerText),
    );
    const mine = cards.find((c) => c.includes("Váy thử máy"));
    return mine ? mine.split("\n")[0].trim() : null;
  }).catch(async () => {
    record("Create an order", false, (await alerts(page)).join(" | "));
    await shot("create-order-failed");
    throw new Error("Order was not created");
  });
  record("Create an order", true, `${created} · ${product}`);

  // 3. Open the order
  const card = await until("order card", () =>
    locate(page, ".mobile-order", product),
  );
  await swipeTo(card, product);
  const detailButton = await until("detail button", async () => {
    for (const b of await card.$$("button"))
      if (
        (await b.evaluate((n) => (n as HTMLElement).innerText)).includes(
          "Chi tiết",
        )
      )
        return b;
    return null;
  });
  // An old phone sometimes drops a touch: look, and tap again if nothing opened.
  for (
    let attempt = 0;
    attempt < 3 && !(await page.$(".detail-tabs"));
    attempt++
  ) {
    await swipeTo(detailButton, "Chi tiết");
    await wait(400);
    await detailButton.tap();
    await until("order detail", () => page.$(".detail-tabs"), 6000).catch(
      () => null,
    );
  }
  await until("order detail", () => page.$(".detail-tabs"), 3000);
  await shot("detail-opened");
  record("Open order detail", true, await stageLine(page));

  // 4. Assign workers to every stage
  await openTab(page, "Phân công");
  await touch(page, "button", "Phân công nhanh cả bộ phận");
  await wait(1500);
  await shot("assigned");
  const assignNotes = await alerts(page);
  record(
    "Quick-assign every department",
    !assignNotes.some((n) => /không|lỗi|chưa/i.test(n)),
    assignNotes.join(" | ").slice(0, 120) || "no error shown",
  );

  // 5. Pattern check as a written assessment
  await openTab(page, "Kiểm rập");
  await touch(page, ".confirm-choices button", "Nhập trên web");
  await until("check form", () => page.$('[aria-label="Cách nhập"]'));
  await touch(page, '[aria-label="Cách nhập"] button', "Đánh giá bằng chữ");
  await typeText(
    page,
    'textarea[name="notes"]',
    "Rập đủ mảnh, đường may khớp, cho cắt.",
    "Nội dung đánh giá",
  );
  await shot("pattern-text");
  await touch(page, ".prep-card form button", "Lưu kết quả");
  await until("pattern round", () => page.$(".prep-round summary"));
  record(
    "Record a pattern check",
    true,
    await text(page, ".prep-round summary"),
  );

  // 6. Prices are fixed before production: the move to cutting waits for the Cắt rate.
  const gated = await locate(
    page,
    ".prepare-callout button",
    "Hoàn tất chuẩn bị",
  );
  const gatedOff = gated
    ? await gated.evaluate((b) => (b as HTMLButtonElement).disabled)
    : false;
  record(
    "Move to Cắt is held until the Cắt rate is set",
    !!gated && gatedOff,
    gated
      ? gatedOff
        ? ""
        : "button is enabled without a rate"
      : "no button on the check tab",
  );
  await openTab(page, "Tiến độ");
  await typeText(
    page,
    '.rates-setup input[aria-label="Đơn giá Cắt"]',
    "1500",
    "Đơn giá Cắt",
    "1.500",
  );
  await shot("rates-setup");
  await touch(page, ".rates-setup button", "Lưu đơn giá");
  await until("rate saved", () => locate(page, ".rates-setup", "Đang áp dụng"));
  record("Set the Cắt rate on the Tiến độ tab", true, "");
  await openTab(page, "Kiểm rập");
  const offered = await locate(
    page,
    ".prepare-callout button",
    "Hoàn tất chuẩn bị",
  );
  record(
    "Passing check offers the move to Cắt on the same tab",
    !!offered &&
      !(await offered.evaluate((b) => (b as HTMLButtonElement).disabled)),
    "",
  );
  await shot("before-prepare");
  await touch(page, ".prepare-callout button", "Hoàn tất chuẩn bị");
  await wait(2500);
  const afterPrepare = await stageLine(page);
  await shot("after-prepare");
  record(
    "Finish preparation moves the order to Cắt",
    /Cắt/.test(afterPrepare),
    `${afterPrepare} ${(await alerts(page)).join(" | ").slice(0, 140)}`,
  );

  // 7. Record cutting output
  await openTab(page, "Ghi sản lượng");
  await until("worker tiles", () => page.$(".rate-stage-card"));
  await touch(page, ".rate-stage-card");
  await touch(page, "button", "Điền tối đa còn lại");
  await shot("cutting-filled");
  const blocked = await alerts(page);
  const submit = await until("submit button", () =>
    locate(page, 'button[type="submit"]', "Ghi nhận một lần"),
  );
  const disabled = await submit.evaluate(
    (b) => (b as HTMLButtonElement).disabled,
  );
  if (disabled) {
    record(
      "Record cutting output",
      false,
      `button disabled: ${blocked.join(" | ").slice(0, 200)}`,
    );
  } else {
    await swipeTo(submit, "Ghi nhận một lần");
    await submit.tap();
    await wait(3000);
    await shot("cutting-saved");
    const metrics = await text(page, ".department-metrics");
    record(
      "Record cutting output",
      /\b20\/20\b/.test(metrics.split("\n").slice(0, 2).join(" ")),
      `${metrics.replace(/\n/g, " ").slice(0, 80)} ${(await alerts(page)).join(" | ").slice(0, 120)}`,
    );
  }

  // 8. Move to sewing
  await openTab(page, "Tiến độ");
  const next = await locate(page, "button", "Chuyển sang May");
  if (!next) {
    await shot("no-next-stage");
    record(
      "Move to May",
      false,
      `no "Chuyển sang May" button; ${await stageLine(page)}`,
    );
  } else {
    await swipeTo(next, "Chuyển sang May");
    await next.tap();
    await wait(2500);
    await shot("after-move");
    const stage = await stageLine(page);
    record(
      "Move to May",
      /May/.test(stage),
      `${stage} ${(await alerts(page)).join(" | ").slice(0, 140)}`,
    );
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(
    `\n${steps.length - failed.length}/${steps.length} steps passed, ${swipes} real swipes`,
  );
  await browser.disconnect();
  if (failed.length) process.exit(1);
}
main().catch((error) => {
  console.error(error?.stack || String(error));
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, "99-stopped-here.png"),
      adb("exec-out", "screencap", "-p"),
    );
  } catch {}
  process.exit(1);
});

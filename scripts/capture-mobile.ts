import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "screenshots");

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: "/home/dragonccm/.local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });

  // 1. Auth screen
  const isAuth = await page.$('input[name="username"]');
  if (isAuth) {
    console.log("Capturing 01_auth.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_auth.png") });

    console.log("Logging in as admin...");
    await page.type('input[name="username"]', "admin");
    if (!process.env.QA_PASSWORD) throw new Error("QA_PASSWORD is required");
    await page.type('input[name="password"]', process.env.QA_PASSWORD);
    await page.click('button[type="submit"]');
    await wait(1800);
  }

  // 2. Overview
  console.log("Capturing 02_overview.png...");
  await wait(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_overview.png") });

  // 3. Sidebar Drawer
  console.log("Capturing 03_sidebar_drawer.png...");
  const menuBtn = await page.$('button[aria-label="Mở điều hướng"], .mobile-menu');
  if (menuBtn) {
    await menuBtn.click();
    await wait(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_sidebar_drawer.png") });
    // Close drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.navigation-drawer button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);
  }

  // Helper function to switch tab via drawer
  async function captureTab(tabLabel: string, filename: string) {
    console.log(`Navigating to tab "${tabLabel}"...`);
    const menu = await page.$('button[aria-label="Mở điều hướng"], .mobile-menu');
    if (menu) {
      await menu.click();
      await wait(400);
    }
    await page.evaluate((label) => {
      const buttons = Array.from(document.querySelectorAll("nav[aria-label='Điều hướng điện thoại'] button, .navigation-drawer button"));
      const btn = buttons.find((b) => b.textContent?.includes(label));
      if (btn) {
        (btn as HTMLElement).click();
        return true;
      }
      return false;
    }, tabLabel);
    await wait(700);

    // Make sure drawer is completely closed
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.navigation-drawer button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);

    console.log(`Capturing ${filename}...`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) });
  }

  // 4. Orders view
  await captureTab("Đơn hàng", "04_orders.png");

  // 5. Order Detail Modal
  console.log("Opening order detail modal...");
  const openedDetail = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const viewBtn = btns.find((b) => b.textContent?.trim() === "Xem chi tiết" || b.textContent?.includes("LU-001"));
    if (viewBtn) {
      (viewBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  if (openedDetail) {
    await wait(700);
    console.log("Capturing 05_order_detail.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_order_detail.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content:not(.navigation-drawer) button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);
  }

  // 6. Create Order Modal
  console.log("Opening create order modal...");
  const openedCreate = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const createBtn = btns.find((b) => b.textContent?.includes("Tạo đơn hàng") || b.textContent?.includes("Tạo đơn"));
    if (createBtn) {
      (createBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  if (openedCreate) {
    await wait(700);
    console.log("Capturing 06_create_order.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_create_order.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content:not(.navigation-drawer) button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);
  }

  // 7. Fast Production Modal
  console.log("Opening fast production modal...");
  const openedProd = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const prodBtn = btns.find((b) => b.textContent?.includes("Nhập sản lượng") || b.textContent?.includes("Ghi nhận công việc"));
    if (prodBtn) {
      (prodBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  if (openedProd) {
    await wait(700);
    console.log("Capturing 07_fast_production.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_fast_production.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content:not(.navigation-drawer) button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);
  }

  // 8. Lines view
  await captureTab("Bộ phận", "08_lines.png");

  // 9. Payroll view
  await captureTab("Lương sản phẩm", "09_payroll.png");



  // 12. Rates view
  await captureTab("Đơn giá", "12_rates.png");

  // 13. Backup view
  await captureTab("Sao lưu", "13_backup.png");

  // 14. User Guide view
  await captureTab("Hướng dẫn", "14_user_guide.png");

  console.log("All 12 mobile screenshots captured successfully!");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "screenshots", "pc");

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
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  console.log("Navigating to http://localhost:3000 on PC viewport (1440x900)...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });

  // 1. Auth screen (if logged out or logout first)
  const isAuth = await page.$('input[name="username"]');
  if (isAuth) {
    console.log("Capturing 01_auth.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_auth.png") });

    console.log("Logging in as admin...");
    await page.type('input[name="username"]', "admin");
    if (!process.env.QA_PASSWORD) throw new Error("QA_PASSWORD is required");
    await page.type('input[name="password"]', process.env.QA_PASSWORD);
    await page.click('button[type="submit"]');
    await wait(2000);
  }

  // 2. Overview
  console.log("Capturing 02_overview.png...");
  await wait(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_overview.png") });

  // Helper function to switch tab via desktop sidebar
  async function captureTab(tabLabel: string, filename: string) {
    console.log(`Navigating to desktop tab "${tabLabel}"...`);
    const clicked = await page.evaluate((label) => {
      const buttons = Array.from(document.querySelectorAll("aside.sidebar nav button"));
      const btn = buttons.find((b) => b.textContent?.includes(label));
      if (btn) {
        (btn as HTMLElement).click();
        return true;
      }
      return false;
    }, tabLabel);
    if (!clicked) {
      console.warn(`Could not find desktop sidebar tab "${tabLabel}"!`);
    }
    await wait(700);
    console.log(`Capturing ${filename}...`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) });
  }

  // 3. Orders view (List mode)
  await captureTab("Đơn hàng", "03_orders_list.png");

  // 4. Orders view (Kanban mode)
  console.log("Switching to Kanban view...");
  const switchedKanban = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".order-workspace .segmented button"));
    const kanbanBtn = buttons.find((b) => b.textContent?.includes("Kanban"));
    if (kanbanBtn) {
      (kanbanBtn as HTMLElement).click();
      return true;
    }
    return false;
  });
  if (switchedKanban) {
    await wait(600);
    console.log("Capturing 04_orders_kanban.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_orders_kanban.png") });
    // Switch back to List
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".order-workspace .segmented button"));
      const listBtn = buttons.find((b) => b.textContent?.includes("Danh sách"));
      if (listBtn) (listBtn as HTMLElement).click();
    });
    await wait(400);
  }

  // 5. Order Detail Modal - Tab Màu & Size
  console.log("Opening order detail modal LU-001...");
  const openedDetail = await page.evaluate(() => {
    const viewBtn = document.querySelector("button[aria-label*='LU-001'], table tbody tr button") as HTMLElement;
    if (viewBtn) {
      viewBtn.click();
      return true;
    }
    // Fallback: search for button containing LU-001
    const allBtns = Array.from(document.querySelectorAll("button"));
    const match = allBtns.find((b) => b.textContent?.includes("LU-001") || b.textContent?.includes("Xem chi tiết"));
    if (match) {
      match.click();
      return true;
    }
    return false;
  });
  if (openedDetail) {
    await wait(700);
    console.log("Capturing 05_order_detail_matrix.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_order_detail_matrix.png") });

    // 6. Switch to Tab Công đoạn inside Order Detail Modal
    console.log("Switching to Tab Công đoạn in Order Detail...");
    const switchedStageTab = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll(".detail-tabs button"));
      const stageTab = tabs.find((b) => b.textContent?.includes("Công đoạn"));
      if (stageTab) {
        (stageTab as HTMLElement).click();
        return true;
      }
      return false;
    });
    if (switchedStageTab) {
      await wait(600);
      console.log("Capturing 06_order_detail_stages.png...");
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_order_detail_stages.png") });
    }

    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(500);
  }

  // 7. Create Order Modal
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
    console.log("Capturing 07_create_order.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_create_order.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(500);
  }

  // 8. Fast Production Modal (Nhập sản lượng)
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
    console.log("Capturing 08_fast_production.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_fast_production.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(500);
  }

  // 9. Lines view
  await captureTab("Chuyền sản xuất", "09_lines.png");

  // 10. Production view
  await captureTab("Sản lượng", "10_production.png");

  // 11. Payroll view
  await captureTab("Lương sản phẩm", "11_payroll.png");

  // 12. QC view
  await captureTab("Kiểm soát chất lượng", "12_qc.png");

  // 13. Delivery view
  await captureTab("Giao hàng", "13_delivery.png");

  // 14. Rates view
  await captureTab("Đơn giá", "14_rates.png");

  // 15. Admin Accounts view
  await captureTab("Tài khoản", "15_admin_accounts.png");

  // 16. Admin Roles view
  await captureTab("Vai trò", "16_admin_roles.png");

  // 17. Backup view
  await captureTab("Sao lưu", "17_backup.png");

  // 18. Audit view
  await captureTab("Nhật ký", "18_audit.png");

  // 19. User Guide view
  await captureTab("Xem hướng dẫn", "19_user_guide.png");

  // 20. User Profile Modal
  console.log("Opening profile dialog...");
  const openedProfile = await page.evaluate(() => {
    const profileBtn = document.querySelector(".profile-button") as HTMLElement;
    if (profileBtn) {
      profileBtn.click();
      return true;
    }
    return false;
  });
  if (openedProfile) {
    await wait(600);
    console.log("Capturing 20_user_profile.png...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "20_user_profile.png") });
    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-content button[aria-label="Đóng hộp thoại"]') as HTMLElement;
      if (closeBtn) closeBtn.click();
    });
    await wait(400);
  }

  await browser.close();
  console.log("All desktop PC screenshots captured successfully in screenshots/pc/!");
}

main().catch((e) => {
  console.error("PC Screenshot Capture Failed:", e);
  process.exit(1);
});

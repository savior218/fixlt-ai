/**
 * 阶段十验收截图脚本（使用本机 Chrome，不下载额外浏览器）
 * 运行：npm run capture:stage10（需先启动前端 5173 与后端 8000）
 * 输出：../../.. / screenshots/阶段十_*.png
 * 说明：结果页 / 报告页通过 public/__stage10_seed.html 写入一条“模板演示”记录后跳转，
 *      仅用于截图与布局核验，不修改真实用户数据。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../../screenshots");
const BASE = "http://127.0.0.1:5173";
const TARGET = "/diagnosis/diag-demo-0001";
const SEED = fs.readFileSync(path.join(__dirname, "stage10-fixture.json"), "utf8");
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

const results = [];

async function openSeeded(browser, viewport, next) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  await ctx.addInitScript((seed) => {
    window.localStorage.setItem("fixitai-diagnosis", seed);
  }, SEED);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${next}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function metrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) {
        clipped.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 40)}`);
      }
    }
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      clipped: clipped.slice(0, 5),
    };
  });
}

async function shoot(browser, viewport, next, file, options = {}) {
  const { ctx, page } = await openSeeded(browser, viewport, next);
  if (options.beforeShot) await options.beforeShot(page);
  const m = await metrics(page);
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
  results.push({ file, viewport: viewport.name, ...m });
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    for (const vp of VIEWPORTS) {
      await shoot(browser, vp, `${TARGET}/result`, `阶段十_结果页_${vp.name}.png`);
      await shoot(browser, vp, `${TARGET}/report`, `阶段十_报告页_${vp.name}.png`);
    }

    // 长辈模式结果页（390）
    await shoot(browser, VIEWPORTS[0], `${TARGET}/result`, "阶段十_结果页_长辈模式_390x844.png", {
      beforeShot: async (page) => {
        await page.getByLabel("切换长辈关怀模式").click();
        await page.waitForTimeout(400);
      },
    });

    // 移动端抽屉导航
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        locale: "zh-CN",
      });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.getByLabel("打开导航菜单").click();
      await page.waitForTimeout(500);
      const m = await metrics(page);
      await page.screenshot({ path: path.join(OUT_DIR, "阶段十_移动端抽屉导航_390x844.png"), fullPage: false });
      results.push({ file: "阶段十_移动端抽屉导航_390x844.png", viewport: "390x844", ...m });
      await ctx.close();
    }

    // 移动端添加设备弹窗
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        locale: "zh-CN",
      });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/devices`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "添加设备" }).first().click();
      await page.waitForTimeout(400);
      const m = await metrics(page);
      await page.screenshot({ path: path.join(OUT_DIR, "阶段十_移动端添加设备弹窗_390x844.png"), fullPage: false });
      results.push({ file: "阶段十_移动端添加设备弹窗_390x844.png", viewport: "390x844", ...m });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.horizontalOverflow || r.clipped.length)) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

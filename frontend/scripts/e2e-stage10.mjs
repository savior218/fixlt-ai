/**
 * 阶段十移动端关键流程验收（390x844，真实浏览器 + 真实后端，AI 未配置）
 * 运行：npm run e2e:stage10（需先启动前后端）
 * 覆盖：失败提示 → 主动模板演示 → 来源标识 → 保存档案来源保留 → 高风险拦截
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../../screenshots");
const BASE = "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const VIEWPORT = { width: 390, height: 844 };

const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      overflow: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

async function runFlow(browser) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/diagnose`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /空调/ }).first().click();
  await page.getByRole("button", { name: /制冷效果变差/ }).first().click();
  await page.getByRole("button", { name: "没洗过" }).click();
  await page.getByRole("button", { name: "有一点，但不凉" }).click();

  await page.getByText("诊断未生成，未使用模板冒充 AI").waitFor({ timeout: 15_000 });
  const failureText = await page.getByText("AI 服务尚未配置，暂时无法生成真实诊断。").isVisible();
  record("AI 失败明确提示且不冒充成功", failureText, "失败卡片可见");
  const m1 = await overflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT_DIR, "阶段十_移动端_AI失败与模板入口_390x844.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /查看模板演示（非 AI）/ }).click();
  await page.waitForURL("**/result", { timeout: 10_000 });
  await page.getByText("模板演示（非 AI）").first().waitFor({ timeout: 10_000 });
  record("主动选择模板后来源明确", true, page.url());
  const m2 = await overflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT_DIR, "阶段十_移动端_模板结果与来源_390x844.png"),
    fullPage: true,
  });

  // 保存到维修档案后来源仍保留
  await page.getByRole("button", { name: /保存维修记录/ }).click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  // 本次流程从类别进入，未关联具体设备，记录名称为“未关联设备”
  const row = page.getByRole("button", { name: /未关联设备/ }).first();
  await row.waitFor({ timeout: 10_000 });
  await row.click();
  await page.waitForTimeout(300);
  const sourceInRecord = await page.getByText("模板演示（非 AI）").first().isVisible();
  record("模板记录保存后来源标识保留", sourceInRecord, "维修档案展开详情");

  await ctx.close();
  return { m1, m2 };
}

async function runHighRisk(browser) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/diagnose`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /空调/ }).first().click();
  await page.getByRole("button", { name: /其他问题，直接描述/ }).click();
  await page.locator("textarea").fill("空调冒烟了，还有焦糊味");
  await page.getByRole("button", { name: /开始 AI 问诊/ }).click();
  await page.getByText(/存在起火风险/).waitFor({ timeout: 10_000 });
  const m = await overflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT_DIR, "阶段十_移动端_高风险拦截_390x844.png"),
    fullPage: true,
  });
  record("高风险输入在移动端被拦截", true, "存在起火风险");
  await ctx.close();
  return m;
}

async function runDrawerResize(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("打开导航菜单").click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({
    overflow: document.body.style.overflow,
    dialog: document.querySelector('[role="dialog"][aria-label="主导航菜单"]') !== null,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    overflow: document.body.style.overflow,
    dialog: document.querySelector('[role="dialog"][aria-label="主导航菜单"]') !== null,
  }));
  record(
    "抽屉打开后切到桌面宽度：关闭抽屉并解除滚动锁定",
    before.overflow === "hidden" && before.dialog && !after.dialog && after.overflow === "",
    JSON.stringify({ before, after })
  );
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const m = await runFlow(browser);
    await runHighRisk(browser);
    await runDrawerResize(browser);
    console.log(JSON.stringify({ results, overflow: m }, null, 2));
    if (results.some((r) => !r.pass) || m.m1.overflow || m.m2.overflow) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

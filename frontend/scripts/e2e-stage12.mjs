/**
 * 阶段十二浏览器验收（真实浏览器 + 真实后端）
 * 运行：先启动前后端，再执行 npm run e2e:stage12
 * 覆盖：注册→诊断→保存报告→保存维修记录→刷新→另一浏览器登录读取→B 账号隔离→
 *       验证结果同步→游客只读→本机历史主动导入（幂等）→三端布局
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SUFFIX = String(Date.now()).slice(-6);
const A = { name: `s12A${SUFFIX}`, pwd: "E2ePass123" };
const B = { name: `s12B${SUFFIX}`, pwd: "E2ePass123" };
const C = { name: `s12C${SUFFIX}`, pwd: "E2ePass123" };
const A_NICK = "验收账号A";

const results = [];
function record(name, pass, evidence = "") {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${evidence}`);
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

async function register(page, user, nickname) {
  await page.goto(`${BASE}/login?mode=register`, { waitUntil: "networkidle" });
  await page.getByLabel("用户名").fill(user.name);
  await page.getByLabel("昵称").fill(nickname);
  await page.getByLabel("登录密码").fill(user.pwd);
  await page.getByLabel("确认密码").fill(user.pwd);
  await page.getByRole("button", { name: /注册并登录/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "登录" }).click();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** 生成一次模板诊断（本地未配置 AI 时，模板是明确的非 AI 演示来源） */
async function runTemplateDiagnosis(page) {
  await page.goto(`${BASE}/diagnose`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^空调/ }).first().click();
  await page.getByRole("button", { name: /制冷效果变差/ }).first().click();

  const input = page.getByPlaceholder(/请输入您的问题|也可以打字/);
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(700);
    if (await input.isDisabled()) break;
    await input.fill("不清楚");
    await page.getByRole("button", { name: "发送" }).click({ timeout: 2000 }).catch(() => {});
  }

  const templateBtn = page.getByRole("button", { name: /查看模板演示/ }).first();
  await templateBtn.waitFor({ timeout: 20_000 });
  await templateBtn.click();
  await page.waitForURL((url) => url.pathname.includes("/result"), {
    timeout: 15_000,
  });
  const id = page.url().match(/diagnosis\/(.+)\/result/)?.[1];
  return id;
}

async function saveReportAndRepair(page) {
  await page.getByRole("button", { name: /保存报告到云端/ }).click();
  await page.getByText("已保存到云端").first().waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /保存维修记录/ }).click();
  await page.getByRole("button", { name: /已保存维修记录/ }).waitFor({
    timeout: 15_000,
  });
}

async function api(page, pathname) {
  return page.evaluate(async (p) => {
    const resp = await fetch(p, { credentials: "include" });
    let body = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }
    return { status: resp.status, body };
  }, pathname);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  /* ---------- A：注册 → 诊断 → 保存报告/维修记录 → 刷新 ---------- */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageA = await ctxA.newPage();
  await register(pageA, A, A_NICK);
  const diagnosisId = await runTemplateDiagnosis(pageA);
  await saveReportAndRepair(pageA);
  record("A 保存报告与维修记录", !!diagnosisId, `diagnosis=${diagnosisId}`);

  const listA = await api(pageA, "/api/diagnoses");
  const repairA = await api(pageA, "/api/repairs");
  const reportId = listA.body?.[0]?.id;
  const repairId = repairA.body?.[0]?.id;
  record(
    "服务端已保存报告与维修记录",
    listA.status === 200 && listA.body.length === 1 && repairA.body.length === 1,
    `reports=${listA.body?.length} repairs=${repairA.body?.length}`
  );
  record(
    "模板来源与未知信息完整保留",
    listA.body?.[0]?.source === "template" &&
      listA.body?.[0]?.verified === false &&
      (listA.body?.[0]?.qa ?? []).some((q) => q.unknown === true) &&
      !!listA.body?.[0]?.content?.elder,
    `source=${listA.body?.[0]?.source} elder=${!!listA.body?.[0]?.content?.elder}`
  );

  await pageA.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  await pageA.getByText(/诊断报告（1）/).waitFor({ timeout: 10_000 });
  record("维修档案页展示已保存报告", true);

  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.getByText(/诊断报告（1）/).waitFor({ timeout: 10_000 });
  record("刷新后报告仍在", true);

  /* ---------- B：看不到 A 的数据，猜 ID 也读不到 ---------- */
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = await ctxB.newPage();
  await register(pageB, B, "验收账号B");
  const listB = await api(pageB, "/api/diagnoses");
  const repB = await api(pageB, "/api/repairs");
  const guessReport = await api(pageB, `/api/diagnoses/${reportId}`);
  const guessRepair = await api(pageB, `/api/repairs/${repairId}`);
  record(
    "B 列表为空且猜 ID 均为 404",
    listB.body.length === 0 &&
      repB.body.length === 0 &&
      guessReport.status === 404 &&
      guessRepair.status === 404,
    `list=${listB.body.length} report=${guessReport.status} repair=${guessRepair.status}`
  );
  await pageB.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  record(
    "B 页面不显示 A 的报告与维修记录",
    (await pageB.getByText(/诊断报告（/).count()) === 0 &&
      (await pageB.getByText("暂无维修记录").count()) > 0,
  );

  /* ---------- A 在另一浏览器登录 → 读取同一批数据 ---------- */
  const ctxA2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA2 = await ctxA2.newPage();
  await login(pageA2, A.name, A.pwd);
  await pageA2.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  await pageA2.getByText(`诊断报告（1）`).waitFor({ timeout: 10_000 });
  await pageA2
    .getByText(/制冷效果变差/)
    .first()
    .waitFor({ timeout: 10_000 });
  record("另一浏览器登录 A 可读取报告与维修记录", true);

  // 打开报告详情（跨浏览器可读）
  await pageA2.getByText(/诊断报告（1）/).scrollIntoViewIfNeeded();
  await pageA2.getByRole("link", { name: /空调.*制冷效果变差|未关联设备.*制冷效果变差/ }).first().click();
  await pageA2.getByText("诊断报告").first().waitFor({ timeout: 10_000 });
  record("跨浏览器打开诊断报告详情", true);

  /* ---------- 更新维修验证结果并同步 ---------- */
  await pageA2.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  await pageA2.getByRole("button", { name: /制冷效果变差/ }).first().click();
  await pageA2.getByRole("button", { name: "已恢复" }).click();
  await pageA2.getByText(/已更新验证结果：已恢复/).waitFor({ timeout: 10_000 });
  await pageA2.reload({ waitUntil: "networkidle" });
  await pageA2.getByRole("button", { name: /制冷效果变差/ }).first().click();
  record(
    "验证结果刷新后保留（已写入服务端）",
    (await pageA2.getByText(/验证：已恢复/).count()) > 0
  );

  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.getByRole("button", { name: /制冷效果变差/ }).first().click();
  record(
    "另一浏览器看到最新验证状态",
    (await pageA.getByText(/验证：已恢复/).count()) > 0
  );

  /* ---------- 手机 / 平板 / 桌面布局 ---------- */
  for (const [label, width, height] of [
    ["手机", 390, 844],
    ["平板", 820, 1180],
    ["桌面", 1280, 900],
  ]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/records`, { waitUntil: "networkidle" });
    const r1 = await overflow(page);
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    const r2 = await overflow(page);
    record(`${label}端页面无横向溢出`, !r1.overflow && !r2.overflow);
    await ctx.close();
  }

  /* ---------- 游客：只读演示不写入账号数据 ---------- */
  const ctxGuest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageGuest = await ctxGuest.newPage();
  const guestReport = await runTemplateDiagnosis(pageGuest);
  record("游客可生成本地模板诊断", !!guestReport);
  const guestSave = await api(pageGuest, "/api/diagnoses");
  record(
    "游客无法读取或写入账号报告",
    guestSave.status === 401,
    `status=${guestSave.status}`
  );

  /* ---------- 游客本机历史 → 注册 C → 主动导入（幂等） ---------- */
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageC = await ctxC.newPage();
  await runTemplateDiagnosis(pageC);
  await register(pageC, C, "验收账号C");
  await pageC.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await pageC.getByRole("heading", { name: "本机历史" }).waitFor({ timeout: 10_000 });
  record("登录后显示本机历史导入入口", true);
  await pageC.getByRole("button", { name: "导入本机历史" }).click();
  await pageC.getByRole("button", { name: "确认导入" }).click();
  await pageC.getByText(/已导入 1 份诊断报告/).waitFor({ timeout: 15_000 });
  record("主动导入本机历史成功", true);

  await pageC.goto(`${BASE}/records`, { waitUntil: "networkidle" });
  record(
    "导入记录归属当前账号并标记未经服务端校验",
    (await pageC.getByText(/本机导入（未经服务端校验）/).count()) > 0
  );
  await pageC.reload({ waitUntil: "networkidle" });
  record("导入记录刷新后仍可读（已保存到服务端）", (await pageC.getByText(/本机导入/).count()) > 0);

  // 幂等：同一 client_ref 重复调用导入接口，记录数不增加
  const csrf = (
    await pageC.evaluate(async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      return r.json();
    })
  ).csrf_token;
  const before = (await api(pageC, "/api/diagnoses")).body.length;
  const items = (await api(pageC, "/api/diagnoses")).body
    .filter((d) => d.imported)
    .map((d) => ({
      client_ref: d.client_ref,
      device_id: null,
      device_name: d.device_name,
      category: d.category,
      symptom: d.symptom,
      description: d.description,
      source: "unknown",
      ai_model: null,
      risk_level: d.risk_level,
      risk_rules_version: null,
      qa: d.qa,
      content: d.content,
      imported: true,
    }));
  await pageC.evaluate(
    async ({ items, token }) => {
      await fetch("/api/diagnoses/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ items }),
      });
    },
    { items, token: csrf }
  );
  const after = (await api(pageC, "/api/diagnoses")).body.length;
  record("重复导入不产生重复记录", after === before, `before=${before} after=${after}`);

  /* ---------- 汇总 ---------- */
  const failed = results.filter((r) => !r.pass);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) {
    console.log(failed.map((r) => `- ${r.name}`).join("\n"));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

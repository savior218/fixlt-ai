/**
 * 阶段十三真实浏览器朗读探测（有头 Chrome）
 * 只记录语音合成事件与状态，不保存任何朗读文本或用户内容。
 * 结论边界：脚本能证明“真实调用系统语音并产生 start/end 事件”，
 * 出声是否可被人耳听到仍需在本机试听确认。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE || "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER = { name: "s12A385905", pwd: "E2ePass123" };

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "登录" }).click();
  await page.getByLabel("用户名").fill(USER.name);
  await page.getByLabel("密码").fill(USER.pwd);
  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function waitSpeaking(page, want, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const speaking = await page.evaluate(() => window.speechSynthesis?.speaking ?? false);
    if (speaking === want) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.addInitScript(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    window.__realSpeech = { starts: 0, ends: 0, errors: [], durationMs: null, langs: [] };
    const original = synth.speak.bind(synth);
    synth.speak = (utterance) => {
      const startAt = Date.now();
      window.__realSpeech.langs.push(utterance.lang ?? "");
      utterance.addEventListener("start", () => {
        window.__realSpeech.starts += 1;
        window.__realSpeech.lastStartAt = Date.now();
      });
      utterance.addEventListener("end", () => {
        window.__realSpeech.ends += 1;
        window.__realSpeech.durationMs = Date.now() - startAt;
      });
      utterance.addEventListener("error", (e) => {
        window.__realSpeech.errors.push(e.error);
      });
      original(utterance);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);

  const info = await page.evaluate(() => navigator.userAgent);
  console.log("浏览器：", info);

  await login(page);
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByText("播放测试语音").waitFor({ timeout: 10_000 });

  const voices = await page.evaluate(() => {
    const list = window.speechSynthesis?.getVoices?.() ?? [];
    return {
      total: list.length,
      zh: list.filter((v) => /zh|chinese|mandarin|中文|普通话|国语/i.test(`${v.lang} ${v.name}`))
        .length,
      chosen: window.__fixitaiSpeech?.getState?.()?.voiceLabel ?? null,
    };
  });
  console.log("系统音色数量：", voices.total, "中文音色：", voices.zh, "选用：", voices.chosen);

  /* 1) 设置页测试语音：真实 start/end 事件与时长 */
  await page.getByRole("button", { name: "播放测试语音" }).click();
  const started = await waitSpeaking(page, true);
  const startEvents = await page.evaluate(() => window.__realSpeech.starts);
  console.log("测试语音 speaking=true：", started, "start 事件：", startEvents);

  const end = Date.now() + 20_000;
  let durationMs = null;
  while (Date.now() < end) {
    const snapshot = await page.evaluate(() => window.__realSpeech);
    if (snapshot.ends > 0) {
      durationMs = snapshot.durationMs;
      break;
    }
    await page.waitForTimeout(200);
  }
  console.log("测试语音自然结束：", durationMs !== null, "时长(ms)：", durationMs);

  /* 2) 业务文案：问诊问题朗读后立即停止 */
  await page.goto(`${BASE}/diagnose`, { waitUntil: "domcontentloaded" });
  const category = page.getByRole("button", { name: /^空调/ }).first();
  const reset = page.getByRole("button", { name: /^重新开始/ }).first();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && (await category.count()) === 0) {
    if ((await reset.count()) > 0) await reset.click();
    await page.waitForTimeout(300);
  }
  await category.waitFor({ timeout: 10_000 });
  await category.click();
  await page.getByRole("button", { name: /制冷效果变差/ }).first().click();
  await page.getByRole("button", { name: /朗读/ }).first().waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /朗读/ }).first().click();
  const questionSpeaking = await waitSpeaking(page, true);
  console.log("问诊问题 speaking=true：", questionSpeaking);
  await page.getByRole("button", { name: /停止朗读/ }).first().click();
  const stopped = await waitSpeaking(page, false, 5_000);
  console.log("问诊问题停止后 speaking=false：", stopped);

  /* 3) 结果页与报告页：生成一份模板演示后分段试听 */
  let reportReady = false;
  try {
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
    await page.waitForURL((url) => url.pathname.includes("/result"), { timeout: 15_000 });
    await page.getByRole("button", { name: "朗读结论" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "朗读结论" }).click();
    console.log("结果页结论 speaking=true：", await waitSpeaking(page, true));
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /停止朗读/ }).first().click();
    console.log("结果页停止后 speaking=false：", await waitSpeaking(page, false, 5_000));

    const reportHref = await page.getByRole("link", { name: /查看完整报告/ }).first().getAttribute("href");
    await page.goto(`${BASE}${reportHref}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "朗读维修建议" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "朗读维修建议" }).click();
    console.log("报告页维修建议 speaking=true：", await waitSpeaking(page, true));
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /停止朗读/ }).first().click();
    console.log("报告页停止后 speaking=false：", await waitSpeaking(page, false, 5_000));
    reportReady = true;
  } catch (error) {
    console.log("模板演示试听未完成：", error.message.split("\n")[0]);
  }

  if (!reportReady) {
    await page.goto(`${BASE}/records`, { waitUntil: "domcontentloaded" });
    const reportLink = page.locator('a[href^="/diagnosis/"]').first();
    if ((await reportLink.count()) === 0) {
      console.log("报告页试听：账号暂无已保存报告，跳过");
    }
  }

  const final = await page.evaluate(() => window.__realSpeech);
  console.log(
    "汇总：starts=",
    final.starts,
    "ends=",
    final.ends,
    "errors=",
    JSON.stringify(final.errors)
  );
  console.log("请在本机听一次：设置页测试语音与报告页结论各朗读 1 段。");
} finally {
  await browser.close();
}

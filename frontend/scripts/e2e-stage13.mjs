/**
 * 阶段十三语音朗读逻辑验收（无头浏览器 + 真实后端）
 * 无头环境无音频设备，这里用可控的语音合成替身验证调用、状态与去重逻辑；
 * 真实出声试听见 scripts/speech-real-check.mjs（有头 Chrome）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE || "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER = { name: "s12A385905", pwd: "E2ePass123" };

const results = [];
function record(name, pass, evidence = "") {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${evidence}`);
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "登录" }).click();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** 清掉上次草稿后重新进入问诊第一步，避免依赖“重新开始”按钮的形态 */
/** 回到问诊第一步：等页面渲染后，有草稿时点“重新开始”，再等待分类卡片出现 */
async function gotoDiagnoseFresh(page) {
  await page.goto(`${BASE}/diagnose`, { waitUntil: "domcontentloaded" });
  const category = page.getByRole("button", { name: /^空调/ }).first();
  const reset = page.getByRole("button", { name: /^重新开始/ }).first();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await category.count()) > 0) break;
    if ((await reset.count()) > 0) {
      await reset.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(200);
  }
  await category.waitFor({ timeout: 10_000 });
}

async function pickAcSymptom(page) {
  await page.getByRole("button", { name: /^空调/ }).first().click();
  await page.getByRole("button", { name: /制冷效果变差/ }).first().click();
}

async function answerAllUnknown(page) {
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
}

async function speechState(page) {
  return page.evaluate(() => window.__fixitaiSpeech?.getState?.() ?? null);
}

async function isSpeaking(page) {
  const state = await speechState(page);
  return state?.status === "speaking";
}

async function lastSpoken(page) {
  return page.evaluate(() => window.__lastSpoken ?? "");
}

async function stopActiveButtons(page) {
  return page.locator('button[aria-pressed="true"]').count();
}

/** 点击朗读并等待进入播放状态，返回实际朗读文本 */
async function playAndCapture(page, name) {
  await page.getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: /停止朗读/ }).first().waitFor({ timeout: 5_000 });
  await page.waitForTimeout(150);
  return lastSpoken(page);
}

async function stopAll(page) {
  const stop = page.getByRole("button", { name: /停止朗读/ }).first();
  if ((await stop.count()) > 0) await stop.click();
}

// 无头浏览器：用可控替身验证调用与状态（不出声，也不依赖真实音频设备）
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.speak = (utterance) => {
      window.__lastSpoken = utterance.text;
      window.__spokenCount = (window.__spokenCount ?? 0) + 1;
      setTimeout(() => utterance.onstart?.(), 30);
      setTimeout(() => utterance.onend?.(), 8000);
    };
    synth.cancel = () => undefined;
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await login(page, USER.name, USER.pwd);

  /* ---------- 设置：支持状态、测试语音、语速 ---------- */
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByText("播放测试语音").waitFor({ timeout: 10_000 });
  const statusText = await page.locator('[role="status"]').first().innerText();
  record(
    "设置页显示语音支持状态",
    /语音合成可用|未检测到中文音色|不支持/.test(statusText),
    statusText.slice(0, 40)
  );

  await page.getByRole("button", { name: "播放测试语音" }).click();
  await page.getByRole("button", { name: "停止测试语音" }).waitFor({ timeout: 10_000 });
  record("设置页测试语音真实调用语音合成", (await isSpeaking(page)) === true);
  await page.waitForTimeout(200);
  const testText = await lastSpoken(page);
  record("测试语音包含当前语速", /当前语速为/.test(testText), testText.slice(0, 24));
  await page.getByRole("button", { name: "停止测试语音" }).click();
  await page.waitForTimeout(200);
  record("测试语音可停止", (await isSpeaking(page)) === false);

  const rateBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fixitai-prefs") || "{}")?.state?.speechRate
  );
  const slider = page.getByRole("slider");
  await slider.focus();
  await slider.press("ArrowRight");
  await page.waitForTimeout(300);
  const rateAfter = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fixitai-prefs") || "{}")?.state?.speechRate
  );
  record("语速设置可调整并持久化", rateAfter !== rateBefore, `${rateBefore} → ${rateAfter}`);

  /* ---------- 问诊：当前问题朗读、单段播放 ---------- */
  await gotoDiagnoseFresh(page);
  await pickAcSymptom(page);
  await page.getByRole("button", { name: /朗读/ }).first().waitFor({ timeout: 10_000 });
  record("当前助手问题有朗读入口", (await page.getByRole("button", { name: /朗读/ }).count()) >= 1);

  const questionText = await playAndCapture(page, /^朗读$/);
  record("问诊问题可播放并显示停止", true, questionText.slice(0, 20));
  record("问诊朗读不会读时间/按钮等调试信息", !/^0[0-9]:|发送|问题ID/.test(questionText));

  // 全站同一时间只播放一段
  record("全站同时只播放一段", (await stopActiveButtons(page)) === 1);

  await page.getByRole("button", { name: /停止朗读/ }).first().click();
  await page.waitForTimeout(150);
  record("问诊朗读可停止", !(await isSpeaking(page)));

  // 离开页面停止
  await page.getByRole("button", { name: /朗读/ }).first().click();
  await page.getByRole("button", { name: /停止朗读/ }).first().waitFor({ timeout: 5_000 });
  await page.goto(`${BASE}/records`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  record("离开页面后停止朗读", (await stopActiveButtons(page)) === 0 && !(await isSpeaking(page)));

  /* ---------- 结果页：模板来源、结论/风险/建议 ---------- */
  await gotoDiagnoseFresh(page);
  await pickAcSymptom(page);
  await answerAllUnknown(page);

  record(
    "结果页提供结论与整页重点朗读入口",
    (await page.getByRole("button", { name: "朗读结论" }).count()) === 1 &&
      (await page.getByRole("button", { name: /朗读本页重点|朗读结论、风险和建议/ }).count()) === 1
  );

  const resultText = await playAndCapture(page, "朗读结论");
  record(
    "模板结果先说明并非真实 AI 诊断",
    resultText.startsWith("以下是模板演示建议，并非真实 AI 诊断。"),
    resultText.slice(0, 24)
  );
  await stopAll(page);
  await page.waitForTimeout(150);

  const summaryText = await playAndCapture(page, /朗读本页重点|朗读结论、风险和建议/);
  record(
    "结果页重点朗读包含风险与建议",
    /风险/.test(summaryText) && /建议/.test(summaryText),
    `${summaryText.length} 字`
  );
  await stopAll(page);
  await page.waitForTimeout(150);
  record("结果页可播放并停止", !(await isSpeaking(page)));

  /* ---------- 报告页：分段朗读 ---------- */
  const reportHref = await page.getByRole("link", { name: /查看完整报告/ }).first().getAttribute("href");
  await page.goto(`${BASE}${reportHref}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "朗读结论" }).waitFor({ timeout: 10_000 });
  const reportSpeakCount = await page.getByRole("button", { name: /朗读/ }).count();
  record("报告页提供多个分段朗读入口", reportSpeakCount >= 5, `buttons=${reportSpeakCount}`);
  await page.waitForTimeout(800);
  record("报告页不会默认朗读整份长报告", !(await isSpeaking(page)));

  await playAndCapture(page, "朗读维修建议");
  await playAndCapture(page, "朗读小贴士");
  record(
    "开始新段落时停止旧段落不叠音",
    (await lastSpoken(page)).includes("小贴士") && (await stopActiveButtons(page)) === 1
  );
  await stopAll(page);

  /* ---------- 标准 / 长辈模式读取对应文案 ---------- */
  const standardRiskTitle = /中风险|低风险|高风险/.test(summaryText);
  record("标准模式读取标准风险文案", standardRiskTitle, summaryText.slice(0, 18));

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: /长辈关怀模式/ }).click();
  await page.waitForTimeout(400);
  record("切换到长辈模式后立即停止朗读", !(await isSpeaking(page)));

  await page.goto(`${BASE}/diagnosis/${reportHref.split("/")[2]}/result`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /看看可能是什么原因/ }).click();
  await page.getByRole("button", { name: /看接下来怎么办/ }).click();
  const elderSummary = await playAndCapture(page, /朗读本页重点|朗读结论、风险和建议/);
  record(
    "长辈模式读取长辈版安全文案",
    /别担心|要小心|危险/.test(elderSummary),
    elderSummary.slice(0, 18)
  );
  await stopAll(page);

  // 恢复标准模式
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: /标准模式/ }).click();
  await page.waitForTimeout(300);

  /* ---------- 自动朗读：默认关闭、只触发一次、细节克制 ---------- */
  await gotoDiagnoseFresh(page);
  await pickAcSymptom(page);
  await page.waitForTimeout(900);
  record(
    "自动朗读默认不触发",
    (await page.evaluate(() => sessionStorage.getItem("fixitai-speech-once") ?? "")) === ""
  );

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("switch", { name: /自动朗读/ }).click();
  const autoOn = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fixitai-prefs") || "{}")?.state?.autoRead
  );
  record("自动朗读需用户主动开启", autoOn === true);

  await gotoDiagnoseFresh(page);
  await pickAcSymptom(page);
  await page.waitForTimeout(900);
  const onceKeys = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("fixitai-speech-once") || "[]")
  );
  record(
    "新问题自动朗读一次并记录去重键",
    Array.isArray(onceKeys) &&
      onceKeys.filter((k) => String(k).startsWith("auto:diag")).length === 1 &&
      (await isSpeaking(page)),
    JSON.stringify(onceKeys)
  );

  // 刷新不重复
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  record("刷新后不重复自动播报", !(await isSpeaking(page)));

  // 用户回答不被朗读
  const beforeAnswer = await lastSpoken(page);
  const chip = page.getByRole("button", { name: /没洗过|上个月洗过|不清楚怎么洗/ }).first();
  if ((await chip.count()) > 0) {
    await chip.click();
    await page.waitForTimeout(200);
    record("不朗读用户自己输入的内容", (await lastSpoken(page)) === beforeAnswer);
  } else {
    record("不朗读用户自己输入的内容", true, "无可点选建议，跳过");
  }

  /* ---------- 高风险：自动播报优先，且可手动重复 ---------- */
  await gotoDiagnoseFresh(page);
  await page.getByRole("button", { name: /^空调/ }).first().click();
  await page.getByRole("button", { name: /其他问题，直接描述/ }).first().click();
  await page.getByPlaceholder(/请输入您的问题/).fill("空调冒烟了，还有焦味");
  await page.getByRole("button", { name: /开始 AI 问诊|写好了，开始问诊/ }).click();
  await page.getByRole("alert").waitFor({ timeout: 10_000 });
  record("高风险拦截页展示安全提示", (await page.getByRole("button", { name: "朗读安全提示" }).count()) >= 1);
  await page.waitForTimeout(800);
  record("已开启自动朗读时优先播报安全提示", (await isSpeaking(page)) === true);

  await stopAll(page);
  await page.waitForTimeout(200);
  const safetyText = await playAndCapture(page, "朗读安全提示");
  record("安全提示可手动朗读", /断电|电源|远离/.test(safetyText), safetyText.slice(0, 30));
  await stopAll(page);

  const riskKeys = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("fixitai-speech-once") || "[]")
  );
  record(
    "安全提示自动朗读不循环重复",
    riskKeys.filter((k) => String(k).startsWith("auto:risk")).length === 1
  );

  /* ---------- 关闭语音 / 退出账号后停止 ---------- */
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "播放测试语音" }).click();
  await page.getByRole("button", { name: "停止测试语音" }).waitFor({ timeout: 10_000 });
  await page.getByRole("switch", { name: /语音朗读/ }).click();
  await page.waitForTimeout(400);
  const afterOff = await speechState(page);
  record("关闭语音开关后停止播放", afterOff?.status !== "speaking", afterOff?.status);
  const autoOff = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fixitai-prefs") || "{}")?.state?.autoRead
  );
  record("关闭语音后自动朗读同步关闭", autoOff === false);

  await page.getByRole("switch", { name: /语音朗读/ }).click();
  await page.getByRole("button", { name: "播放测试语音" }).click();
  await page.getByRole("button", { name: "停止测试语音" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "用户菜单" }).click();
  await page.getByRole("menuitem", { name: /退出登录/ }).click();
  await page.waitForTimeout(600);
  record("退出账号后停止朗读", !(await isSpeaking(page)));

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

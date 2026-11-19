/**
 * 动态追问式空调诊断浏览器验收（真实浏览器 + 真实后端）
 * 运行：先启动前后端，再执行 npm run e2e:dynamic
 * 覆盖：不重复问 / 清洗与未清洗路径 / 风量正常与不出风路径 / 连续不知道 /
 *       矛盾澄清 / 中途高风险中止 / 无模型时来源标注 / 语音回答确认 /
 *       刷新恢复 / 重复与过期提交 / 长辈模式与三端布局
 * 说明：当前未配置真实模型，涉及“模型选择”的异常分支由后端单测覆盖；
 *       本脚本用可控语音替身验证语音输入接入，真实中文识别仍需真机验证。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE || "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SUFFIX = String(Date.now()).slice(-6);

const results = [];
function record(name, pass, evidence = "") {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${evidence}`);
}

async function register(page, prefix, init) {
  if (init) await page.context().addInitScript(init);
  const user = { name: `${prefix}${SUFFIX}`, pwd: "E2ePass123" };
  await page.goto(`${BASE}/login?mode=register`, { waitUntil: "networkidle" });
  await page.getByLabel("用户名").fill(user.name);
  await page.getByLabel("昵称").fill("动态问诊验收");
  await page.getByLabel("登录密码").fill(user.pwd);
  await page.getByLabel("确认密码").fill(user.pwd);
  const regResp = page
    .waitForResponse((r) => r.url().includes("/api/auth/register"), { timeout: 20_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /注册并登录/ }).click();
  try {
    await page.waitForFunction(() => !location.pathname.startsWith("/login"), undefined, {
      timeout: 20_000,
    });
  } catch (err) {
    const resp = await regResp;
    console.log(
      "REGISTER_FAIL",
      user.name,
      resp?.status(),
      page.url(),
      (await page.locator("body").innerText()).slice(-300).replace(/\n/g, " | ")
    );
    throw err;
  }
  return user;
}

async function apiGet(page, pathname) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { credentials: "include" });
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  }, pathname);
}

async function apiPost(page, pathname, body) {
  const csrf = await page.evaluate(async () => {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    return (await r.json()).csrf_token;
  });
  return page.evaluate(
    async ({ p, b, c }) => {
      const r = await fetch(p, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": c },
        body: JSON.stringify(b),
      });
      let data = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      return { status: r.status, body: data };
    },
    { p: pathname, b: body, c: csrf }
  );
}

/** 从故障现象卡片进入空调动态追问页 */
async function openDynamic(page) {
  await page.goto(`${BASE}/diagnose`, { waitUntil: "domcontentloaded" });
  const category = page.getByRole("button", { name: /^空调/ }).first();
  const reset = page.getByRole("button", { name: /^重新开始/ }).first();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await category.count()) > 0) break;
    if ((await reset.count()) > 0) await reset.click();
    await page.waitForTimeout(200);
  }
  await category.click();
  await page.getByRole("button", { name: /制冷效果变差/ }).first().click();
  await page.waitForFunction(() => location.pathname === "/interview/ac", undefined, {
    timeout: 15_000,
  });
}

async function startSession(page, description) {
  await page.getByPlaceholder("用一两句话描述空调的情况，也可以点麦克风说").fill(description);
  await page.getByRole("button", { name: "开始动态追问" }).click();
  await page.locator("text=追问（").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

const QUESTION_TEXTS = {
  airflow: "出风口的风量怎么样",
  filter: "过滤网最近清洗过吗",
  mode: "遥控器当前是什么模式",
  outdoor: "室外机风扇或压缩机",
  power: "空调面板或指示灯",
  clarify: "你前后对过滤网的描述不一致",
};

async function currentQuestion(page) {
  for (const text of Object.values(QUESTION_TEXTS)) {
    if ((await page.getByText(text).count()) > 0) return text;
  }
  return "";
}

async function sessionOf(page) {
  const id = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("fixitai-interview-draft:")) continue;
      try {
        const draft = JSON.parse(localStorage.getItem(key) || "{}");
        if (draft?.sessionId) return draft.sessionId;
      } catch {
        /* ignore */
      }
    }
    return null;
  });
  if (!id) return { status: 404, body: null };
  return apiGet(page, `/api/interview/${id}`);
}

async function answerByOption(page, label) {
  await page.getByRole("button", { name: label }).first().click();
  await page.getByRole("button", { name: "提交回答" }).click();
  await page.waitForTimeout(700);
}

async function answerByText(page, text) {
  await page.getByPlaceholder("点选项或直接输入；不知道也可以").fill(text);
  await page.getByRole("button", { name: "提交回答" }).click();
  await page.waitForTimeout(900);
}

async function isSpeaking(page) {
  const state = await page.evaluate(() => window.__fixitaiSpeech?.getState?.() ?? null);
  return state?.status === "speaking";
}

/** 复用已登录 Cookie 开新上下文，避免反复注册触发频率限制 */
let authCookies = [];
async function authedContext(viewport, init) {
  const context = await browser.newContext({
    viewport,
    storageState: { cookies: authCookies, origins: [] },
  });
  if (init) await context.addInitScript(init);
  return context;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const c0 = await authedContext({ width: 1280, height: 900 });
  const p0 = await c0.newPage();
  await register(p0, "dynMain");
  authCookies = (await c0.storageState()).cookies;
  await c0.close();

  /* ---------- 1. 已知信息不重复问；答完提前结束；刷新恢复 ---------- */
  const c1 = await authedContext({ width: 1280, height: 900 });
  const p1 = await c1.newPage();
  await openDynamic(p1);
  record("空调制冷现象进入动态追问页", p1.url().endsWith("/interview/ac"), p1.url());
  await p1.setInputFiles("#dynamic-photo-input", {
    name: "fault.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQ0kAAAAASUVORK5CYII=",
      "base64"
    ),
  });
  await p1.getByText(/照片已上传/).waitFor({ timeout: 15_000 });
  await startSession(p1, "开的是制冷模式，温度调到22度，过滤网刚洗过，风量正常，但就是不凉");
  const q1 = await currentQuestion(p1);
  record("已说清的模式与滤网不再重复问", q1 === QUESTION_TEXTS.outdoor, q1);
  record(
    "题目说明用途、不展示模型推理",
    (await p1.getByText(/用途：/).count()) > 0 &&
      (await p1.getByText(/本题由确定性规则选择/).count()) > 0
  );
  await answerByOption(p1, /能听到运转声或看到风扇转/);
  record(
    "信息足够时提前结束",
    (await p1.getByText("信息已足够，提前结束").count()) > 0,
    `已问 ${(await sessionOf(p1)).body?.qa?.length ?? "?"} 题`
  );
  const s1 = await sessionOf(p1);
  record(
    "已答问题、来源与未知信息保存在后端",
    s1.status === 200 &&
      s1.body.qa.length === 1 &&
      s1.body.qa[0].input_source === "option" &&
      s1.body.qa[0].selection_source === "rule" &&
      s1.body.unknown_information.length > 0,
    `qa=${s1.body?.qa?.length} source=${s1.body?.qa?.[0]?.selection_source}`
  );
  record(
    "故障照片随会话保留",
    typeof s1.body.photo_id === "number",
    `photo_id=${s1.body.photo_id}`
  );
  await p1.reload({ waitUntil: "domcontentloaded" });
  await p1.waitForTimeout(1200);
  record("刷新后恢复同一会话与结果", (await p1.getByText("信息已足够，提前结束").count()) > 0);
  await c1.close();

  /* ---------- 2. 滤网已清洗与未清洗，后续路径不同 ---------- */
  const c2 = await authedContext({ width: 390, height: 844 });
  const p2 = await c2.newPage();
  await openDynamic(p2);
  await startSession(p2, "开的是制冷模式，温度调到22度，风量正常，过滤网很久没洗了");
  record(
    "滤网脏且风量正常时直接给清洗建议、不继续追问",
    (await p2.getByText("滤网明显脏且风量正常，先建议清洗").count()) > 0,
    `已问 ${(await sessionOf(p2)).body?.qa?.length ?? "?"} 题`
  );
  record(
    "与已清洗路径不同（清洗路径会问外机）",
    (await currentQuestion(p2)) === "" && q1 === QUESTION_TEXTS.outdoor
  );
  await c2.close();

  /* ---------- 3. 风量正常但不凉 vs 几乎不出风 ---------- */
  const c3 = await authedContext({ width: 1280, height: 900 });
  const p3 = await c3.newPage();
  await openDynamic(p3);
  await startSession(p3, "开的是制冷模式，过滤网刚洗过，有风，风量正常，但就是不凉");
  const normalQ = await currentQuestion(p3);
  record("风量正常但不凉：继续查室外机", normalQ === QUESTION_TEXTS.outdoor, normalQ);
  await c3.close();

  const c3b = await authedContext({ width: 1280, height: 900 });
  const p3b = await c3b.newPage();
  await openDynamic(p3b);
  await startSession(p3b, "开的是制冷模式，过滤网刚洗过，几乎不出风");
  const noneQ = await currentQuestion(p3b);
  record("几乎不出风：先查通电/开机而非室外机", noneQ === QUESTION_TEXTS.power, noneQ);
  await c3b.close();

  /* ---------- 4. 连续不知道：可有限结束，不编造事实 ---------- */
  const c4 = await authedContext({ width: 390, height: 844 });
  const p4 = await c4.newPage();
  await openDynamic(p4);
  await startSession(p4, "空调不制冷");
  for (let i = 0; i < 4; i += 1) {
    const unknown = p4.getByRole("button", { name: /不知道|没注意|不确定|没试过|记不清/ }).first();
    if ((await unknown.count()) === 0) break;
    await unknown.click();
    await p4.getByRole("button", { name: "提交回答" }).click();
    await p4.waitForTimeout(900);
  }
  record(
    "连续不知道后达到上限并停止",
    (await p4.getByText("已达到 4 轮上限").count()) > 0,
    `已问 ${(await sessionOf(p4)).body?.qa?.length ?? "?"} 题`
  );
  const s4 = await sessionOf(p4);
  record(
    "未知保留为未知，不改写为正常或异常",
    s4.body.qa.length === 4 &&
      s4.body.qa.every((a) => a.unknown === true) &&
      s4.body.facts.every((f) => f.value === "unknown"),
    `unknown=${s4.body.qa.filter((a) => a.unknown).length}/4`
  );
  await c4.close();

  /* ---------- 5. 回答矛盾：先澄清，不强行合并 ---------- */
  const c5 = await authedContext({ width: 390, height: 844 });
  const p5 = await c5.newPage();
  await openDynamic(p5);
  await startSession(p5, "开的是制冷模式，风量正常，过滤网的清洗情况我记不清了");
  record("滤网未知时先问滤网", (await currentQuestion(p5)) === QUESTION_TEXTS.filter);
  await answerByText(p5, "最近洗过，不过也很久没洗了");
  record("前后矛盾时出现澄清题", (await currentQuestion(p5)) === QUESTION_TEXTS.clarify);
  await answerByOption(p5, /最近确实洗过/);
  record("澄清后不再重复澄清题", (await currentQuestion(p5)) !== QUESTION_TEXTS.clarify);
  const s5 = await sessionOf(p5);
  record(
    "澄清后冲突已解决且原回答保留",
    s5.body.conflicts.length === 0 && s5.body.qa.length >= 2,
    `conflicts=${s5.body.conflicts.length} qa=${s5.body.qa.length}`
  );
  await c5.close();

  /* ---------- 6. 中途危险描述：立即中止且不继续选题 ---------- */
  const c6 = await authedContext({ width: 390, height: 844 });
  const p6 = await c6.newPage();
  await openDynamic(p6);
  await startSession(p6, "开的是制冷模式，风量正常，过滤网刚洗过");
  record("风险故事首题正常", (await currentQuestion(p6)) === QUESTION_TEXTS.outdoor);
  await answerByText(p6, "空调冒烟了，还有焦味");
  record("危险回答立即中止普通追问", (await p6.getByText("已中止普通追问").count()) > 0);
  const s6 = await sessionOf(p6);
  record(
    "中止后无当前问题、回答不写入问答",
    s6.body.status === "intercepted" &&
      s6.body.current_question === null &&
      s6.body.qa.length === 0,
    `status=${s6.body.status} qa=${s6.body.qa.length}`
  );
  await c6.close();

  /* ---------- 7. 未配置模型：明确标注规则来源，不冒充模型 ---------- */
  const c7 = await authedContext({ width: 390, height: 844 });
  const p7 = await c7.newPage();
  await openDynamic(p7);
  await startSession(p7, "风很小，明显比平时弱");
  const s7 = await sessionOf(p7);
  record(
    "歧义分支在无模型时标为规则回退",
    s7.body.selection_source === "rule_fallback" &&
      (await p7.getByText(/模型不可用，本题由规则选择/).count()) > 0,
    `source=${s7.body.selection_source} q=${s7.body.current_question?.id}`
  );
  await c7.close();

  /* ---------- 8. 语音回答：可确认修改、录音暂停朗读 ---------- */
  const voiceInit = () => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (utterance) => {
        window.__lastSpoken = utterance.text;
        setTimeout(() => utterance.onstart?.(), 20);
        setTimeout(() => utterance.onend?.(), 6000);
      };
    }
    class FakeRecognition {
      constructor() {
        this.onresult = null;
        this.onend = null;
        this.onerror = null;
      }
      start() {
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: "有风，风量正常，但就是不凉" } }],
          });
        }, 300);
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          writable: true,
          value: FakeRecognition,
        });
      } catch {
        /* 浏览器内置属性不可覆盖时保留原实现 */
      }
    }
  };
  const c8 = await authedContext({ width: 390, height: 844 }, voiceInit);
  const p8 = await c8.newPage();
  await p8.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await p8.getByRole("switch", { name: /语音朗读/ }).click();
  await p8.getByRole("switch", { name: /自动朗读/ }).click();
  await openDynamic(p8);
  await startSession(p8, "开的是制冷模式，过滤网刚洗过，但就是不凉");
  record("当前问题提供手动朗读入口", (await p8.getByRole("button", { name: "朗读" }).count()) >= 1);
  record("自动朗读按设置播放当前问题", (await isSpeaking(p8)) === true);
  await p8.getByRole("button", { name: "语音回答" }).click();
  await p8.waitForTimeout(500);
  record("开始录音时暂停页面朗读", (await isSpeaking(p8)) === false);
  const transcript = await p8.getByPlaceholder("点选项或直接输入；不知道也可以").inputValue();
  record("语音转写只填入可编辑输入框，不自动提交", transcript.includes("有风"), transcript);
  const beforeSubmit = await sessionOf(p8);
  record("未确认前轮次不推进", beforeSubmit.body.qa.length === 0);
  await p8.getByPlaceholder("点选项或直接输入；不知道也可以").fill(`${transcript}，已确认`);
  await p8.getByRole("button", { name: "提交回答" }).click();
  await p8.waitForTimeout(900);
  const s8 = await sessionOf(p8);
  record(
    "确认修改后与文字提交一致，来源记录为语音",
    s8.body.qa.length === 1 &&
      s8.body.qa[0].input_source === "voice" &&
      s8.body.qa[0].answer.includes("已确认"),
    `input=${s8.body.qa?.[0]?.input_source} answer=${s8.body.qa?.[0]?.answer}`
  );

  /* ---------- 9. 重复提交与过期问题：不重复推进 ---------- */
  const started = await apiPost(p8, "/api/interview", {
    category: "ac",
    symptom: "not_cooling",
    description: "风很小，明显比平时弱",
  });
  const dupQuestion = started.body.current_question;
  const first = await apiPost(p8, `/api/interview/${started.body.session_id}/answer`, {
    question_id: dupQuestion.id,
    answer: "很久没洗",
    option_id: "dirty",
    input_source: "text",
    request_id: "dup-e2e",
    session_version: started.body.version,
  });
  const again = await apiPost(p8, `/api/interview/${started.body.session_id}/answer`, {
    question_id: dupQuestion.id,
    answer: "很久没洗",
    option_id: "dirty",
    input_source: "text",
    request_id: "dup-e2e",
    session_version: started.body.version,
  });
  const after = await apiGet(p8, `/api/interview/${started.body.session_id}`);
  record(
    "同一请求重复提交只处理一次",
    first.status === 200 && again.status === 200 && after.body.qa.length === 1,
    `round=${after.body.round} qa=${after.body.qa.length}`
  );
  const staleQ = after.body.current_question;
  const stale = await apiPost(p8, `/api/interview/${started.body.session_id}/answer`, {
    question_id: staleQ?.id,
    answer: "不知道",
    option_id: "unknown",
    input_source: "text",
    request_id: "stale-e2e",
    session_version: started.body.version,
  });
  const afterStale = await apiGet(p8, `/api/interview/${started.body.session_id}`);
  record(
    "过期问题不能推进新会话",
    stale.status === 409 && afterStale.body.round === after.body.round,
    `status=${stale.status} round=${afterStale.body.round}`
  );

  // 返回重开：不跳回旧问题
  await p8.getByRole("button", { name: "重新描述" }).click();
  await p8.waitForTimeout(400);
  record(
    "返回重开后回到描述页、不跳回旧结果",
    (await p8.getByPlaceholder("用一两句话描述空调的情况，也可以点麦克风说").count()) > 0 &&
      (await p8.locator("text=追问（").count()) === 0
  );

  /* ---------- 10. 长辈模式不重启会话；三端无溢出 ---------- */
  await startSession(p8, "开的是制冷模式，过滤网刚洗过，但就是不凉");
  const beforeElder = await sessionOf(p8);
  const qBefore = await currentQuestion(p8);
  await p8.getByRole("button", { name: "切换长辈关怀模式" }).click();
  await p8.waitForTimeout(500);
  const afterElder = await sessionOf(p8);
  record(
    "切换长辈模式不重启问诊、不换题",
    beforeElder.body.session_id === afterElder.body.session_id &&
      afterElder.body.round === beforeElder.body.round &&
      (await currentQuestion(p8)) === qBefore,
    `${qBefore} round=${afterElder.body.round}`
  );

  for (const [label, width, height] of [
    ["手机", 390, 844],
    ["平板", 820, 1180],
    ["桌面", 1280, 900],
  ]) {
    await p8.setViewportSize({ width, height });
    await p8.waitForTimeout(300);
    const overflow = await p8.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    record(`${label}端动态问诊无横向溢出`, !overflow);
  }
  await c8.close();

  /* ---------- 11. 最终生成失败不回退模板 ---------- */
  const c9 = await authedContext({ width: 390, height: 844 });
  const p9 = await c9.newPage();
  await openDynamic(p9);
  await startSession(p9, "开的是制冷模式，风量正常，过滤网刚洗过，几乎不出风");
  await answerByOption(p9, /能正常开机、指示灯亮/);
  await p9.waitForTimeout(600);
  await p9.getByRole("button", { name: /基于现有信息生成建议/ }).click();
  await p9.waitForTimeout(600);
  await p9.getByRole("button", { name: /生成建议/ }).click();
  await p9.waitForTimeout(1500);
  record(
    "真实 AI 未配置时明确失败且不回退模板",
    (await p9.getByText(/AI 服务尚未配置|AI 诊断未成功/).count()) > 0 &&
      (await p9.getByText(/模板演示建议/).count()) === 0 &&
      p9.url().includes("/interview/ac"),
    p9.url()
  );
  await c9.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果：${results.length - failed}/${results.length} 通过`);
process.exit(failed === 0 ? 0 : 1);

/**
 * 动态问诊页面 UI 回归（模型响应使用浏览器级测试替身）。
 * 明确说明：本脚本不验证真实模型，只验证模型结构返回时页面交互与错误处理。
 * 真实模型验收需配置 FIXITAI_AI_API_KEY 后另行运行。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:5273";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const results = [];
function check(name, ok, evidence = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${evidence}`);
}

const option = (id, label, unknown = false) => ({ id, label, unknown });
const q1 = {
  id: "q-model-1",
  text: "室外机风扇运转时能听到声音吗？",
  purpose: "判断室外机是否工作。",
  options: [option("q-model-1-o1", "能听到"), option("q-model-1-o2", "听不到"), option("q-model-1-o3", "不知道／没试过", true)],
};
const q2 = {
  id: "q-model-2",
  text: "遥控器设置的是制冷模式、温度多少？",
  purpose: "确认模式和温度。",
  options: [option("q-model-2-o1", "制冷 26 度"), option("q-model-2-o2", "制冷 22 度"), option("q-model-2-o3", "不知道／没试过", true)],
};
const base = {
  status: "active",
  max_rounds: 6,
  photo_id: null,
  known_information: [],
  unknown_information: [],
  conflicts: [],
  recommendation: null,
  cannot: null,
  selection_source: "model",
  selection_note: "本题由大模型根据当前对话生成",
  model_calls: 1,
  model_latency_ms: 1200,
  kb_version: "ac-ai-interview-v1",
  safety_rules_version: "SAFETY-2026-11-18-A",
  can_finish: false,
};
const startState = {
  ...base,
  session_id: "mock-session",
  version: 0,
  round: 0,
  current_question: q1,
  qa: [],
};
const secondState = {
  ...base,
  session_id: "mock-session",
  version: 1,
  round: 1,
  current_question: q2,
  qa: [
    {
      question_id: q1.id,
      question_text: q1.text,
      answer: "能听到",
      option_id: "q-model-1-o1",
      unknown: false,
      input_source: "option",
      selection_source: "model",
      asked_at: "2026-11-20T09:00:00+08:00",
    },
  ],
  model_calls: 2,
  can_finish: true,
};
const doneState = {
  ...base,
  status: "completed",
  end_reason: "model_recommend",
  version: 2,
  round: 2,
  current_question: null,
  selection_source: "model",
  selection_note: null,
  model_calls: 3,
  qa: [
    ...secondState.qa,
    {
      question_id: q2.id,
      question_text: q2.text,
      answer: "制冷 26 度",
      option_id: "q-model-2-o1",
      unknown: false,
      input_source: "text",
      selection_source: "model",
      asked_at: "2026-11-20T09:01:00+08:00",
    },
  ],
  unknown_information: ["室外机是否被遮挡"],
  recommendation: {
    summary: "信息显示室外机可能运转，但仍需确认散热与制冷剂压力。",
    possible_causes: [
      { title: "室外机散热受阻", description: "周围遮挡会降低换热效率" },
      { title: "制冷剂不足（需专业确认）", description: "不能由用户自行加注" },
    ],
    unknown_information: ["室外机是否被遮挡"],
    next_steps: ["清理外机周围遮挡物", "仍不凉请联系专业人员检测压力"],
  },
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const user = `ui${Date.now().toString().slice(-6)}`;
  await page.goto(`${BASE}/login?mode=register`, { waitUntil: "networkidle" });
  await page.getByLabel("用户名").fill(user);
  await page.getByLabel("昵称").fill("动态UI回归");
  await page.getByLabel("登录密码").fill("E2ePass123");
  await page.getByLabel("确认密码").fill("E2ePass123");
  await page.getByRole("button", { name: /注册并登录/ }).click();
  await page.waitForFunction(() => !location.pathname.startsWith("/login"));

  let answers = 0;
  await page.route("**/api/interview**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "POST" && url.pathname === "/api/interview") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(startState) });
    }
    if (req.method() === "POST" && url.pathname.endsWith("/answer")) {
      answers += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(answers === 1 ? secondState : doneState),
      });
    }
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(secondState) });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/interview/ac`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("用一两句话描述空调的情况，也可以点麦克风说").fill("开的是制冷模式，过滤网刚洗过，风量正常，但不凉");
  await page.getByRole("button", { name: "开始动态追问" }).click();
  await page.getByText("室外机风扇运转时能听到声音吗？").waitFor();
  check("展示大模型生成的题目", true);
  check("标注题目来源为大模型", (await page.getByText("本题由大模型根据当前对话生成").count()) > 0);
  check("无规则演示/题库文案", (await page.getByText(/确定性规则|模型不可用，本题由规则选择/).count()) === 0);

  await page.getByRole("button", { name: "能听到" }).click();
  await page.getByRole("button", { name: "提交回答" }).click();
  await page.getByText("遥控器设置的是制冷模式、温度多少？").waitFor();
  check("回答后模型给出不同下一问", true);

  await page.getByRole("button", { name: "制冷 26 度" }).click();
  await page.getByRole("button", { name: "提交回答" }).click();
  await page.getByText("大模型判断信息已足够，结束追问").waitFor();
  check("模型自主结束并展示诊断方向", (await page.getByText(/室外机散热受阻/).count()) > 0);
  check("展示模型调用次数", (await page.getByText(/实际调用大模型 3 次/).count()) > 0);

  await page.getByRole("button", { name: /生成完整报告/ }).click();
  await page.waitForTimeout(900);
  check(
    "最终生成失败明确提示、不回退模板",
    (await page.getByText(/AI 服务尚未配置|AI 诊断未成功/).count()) > 0 &&
      (await page.getByText(/模板演示建议|诊断模板/).count()) === 0
  );

  await page.getByRole("button", { name: "查看问答与来源" }).click();
  check("问答显示语音/文字来源与模型选题", (await page.getByText(/选题：大模型生成/).count()) > 0);

  for (const [label, width, height] of [["手机", 390, 844], ["平板", 820, 1180], ["桌面", 1280, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`${label}端动态问诊无横向溢出`, !overflow);
  }

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n结果：${results.length - failed}/${results.length} 通过（测试替身，不代表真实模型验收）`);
process.exit(failed === 0 ? 0 : 1);

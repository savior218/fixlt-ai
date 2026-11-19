/**
 * 阶段十一浏览器验收（真实浏览器 + 真实后端）
 * 运行：先启动前后端，再执行 npm run e2e:stage11
 * 覆盖：注册/登录/刷新恢复/昵称修改/修改密码/退出/设备隔离/游客只读/本机历史/三端与长辈模式
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:5173";
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SUFFIX = String(Date.now()).slice(-6);
const A = { name: `e2eA${SUFFIX}`, pwd: "E2ePass123", pwd2: "E2ePass456" };
const B = { name: `e2eB${SUFFIX}`, pwd: "E2ePass123" };
const C = { name: `e2eC${SUFFIX}`, pwd: "E2ePass123" };
const A_DEVICE = "A 的验收空调";
const B_DEVICE = "B 的验收冰箱";

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
  await page.goto(`${BASE}/login?returnTo=%2Fdevices`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "登录" }).click();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function logout(page) {
  await page.getByLabel("用户菜单").click();
  await page.getByRole("menuitem", { name: /退出登录/ }).click();
  await page.getByRole("button", { name: /登录 \/ 注册/ }).waitFor({ timeout: 10_000 });
}

async function editNickname(page, nickname) {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "编辑昵称" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑昵称" });
  await dialog.getByLabel("昵称").fill(nickname);
  await page.getByRole("button", { name: "保存昵称" }).click();
  await page.getByText("昵称已更新").waitFor({ timeout: 10_000 });
}

async function addDevice(page, name) {
  await page.goto(`${BASE}/devices`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "添加设备" }).first().click();
  await page.getByLabel("设备名称").fill(name);
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByText(name).first().waitFor({ timeout: 10_000 });
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    /* ---------- 手机端：游客只读 → 注册 → 设备 → 昵称 → 改密 → 退出 ---------- */
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/devices`, { waitUntil: "networkidle" });
    const guestBanner = page.getByText(/当前为.*游客演示/).first();
    await guestBanner.waitFor({ timeout: 10_000 });
    const guestAdd = await page.getByRole("button", { name: "添加设备" }).count();
    const demoCards = await page.getByText(/客厅空调|双门冰箱|滚筒洗衣机/).count();
    record(
      "游客设备为只读样例且无添加入口",
      guestAdd === 0 && demoCards >= 3,
      `demo=${demoCards} add=${guestAdd}`
    );
    record("手机端游客设备页无横向溢出", !(await overflow(page)).overflow);

    await page.getByRole("button", { name: /登录 \/ 注册/ }).click();
    await page.getByRole("tab", { name: "注册" }).click();
    record("从顶栏进入登录/注册页", page.url().includes("/login"), page.url());

    await page.getByLabel("用户名").fill(A.name);
    await page.getByLabel("昵称").fill("验收账号A");
    await page.getByLabel("登录密码").fill(A.pwd);
    await page.getByLabel("确认密码").fill(A.pwd);
    await page.getByRole("button", { name: /注册并登录/ }).click();
    await page.waitForURL("**/devices", { timeout: 15_000 });
    await page.getByRole("button", { name: "添加设备" }).first().waitFor({ timeout: 10_000 });
    record("手机端注册成功并返回原访问页面", page.url().endsWith("/devices"));
    record("登录后游客只读提示消失", (await guestBanner.count()) === 0);

    await addDevice(page, A_DEVICE);
    record("已登录用户可新增自己的设备", true, A_DEVICE);

    await editNickname(page, "验收昵称A");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("你好，验收昵称A").waitFor({ timeout: 10_000 });
    record("昵称修改后刷新仍保留", true);

    await page.getByLabel("用户菜单").click();
    await page.getByText("账号：").first().waitFor({ timeout: 5_000 });
    record("顶栏头像菜单显示真实昵称与账号", true);
    await page.keyboard.press("Escape");

    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "修改密码" }).click();
    const pwdDialog = page.getByRole("dialog", { name: "修改密码" });
    await pwdDialog.getByRole("textbox", { name: /^旧密码/ }).fill(A.pwd);
    await pwdDialog.getByRole("textbox", { name: /^新密码/ }).fill(A.pwd2);
    await pwdDialog.getByRole("textbox", { name: /^确认新密码/ }).fill(A.pwd2);
    await page.getByRole("button", { name: "确认修改" }).click();
    await page.waitForURL(/reason=password_changed/, { timeout: 15_000 });
    await page.getByText(/密码已修改，旧登录状态已失效/).first().waitFor({ timeout: 10_000 });
    record("修改密码后撤销会话并引导重新登录", true);

    await page.getByLabel("用户名").fill(A.name);
    await page.getByLabel("密码").fill(A.pwd2);
    await page.getByRole("button", { name: /^登录$/ }).click();
    await page.waitForURL(/\/settings(?:$|\?)/, { timeout: 15_000 });
    await page.getByText("你好，验收昵称A").waitFor({ timeout: 10_000 });
    record("新密码可登录且资料保留", true);

    await logout(page);
    record("退出登录后回到游客状态", true);
    record("手机端退出后无横向溢出", !(await overflow(page)).overflow);

    /* ---------- 本机历史注入 + B 账号隔离 ---------- */
    const legacy = {
      id: "legacy-local-1",
      deviceId: 1,
      deviceName: "旧本机空调",
      diagnosisId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      repairTime: null,
      faultDescription: "旧记录",
      repairMethod: "旧做法",
      technician: null,
      cost: null,
      status: "recovered",
      images: [],
      verificationStatus: "unverified",
    };
    await page.goto(`${BASE}/login?mode=register`, { waitUntil: "networkidle" });
    await page.evaluate((item) => {
      localStorage.setItem(
        "fixitai-repairs",
        JSON.stringify({ state: { records: [item] }, version: 1 })
      );
    }, legacy);
    await page.reload({ waitUntil: "networkidle" });

    await page.getByLabel("用户名").fill(B.name);
    await page.getByLabel("昵称").fill("验收账号B");
    await page.getByLabel("登录密码").fill(B.pwd);
    await page.getByLabel("确认密码").fill(B.pwd);
    await page.getByRole("button", { name: /注册并登录/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await addDevice(page, B_DEVICE);
    record("B 账号看不到 A 的设备", (await page.getByText(A_DEVICE).count()) === 0);

    await page.goto(`${BASE}/records`, { waitUntil: "networkidle" });
    await page.getByText(/本机历史维修记录未归属任何账号/).waitFor({ timeout: 10_000 });
    record(
      "旧本机历史保留且不归入 B 账号",
      (await page.getByText("旧本机空调").count()) === 0,
      "本机历史提示可见，旧记录不混入"
    );

    await page.goto(`${BASE}/devices`, { waitUntil: "networkidle" });
    await logout(page);

    await login(page, A.name, A.pwd2);
    await page.getByText(A_DEVICE).first().waitFor({ timeout: 10_000 });
    record("切换回 A 账号只看到 A 的设备", (await page.getByText(B_DEVICE).count()) === 0);

    await ctx.close();

    /* ---------- 平板 768：登录 + 编辑资料 ---------- */
    const tablet = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      locale: "zh-CN",
    });
    const tp = await tablet.newPage();
    await login(tp, A.name, A.pwd2);
    await editNickname(tp, "验收昵称A平板");
    record("平板端登录与编辑资料可用", true);
    record("平板端登录页无横向溢出", !(await overflow(tp)).overflow);
    await tablet.close();

    /* ---------- 电脑 1280 + 长辈模式 375 ---------- */
    const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
    });
    const dp = await desktop.newPage();
    await login(dp, A.name, A.pwd2);
    await editNickname(dp, "验收昵称A电脑");
    record("电脑端登录与编辑资料可用", true);
    record("电脑端个人中心无横向溢出", !(await overflow(dp)).overflow);
    await desktop.close();

    const elder = await browser.newContext({
      viewport: { width: 375, height: 812 },
      locale: "zh-CN",
    });
    const ep = await elder.newPage();
    await ep.goto(`${BASE}/login?mode=register`, { waitUntil: "networkidle" });
    await ep.getByRole("button", { name: /长辈/ }).first().click();
    await ep.getByLabel("用户名").fill(C.name);
    await ep.getByLabel("昵称").fill("长辈模式用户C");
    await ep.getByLabel("登录密码").fill(C.pwd);
    await ep.getByLabel("确认密码").fill(C.pwd);
    await ep.getByRole("button", { name: /注册并登录/ }).click();
    await ep.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await editNickname(ep, "爷爷的账号C");
    record("长辈模式可完成注册与编辑资料", true);
    record("长辈模式窄屏无横向溢出", !(await overflow(ep)).overflow);
    await logout(ep);
    await login(ep, C.name, C.pwd);
    record("长辈模式可重新登录", true);
    await elder.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, Globe, LogIn, UserPlus, Wrench } from "lucide-react";

import Button from "../components/Button";
import InputField from "../components/InputField";
import Loading from "../components/Loading";
import { useApplyPrefs } from "../hooks/useApplyPrefs";
import { useAuthStore } from "../stores/authStore";
import { useLocale, type Locale } from "../stores/locale";
import { safeReturnTo } from "../utils/redirect";

const USERNAME_RE = /^[A-Za-z0-9_\-\u4e00-\u9fff]{3,32}$/;

type Tab = "login" | "register";

interface FieldErrors {
  username?: string;
  nickname?: string;
  password?: string;
  confirm?: string;
}

interface PortalText {
  brand: string;
  brandSub: string;
  tabLogin: string;
  tabRegister: string;
  headingLogin: string;
  headingRegister: string;
  subtitle: string;
  username: string;
  usernamePlaceholder: string;
  usernameHint: string;
  nickname: string;
  nicknamePlaceholder: string;
  nicknameHint: string;
  password: string;
  passwordPlaceholder: string;
  confirm: string;
  confirmPlaceholder: string;
  submitLogin: string;
  submitRegister: string;
  busyLogin: string;
  busyRegister: string;
  agreePrefix: string;
  agreeAnd: string;
  agreeSuffix: string;
  termsName: string;
  privacyName: string;
  guestHint: string;
  guestAction: string;
  passwordChanged: string;
  errUsernameRequired: string;
  errUsernameFormat: string;
  errPasswordRequired: string;
  errPasswordLength: string;
  errConfirmMismatch: string;
  errNicknameLength: string;
  errGeneric: string;
  privacy: string;
  terms: string;
  copyrightLink: string;
  languageSetting: string;
  copyright: string;
  loading: string;
}

/** 登录门户页文案：与微信网页版一致，语言切换只影响登录页与页脚 */
const TEXT: Record<Locale, PortalText> = {
  "zh-Hans": {
    brand: "修必达 FixIt AI",
    brandSub: "AI 家电维修助手",
    tabLogin: "登录",
    tabRegister: "注册",
    headingLogin: "登录账号",
    headingRegister: "创建账号",
    subtitle: "登录后可保存你的设备与维修记录，并在不同设备间同步。",
    username: "用户名",
    usernamePlaceholder: "3-32 位字母、数字、下划线或中文",
    usernameHint: "账号唯一标识，登录时使用；昵称可随后修改。",
    nickname: "昵称",
    nicknamePlaceholder: "选填，默认使用用户名",
    nicknameHint: "展示用昵称，修改后刷新仍会保留。",
    password: "密码",
    passwordPlaceholder: "至少 8 位",
    confirm: "确认密码",
    confirmPlaceholder: "请再次输入密码",
    submitLogin: "登录",
    submitRegister: "注册并登录",
    busyLogin: "登录中…",
    busyRegister: "注册中…",
    agreePrefix: "点击「注册并登录」即表示你已阅读并同意",
    agreeAnd: "与",
    agreeSuffix: "。",
    termsName: "《用户协议》",
    privacyName: "《隐私政策》",
    guestHint: "不登录也可以进行故障诊断和查看演示设备，游客数据只保存在本机。",
    guestAction: "先体验一下",
    passwordChanged: "密码已修改，旧登录状态已失效，请使用新密码重新登录。",
    errUsernameRequired: "请输入用户名",
    errUsernameFormat: "用户名需为 3-32 位字母、数字、下划线、连字符或中文",
    errPasswordRequired: "请输入密码",
    errPasswordLength: "密码至少 8 位",
    errConfirmMismatch: "两次输入的密码不一致",
    errNicknameLength: "昵称最多 32 个字符",
    errGeneric: "操作失败，请稍后重试",
    privacy: "隐私保护指引",
    terms: "软件许可及服务协议",
    copyrightLink: "版权声明",
    languageSetting: "语言设置",
    copyright: "Copyright © 2026 修必达 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "正在恢复登录状态…",
  },
  "zh-Hant": {
    brand: "修必達 FixIt AI",
    brandSub: "AI 家電維修助手",
    tabLogin: "登入",
    tabRegister: "註冊",
    headingLogin: "登入帳號",
    headingRegister: "建立新帳號",
    subtitle: "登入後可儲存你的裝置與維修紀錄，並在不同裝置間同步。",
    username: "使用者名稱",
    usernamePlaceholder: "3-32 位字母、數字、底線或中文",
    usernameHint: "帳號唯一標識，登入時使用；暱稱可稍後修改。",
    nickname: "暱稱",
    nicknamePlaceholder: "選填，預設使用使用者名稱",
    nicknameHint: "展示用暱稱，修改後重新整理仍會保留。",
    password: "密碼",
    passwordPlaceholder: "至少 8 位",
    confirm: "確認密碼",
    confirmPlaceholder: "請再次輸入密碼",
    submitLogin: "登入",
    submitRegister: "註冊並登入",
    busyLogin: "登入中…",
    busyRegister: "註冊中…",
    agreePrefix: "點擊「註冊並登入」即表示你已閱讀並同意",
    agreeAnd: "與",
    agreeSuffix: "。",
    termsName: "《使用者協議》",
    privacyName: "《隱私政策》",
    guestHint: "不登入也可以進行故障診斷與查看示範裝置，訪客資料只保存在本機。",
    guestAction: "先體驗一下",
    passwordChanged: "密碼已修改，舊的登入狀態已失效，請使用新密碼重新登入。",
    errUsernameRequired: "請輸入使用者名稱",
    errUsernameFormat: "使用者名稱需為 3-32 位字母、數字、底線、連字號或中文",
    errPasswordRequired: "請輸入密碼",
    errPasswordLength: "密碼至少 8 位",
    errConfirmMismatch: "兩次輸入的密碼不一致",
    errNicknameLength: "暱稱最多 32 個字元",
    errGeneric: "操作失敗，請稍後重試",
    privacy: "隱私保護指引",
    terms: "軟體許可及服務協議",
    copyrightLink: "版權聲明",
    languageSetting: "語言設定",
    copyright: "Copyright © 2026 修必達 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "正在還原登入狀態…",
  },
  en: {
    brand: "FixIt AI",
    brandSub: "AI home appliance repair assistant",
    tabLogin: "Sign in",
    tabRegister: "Sign up",
    headingLogin: "Sign in to your account",
    headingRegister: "Create your account",
    subtitle: "Sign in to save your devices and repair records, and sync them across devices.",
    username: "Username",
    usernamePlaceholder: "3–32 letters, digits, underscores or Chinese characters",
    usernameHint: "Your unique account ID used for signing in; the nickname can be changed later.",
    nickname: "Nickname",
    nicknamePlaceholder: "Optional, defaults to your username",
    nicknameHint: "Display name; it is kept after a page refresh.",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    confirm: "Confirm password",
    confirmPlaceholder: "Enter the password again",
    submitLogin: "Sign in",
    submitRegister: "Sign up and sign in",
    busyLogin: "Signing in…",
    busyRegister: "Signing up…",
    agreePrefix: "By clicking “Sign up and sign in”, you agree to the",
    agreeAnd: "and the",
    agreeSuffix: ".",
    termsName: "“User Agreement”",
    privacyName: "“Privacy Policy”",
    guestHint: "You can also run diagnostics and view demo devices without signing in; guest data stays on this device only.",
    guestAction: "Continue as guest",
    passwordChanged: "Your password was changed and previous sessions were revoked. Please sign in again.",
    errUsernameRequired: "Please enter a username",
    errUsernameFormat: "Username must be 3–32 letters, digits, underscores, hyphens or Chinese characters",
    errPasswordRequired: "Please enter a password",
    errPasswordLength: "Password must be at least 8 characters",
    errConfirmMismatch: "The two passwords do not match",
    errNicknameLength: "Nickname must be at most 32 characters",
    errGeneric: "Something went wrong, please try again later",
    privacy: "Privacy Policy",
    terms: "Software License & Terms of Service",
    copyrightLink: "Copyright Notice",
    languageSetting: "Language",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Restoring your session…",
  },
};

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "zh-Hans", label: "中文（简体）" },
  { value: "zh-Hant", label: "中文（繁體）" },
  { value: "en", label: "English" },
];

/** 登录 / 注册门户页（独立于应用外壳，参考微信网页版登录页的信息层级） */
export default function Login() {
  useApplyPrefs();

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const authError = useAuthStore((s) => s.error);
  const hydrate = useAuthStore((s) => s.hydrate);
  const { locale, setLocale } = useLocale();
  const t = TEXT[locale];

  const returnTo = safeReturnTo(params.get("returnTo"));
  const reason = params.get("reason");
  const [tab, setTab] = useState<Tab>(
    params.get("mode") === "register" ? "register" : "login"
  );
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 页脚语言菜单开合状态 */
  const [langOpen, setLangOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // 点击语言菜单外部或按 Esc 关闭菜单。
  // 不能用 fixed 遮罩：footer 带 backdrop-blur，会创建 containing block 使 fixed 失效。
  useEffect(() => {
    if (!langOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!langMenuRef.current?.contains(e.target as Node)) setLangOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLangOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langOpen]);

  // 登录页已脱离 AppLayout，需要自行恢复服务端会话
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // 已登录用户直接回到来源页，不在门户页停留
  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(returnTo, { replace: true });
    }
  }, [status, user, returnTo, navigate]);

  function switchTab(next: Tab) {
    if (busy) return;
    setTab(next);
    setErrors({});
    setFormError(null);
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    const name = username.trim();
    if (!name) next.username = t.errUsernameRequired;
    else if (!USERNAME_RE.test(name)) next.username = t.errUsernameFormat;
    if (tab === "register" && nickname.trim().length > 32)
      next.nickname = t.errNicknameLength;
    if (!password) next.password = t.errPasswordRequired;
    else if (password.length < 8) next.password = t.errPasswordLength;
    if (tab === "register" && password !== confirm)
      next.confirm = t.errConfirmMismatch;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (busy) return;
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (tab === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, nickname.trim() || undefined);
      }
      navigate(returnTo, { replace: true });
    } catch (e) {
      setFormError((e as Error).message || t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loading label={t.loading} />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #f7f6f1 0%, #fbf2ec 42%, #f1ece3 100%)",
      }}
    >
      {/* 背景光斑（纯装饰，不影响可读性） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl"
      />

      {/* 左上角品牌区 */}
      <header className="relative z-10 flex items-center gap-2.5 px-5 pt-6 sm:px-10">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"
          aria-hidden
        >
          <Wrench className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold text-stone-800">{t.brand}</span>
        <span className="hidden text-xs text-stone-500 sm:inline">
          · {t.brandSub}
        </span>
      </header>

      {/* 中央登录卡片 */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <section className="w-full max-w-[420px] rounded-2xl bg-surface p-6 shadow-card ring-1 ring-stone-200/70 sm:p-8">
          <h1 className="text-xl font-bold text-stone-900">
            {tab === "login" ? t.headingLogin : t.headingRegister}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            {t.subtitle}
          </p>

          {reason === "password_changed" && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {t.passwordChanged}
            </p>
          )}
          {authError && (
            <p
              role="note"
              className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {authError}
            </p>
          )}

          {/* 登录 / 注册切换 */}
          <div
            role="tablist"
            aria-label={t.headingLogin}
            className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
          >
            {(["login", "register"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => switchTab(key)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "bg-surface text-brand-700 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                ].join(" ")}
              >
                {key === "login" ? t.tabLogin : t.tabRegister}
              </button>
            ))}
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <InputField
              label={t.username}
              required
              maxLength={32}
              placeholder={t.usernamePlaceholder}
              description={t.usernameHint}
              value={username}
              error={errors.username}
              onChange={(v) => setUsername(v)}
            />

            {tab === "register" && (
              <InputField
                label={t.nickname}
                maxLength={32}
                placeholder={t.nicknamePlaceholder}
                description={t.nicknameHint}
                value={nickname}
                error={errors.nickname}
                onChange={(v) => setNickname(v)}
              />
            )}

            <InputField
              label={t.password}
              required
              type="password"
              maxLength={128}
              placeholder={t.passwordPlaceholder}
              value={password}
              error={errors.password}
              onChange={(v) => setPassword(v)}
            />

            {tab === "register" && (
              <InputField
                label={t.confirm}
                required
                type="password"
                maxLength={128}
                placeholder={t.confirmPlaceholder}
                value={confirm}
                error={errors.confirm}
                onChange={(v) => setConfirm(v)}
              />
            )}

            {tab === "register" && (
              <p className="text-xs leading-relaxed text-stone-500">
                {t.agreePrefix}
                <Link
                  to="/terms"
                  className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {t.termsName}
                </Link>
                {t.agreeAnd}
                <Link
                  to="/privacy"
                  className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {t.privacyName}
                </Link>
                {t.agreeSuffix}
              </p>
            )}

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {tab === "login" ? (
                <>
                  <LogIn className="h-4 w-4" />
                  {busy ? t.busyLogin : t.submitLogin}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {busy ? t.busyRegister : t.submitRegister}
                </>
              )}
            </Button>
          </form>

          {/* 游客入口：与真实账号数据明确隔离 */}
          <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 px-4 py-3">
            <p data-elder="hide" className="text-xs leading-relaxed text-stone-500">
              {t.guestHint}
            </p>
            <button
              type="button"
              onClick={() => navigate(returnTo, { replace: true })}
              className="mt-2 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              {t.guestAction} ›
            </button>
          </div>
        </section>
      </main>

      {/* 底部信息栏：语言切换 + 法务链接 + 版权声明 */}
      <footer className="relative z-10 border-t border-stone-200/70 bg-surface/70 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-xs text-stone-500 sm:flex-row sm:justify-between">
          <nav
            aria-label="页脚导航"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
          >
            {/* 语言设置：单入口，展开选择语言 */}
            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                className="inline-flex items-center gap-1 transition-colors hover:text-brand-700 hover:underline"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
                {t.languageSetting}
                <ChevronDown
                  className={[
                    "h-3 w-3 transition-transform",
                    langOpen ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden
                />
              </button>

              {langOpen && (
                <div
                  role="listbox"
                    aria-label={t.languageSetting}
                    className="absolute bottom-full left-0 z-20 mb-2 w-40 overflow-hidden rounded-xl border border-stone-200 bg-surface py-1 shadow-card"
                  >
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.value}
                        type="button"
                        role="option"
                        aria-selected={locale === lang.value}
                        onClick={() => {
                          setLocale(lang.value);
                          setLangOpen(false);
                        }}
                        className={[
                          "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                          locale === lang.value
                            ? "font-semibold text-brand-700"
                            : "text-stone-600 hover:bg-stone-50",
                        ].join(" ")}
                      >
                        {lang.label}
                        {locale === lang.value && (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <span aria-hidden className="h-3 w-px bg-stone-300" />

            <Link
              to="/privacy"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.privacy}
            </Link>
            <Link
              to="/terms"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.terms}
            </Link>
            <Link
              to="/copyright"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.copyrightLink}
            </Link>
          </nav>

          <p className="text-center text-stone-400 sm:text-right">
            {t.copyright}
          </p>
        </div>
      </footer>
    </div>
  );
}

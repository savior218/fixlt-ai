import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import InputField from "../components/InputField";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { useAuthStore } from "../stores/authStore";
import { usePrefs } from "../stores/prefs";
import { safeReturnTo } from "../utils/redirect";

const USERNAME_RE = /^[A-Za-z0-9_\-\u4e00-\u9fff]{3,32}$/;

type Tab = "login" | "register";

interface FieldErrors {
  username?: string;
  nickname?: string;
  password?: string;
  confirm?: string;
  current?: string;
}

/** 登录 / 注册（保留游客演示入口） */
export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const authError = useAuthStore((s) => s.error);
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const returnTo = safeReturnTo(params.get("returnTo"));
  const reason = params.get("reason");
  const [tab, setTab] = useState<Tab>(params.get("mode") === "register" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTab(next: Tab) {
    if (busy) return;
    setTab(next);
    setErrors({});
    setFormError(null);
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    const name = username.trim();
    if (!name) next.username = "请输入用户名";
    else if (!USERNAME_RE.test(name))
      next.username = "用户名需为 3-32 位字母、数字、下划线、连字符或中文";
    if (tab === "register" && nickname.trim().length > 32)
      next.nickname = "昵称最多 32 个字符";
    if (!password) next.password = "请输入密码";
    else if (password.length < 8) next.password = "密码至少 8 位";
    if (tab === "register" && password !== confirm)
      next.confirm = "两次输入的密码不一致";
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
        notify("登录成功", "success");
      } else {
        await register(username.trim(), password, nickname.trim() || undefined);
        notify("注册成功，已自动登录", "success");
      }
      navigate(returnTo, { replace: true });
    } catch (e) {
      setFormError((e as Error).message || "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  if (status === "authenticated" && user) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <PageHeader title="账号" subtitle="当前已通过服务端会话验证登录状态" />
        <SectionCard title="已登录">
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              昵称：<span className="font-semibold text-slate-900">{user.nickname}</span>
            </p>
            <p className="text-sm text-slate-700">
              账号标识：<span className="font-medium text-slate-900">{user.username}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(returnTo, { replace: true })}>
                继续使用
              </Button>
              <Link to="/settings" className={buttonClass("secondary", "md")}>
                个人中心
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full space-y-4 ${elder ? "max-w-xl" : "max-w-md"}`}>
      <PageHeader
        title={tab === "login" ? "登录账号" : "注册账号"}
        subtitle="登录后可以保存自己的设备，并在不同设备上恢复账号数据。"
      />

      {reason === "password_changed" && (
        <p role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          密码已修改，旧登录状态已失效，请使用新密码重新登录。
        </p>
      )}
      {authError && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {authError}
        </p>
      )}

      <SectionCard>
        {/* 登录 / 注册切换 */}
        <div role="tablist" aria-label="登录或注册" className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
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
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {key === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <InputField
            label="用户名"
            required
            maxLength={32}
            placeholder="3-32 位字母、数字、下划线或中文"
            description="账号唯一标识，登录时使用；昵称可随后修改。"
            value={username}
            error={errors.username}
            onChange={(v) => setUsername(v)}
          />

          {tab === "register" && (
            <InputField
              label="昵称"
              maxLength={32}
              placeholder="选填，默认使用用户名"
              description="展示用昵称，修改后刷新仍会保留。"
              value={nickname}
              error={errors.nickname}
              onChange={(v) => setNickname(v)}
            />
          )}

          <InputField
            label={tab === "login" ? "密码" : "登录密码"}
            required
            type="password"
            maxLength={128}
            placeholder="至少 8 位"
            value={password}
            error={errors.password}
            onChange={(v) => setPassword(v)}
          />

          {tab === "register" && (
            <InputField
              label="确认密码"
              required
              type="password"
              maxLength={128}
              placeholder="请再次输入密码"
              value={confirm}
              error={errors.confirm}
              onChange={(v) => setConfirm(v)}
            />
          )}

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {tab === "login" ? (
              <>
                <LogIn className="h-4 w-4" /> {busy ? "登录中…" : "登录"}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> {busy ? "注册中…" : "注册并登录"}
              </>
            )}
          </Button>
        </form>

        <p className="mt-3 text-xs text-slate-400">
          密码由服务端使用成熟哈希算法保存，不保存在浏览器本地；登录令牌仅存放在 HttpOnly Cookie 中。
        </p>
      </SectionCard>

      {/* 游客入口：与真实账号数据明确隔离 */}
      <SectionCard title="先体验一下">
        <p className="text-sm text-slate-600">
          不登录也可以进行故障诊断和查看游客演示设备。游客设备为只读样例，不会修改真实账号或共享数据；
          游客的诊断草稿与维修记录只保存在本机，并标记为本机历史。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(returnTo, { replace: true })}>
            游客演示入口
          </Button>
          <Link to="/devices" className={buttonClass("ghost", "md")}>
            查看只读演示设备
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

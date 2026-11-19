import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Lock, UserRound, Wrench } from "lucide-react";

import { loginRequest, registerRequest } from "../services/api";
import { useAuthStore } from "../stores/authStore";

/** 登录 / 注册页（切换账号用；演示账号 demo / 123456） */
export default function Login() {
  const navigate = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const fn = mode === "login" ? loginRequest : registerRequest;
      const user = await fn(username.trim(), password);
      signIn({ id: user.id, username: user.username, email: user.email });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* 品牌区 */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Wrench aria-hidden className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-stone-900">修必达 · FixIt AI</h1>
          <p className="text-sm text-stone-500">登录后继续使用你的维修档案</p>
        </div>

        <div className="card-base p-6">
          {/* 模式切换 */}
          <div
            role="tablist"
            aria-label="登录或注册"
            className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
          >
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={[
                  "rounded-lg py-2 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-surface text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                ].join(" ")}
              >
                {m === "login" ? "登录" : "注册新账号"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">用户名</span>
              <span className="relative block">
                <UserRound
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  maxLength={64}
                  autoComplete="username"
                  placeholder="请输入用户名"
                  className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">密码</span>
              <span className="relative block">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  maxLength={64}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="至少 6 位"
                  className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-risk-high-bg px-3 py-2 text-sm text-risk-high-deep">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "登录" : "注册并登录"}
            </button>
          </form>

          {/* 演示账号提示 */}
          <div className="mt-5 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
            演示账号：<span className="font-semibold text-stone-700">demo</span>，密码：
            <span className="font-semibold text-stone-700">123456</span>。
            也可以注册自己的账号，设备和档案相互独立。
          </div>

          {/* 离线体验模式：部署站无后端 / 后端临时不可用时仍可完整浏览 */}
          <button
            type="button"
            onClick={() => {
              signIn({ id: 900, username: "演示访客", email: null });
              navigate("/", { replace: true });
            }}
            className="mt-3 w-full rounded-xl border border-stone-300 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            后端不可用？进入离线体验模式 →
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-stone-400">
          <Link to="/diagnose" className="hover:text-brand-700">
            先不登录，随便看看 →
          </Link>
        </p>
      </div>
    </div>
  );
}

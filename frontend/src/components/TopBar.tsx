import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Settings, User } from "lucide-react";

import { useToast } from "./Toast";
import { useAuthStore } from "../stores/authStore";
import { usePrefs } from "../stores/prefs";
import { loginHref } from "../utils/redirect";

interface TopBarProps {
  /** 移动端（<1024px）汉堡按钮点击：打开导航抽屉 */
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { mode, setMode } = usePrefs();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const latestPath = `${location.pathname}${location.search}`;

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      setMenuOpen(false);
      notify("已退出登录，当前为游客演示", "success");
      navigate("/");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="app-topbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-surface/95 px-4 backdrop-blur sm:px-6">
      {/* 左：移动端菜单按钮 + 欢迎语（副标题窄屏隐藏） */}
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="打开导航菜单"
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-900">
            {status === "authenticated" && user
              ? `你好，${user.nickname}`
              : "欢迎使用修必达"}
          </p>
          <p className="hidden truncate text-xs text-stone-500 sm:block">
            {status === "authenticated"
              ? `已登录 · 账号 ${user?.username}`
              : "家电故障分诊与维修决策助手"}
          </p>
        </div>
      </div>

      {/* 右：操作区（长辈模式文案窄屏缩短） */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* 长辈关怀模式切换 */}
        <button
          type="button"
          onClick={() => setMode(mode === "elder" ? "standard" : "elder")}
          aria-pressed={mode === "elder"}
          aria-label="切换长辈关怀模式"
          className={[
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "elder"
              ? "border-amber-500 bg-amber-100 text-amber-800"
              : "border-stone-300 bg-surface text-stone-600 hover:bg-stone-100",
          ].join(" ")}
        >
          <span className="sm:hidden">{mode === "elder" ? "👵 长辈" : "长辈模式"}</span>
          <span className="hidden sm:inline">
            {mode === "elder" ? "👵 长辈模式" : "长辈关怀模式"}
          </span>
        </button>

        {/* 真实登录状态标识：游客演示明确标注 */}
        {status === "guest" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <span className="sm:hidden">游客</span>
            <span className="hidden sm:inline">游客演示</span>
          </span>
        )}

        {/* 通知按钮 - 未接入后端，标注演示状态 */}
        <button
          type="button"
          aria-label="通知（演示状态）"
          className="hidden rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-700 sm:block"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* 账号入口：游客直接去登录，登录用户打开真实账户菜单 */}
        {status === "authenticated" && user ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="用户菜单"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 hover:bg-brand-200"
            >
              {user.nickname.slice(0, 1)}
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="账户菜单"
                className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-stone-200 bg-surface shadow-card"
              >
                <div className="border-b border-stone-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {user.nickname}
                  </p>
                  <p className="truncate text-xs text-stone-500">账号：{user.username}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings?edit=profile");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                >
                  <User className="h-4 w-4" /> 编辑资料
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings?edit=password");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                >
                  <Settings className="h-4 w-4" /> 修改密码
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2 border-t border-stone-100 px-4 py-2.5 text-left text-sm text-risk-high hover:bg-risk-high-bg disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? "退出中…" : "退出登录"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate(loginHref(latestPath))}
            className="flex h-8 items-center gap-1.5 rounded-full bg-brand-100 px-3 text-xs font-medium text-brand-700 hover:bg-brand-200"
          >
            <User className="h-4 w-4" />
            登录 / 注册
          </button>
        )}
      </div>
    </header>
  );
}

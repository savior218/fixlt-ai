import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, Settings, User } from "lucide-react";

import NotificationBell from "./NotificationBell";
import SidebarToggle from "./SidebarToggle";
import { useToast } from "./Toast";
import { useAuthStore } from "../stores/authStore";
import { useAvatarStore } from "../stores/avatarStore";
import { usePrefs } from "../stores/prefs";
import { loginHref } from "../utils/redirect";

interface TopBarProps {
  /** 移动端（<1024px）汉堡按钮点击：打开导航抽屉 */
  onMenuClick?: () => void;
  /** 桌面（≥1024px）左侧导航栏当前是否展开 */
  sidebarOpen: boolean;
  /** 桌面（≥1024px）三角形按钮点击：折叠 / 展开左侧导航栏 */
  onToggleSidebar: () => void;
}

export default function TopBar({
  onMenuClick,
  sidebarOpen,
  onToggleSidebar,
}: TopBarProps) {
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
      {/* 左：侧栏收起后的展开按钮 + 移动端菜单按钮 + 欢迎语（副标题窄屏隐藏） */}
      <div className="flex min-w-0 items-center gap-1">
        {/* 桌面（≥1024px）：侧栏收起后，展开按钮才会出现在顶栏最左侧 */}
        {!sidebarOpen && (
          <SidebarToggle
            open={sidebarOpen}
            onToggle={onToggleSidebar}
            className="hidden lg:inline-flex"
          />
        )}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="打开导航菜单"
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">修必达</p>
          <p className="hidden truncate text-xs text-stone-500 sm:block">
            FixIt AI
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

        {/* 通知中心（模块⑤：本地通知 + 未读徽标） */}
        <NotificationBell />

        {/* 账号入口：游客直接去登录，登录用户打开真实账户菜单 */}
        {status === "authenticated" && user ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="用户菜单"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-bold text-brand-700 hover:bg-brand-200"
            >
              <TopBarAvatar userId={user.id} fallback={user.nickname.slice(0, 1)} />
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

/** 头像：有自定义照片显示照片，否则显示首字母 */
function TopBarAvatar({ userId, fallback }: { userId: number; fallback: string }) {
  const avatarUrl = useAvatarStore((s) => s.avatars[userId] ?? null);
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-8 w-8 object-cover" />;
  }
  return <span aria-hidden>{fallback}</span>;
}

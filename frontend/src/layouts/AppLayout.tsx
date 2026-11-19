import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import Loading from "../components/Loading";
import MobileNavDrawer, { DESKTOP_NAV_QUERY } from "../components/MobileNavDrawer";
import SafetyBanner from "../components/SafetyBanner";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import { ToastProvider } from "../components/Toast";
import { useApplyPrefs } from "../hooks/useApplyPrefs";
import { useAuthStore } from "../stores/authStore";
import { loginHref } from "../utils/redirect";

export default function AppLayout() {
  useApplyPrefs();
  const location = useLocation();
  /** 移动端导航抽屉（<1024px 由 TopBar 汉堡按钮触发） */
  const [navOpen, setNavOpen] = useState(false);
  const status = useAuthStore((s) => s.status);
  const epoch = useAuthStore((s) => s.epoch);
  const authError = useAuthStore((s) => s.error);
  const clearAuthError = useAuthStore((s) => s.clearError);
  const hydrate = useAuthStore((s) => s.hydrate);

  // 刷新后必须通过服务端恢复登录状态，不能仅凭本地标志认定已登录
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // 路由变化时自动收起抽屉，避免遮挡新页面内容
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // 视口达到桌面宽度（≥1024px）自动关闭抽屉，避免遮罩残留
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_NAV_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setNavOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loading label="正在恢复登录状态…" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="app-shell flex min-h-screen">
        <a
          href="#main-content"
          className="skip-link rounded-lg bg-brand-700 px-4 py-2 text-sm text-white"
        >
          跳到主要内容
        </a>

        {/* 桌面（≥1024px）：左侧固定导航栏 240px；窄屏由 CSS 隐藏 */}
        <SidebarNav />

        {/* 移动/平板（<1024px）：汉堡按钮 + 抽屉导航，入口与桌面一致 */}
        <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />

        {/* 右侧：顶栏 + 主内容 + 底部安全横幅 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenuClick={() => setNavOpen(true)} />
          <main id="main-content" className="app-content flex-1" tabIndex={-1}>
            {authError && (
              <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {authError}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Link
                    to={loginHref(`${location.pathname}${location.search}`)}
                    className="font-medium underline"
                  >
                    重新登录
                  </Link>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="text-xs text-amber-700 underline"
                  >
                    知道了
                  </button>
                </span>
              </div>
            )}
            {/* 账号切换 / 退出 / 失效时重新挂载页面，清空上一账号的页面内存状态 */}
            <div key={`${location.pathname}-${epoch}`}>
              <Outlet />
            </div>
          </main>
          <SafetyBanner />
        </div>
      </div>
    </ToastProvider>
  );
}

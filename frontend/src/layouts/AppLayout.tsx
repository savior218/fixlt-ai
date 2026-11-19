import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import MobileNavDrawer from "../components/MobileNavDrawer";
import SafetyBanner from "../components/SafetyBanner";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import { ToastProvider } from "../components/Toast";
import { useApplyPrefs } from "../hooks/useApplyPrefs";
import { useAuthStore } from "../stores/authStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";

export default function AppLayout() {
  useApplyPrefs();
  const location = useLocation();
  /** 登录守卫：未登录一律跳转登录页 */
  const user = useAuthStore((s) => s.user);
  /** 切换账号时重置诊断草稿，避免上一个账号的问诊串到新账号 */
  const resetDraft = useDiagnosisStore((s) => s.resetDraft);
  const lastUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (user && lastUserIdRef.current !== user.id) {
      if (lastUserIdRef.current !== null) resetDraft();
      lastUserIdRef.current = user.id;
    }
  }, [user, resetDraft]);
  /** 移动端导航抽屉（<1024px 由 TopBar 汉堡按钮触发） */
  const [navOpen, setNavOpen] = useState(false);

  // 路由变化时自动收起抽屉，避免遮挡新页面内容
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  if (!user) {
    return <Navigate to="/login" replace />;
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
            <div key={location.pathname}>
              <Outlet />
            </div>
          </main>
          <SafetyBanner />
        </div>
      </div>
    </ToastProvider>
  );
}

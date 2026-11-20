import { Link, Outlet } from "react-router-dom";

import BrandMark from "../components/BrandMark";
import { useApplyPrefs } from "../hooks/useApplyPrefs";

/**
 * 公开信息页外壳：法律文档（隐私政策 / 用户协议 / 版权说明 / 关于我们）
 * 无需登录即可访问，避免未登录用户点击协议链接时被登录门禁弹回。
 */
export default function PublicLayout() {
  useApplyPrefs();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-surface/95 backdrop-blur">
        <div
          className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6"
          style={{ height: "var(--topbar-height)" }}
        >
          <BrandMark />
          <Link
            to="/"
            className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

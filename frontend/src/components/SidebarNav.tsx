import { NavLink, useLocation } from "react-router-dom";

import BrandMark from "./BrandMark";
import { NAV_ITEMS, SAFETY_ITEM } from "../config/navigation";
import { usePrefs } from "../stores/prefs";
import SidebarToggle from "./SidebarToggle";

export default function SidebarNav({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const SafetyIcon = SAFETY_ITEM.icon;
  /** 长辈模式：当前项改用实心高亮，并精简底部次要入口 */
  const elder = usePrefs((s) => s.mode === "elder");
  /** 减少动画时直接跳转，不做平滑滚动 */
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const { pathname } = useLocation();

  /** 重复点击当前页的导航项也回到顶部；换页回顶由 AppLayout 统一处理 */
  const handleNavClick = (to: string) => {
    if (pathname !== to) return;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <aside
      id="app-sidebar"
      aria-hidden={!open}
      className={[
        "app-sidebar sticky top-0 flex h-screen flex-col border-r border-stone-200 bg-surface",
        open ? "" : "app-sidebar-collapsed",
      ].join(" ")}
    >
      {/* Logo 区：高度与 TopBar 对齐；右侧为收起按钮（收起后按钮移交顶栏） */}
      <div
        className="app-sidebar-brand flex items-center justify-between gap-2 pl-4 pr-2"
        style={{ height: "var(--topbar-height)" }}
      >
        <BrandMark />
        <SidebarToggle open={open} onToggle={onToggle} className="inline-flex" />
      </div>

      {/* 导航菜单（与 MobileNavDrawer 共用 NAV_ITEMS） */}
      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => handleNavClick(item.to)}
                  className={({ isActive }) =>
                    [
                      "app-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? elder
                          ? "bg-brand-600 font-bold text-white"
                          : "bg-brand-100 text-brand-800"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                    ].join(" ")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 底部安全守护入口（安全专题页；长辈模式精简为隐藏） */}
      <div data-elder="hide" className="border-t border-stone-200 px-3 py-3">
        <NavLink
          to={SAFETY_ITEM.to}
          onClick={() => handleNavClick(SAFETY_ITEM.to)}
          className={({ isActive }) =>
            [
              "app-nav-link flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-100 text-brand-800"
                : "text-stone-600 hover:bg-stone-100",
            ].join(" ")
          }
        >
          <SafetyIcon className="h-5 w-5 text-brand-600" aria-hidden />
          {SAFETY_ITEM.label}
        </NavLink>
      </div>
    </aside>
  );
}

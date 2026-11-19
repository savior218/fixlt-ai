import { NavLink } from "react-router-dom";

import { NAV_ITEMS, SAFETY_ITEM } from "../config/navigation";

export default function SidebarNav() {
  const SafetyIcon = SAFETY_ITEM.icon;

  return (
    <aside className="app-sidebar sticky top-0 flex h-screen flex-col border-r border-stone-200 bg-surface">
      {/* Logo 区：高度与 TopBar 对齐 */}
      <div
        className="flex items-center gap-2 border-b border-stone-200 px-5"
        style={{ height: "var(--topbar-height)" }}
      >
        <span className="text-xl" aria-hidden>
          🔧
        </span>
        <span className="text-base font-bold text-stone-900">修必达</span>
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
                  className={({ isActive }) =>
                    [
                      "app-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-brand-100 text-brand-800"
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

      {/* 底部安全守护入口 */}
      <div className="border-t border-stone-200 px-3 py-3">
        <NavLink
          to={SAFETY_ITEM.to}
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

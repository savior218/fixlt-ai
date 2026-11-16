import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useApplyPrefs } from "../hooks/useApplyPrefs";
import { usePrefs } from "../stores/prefs";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: "🏠", end: true },
  { to: "/diagnose", label: "诊断", icon: "🔧" },
  { to: "/devices", label: "设备", icon: "❄️" },
  { to: "/records", label: "档案", icon: "📋" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function AppLayout() {
  useApplyPrefs();
  const { mode, setMode } = usePrefs();
  const location = useLocation();

  const navClasses = ({ isActive }: { isActive: boolean }) =>
    [
      "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium",
      isActive
        ? "bg-cyan-100 text-cyan-800"
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
    ].join(" ");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-base font-bold">智修AI · FixItAI</p>
            <p className="text-xs text-slate-500">家电故障分诊与维修决策助手</p>
          </div>
          <button
            type="button"
            onClick={() => setMode(mode === "elder" ? "standard" : "elder")}
            aria-pressed={mode === "elder"}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "elder"
                ? "border-amber-500 bg-amber-100 text-amber-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            {mode === "elder" ? "👵 长辈模式已开启" : "长辈关怀模式"}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <div key={location.pathname} className="animate-none">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="主导航"
        className="fixed bottom-0 left-1/2 z-10 w-full max-w-3xl -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur"
      >
        <div className="flex items-stretch justify-around px-2 py-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClasses}>
              <span aria-hidden className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

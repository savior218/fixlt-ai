import { Bell, Menu, User } from "lucide-react";

import { usePrefs } from "../stores/prefs";

interface TopBarProps {
  /** 移动端（<1024px）汉堡按钮点击：打开导航抽屉 */
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { mode, setMode } = usePrefs();

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
          <p className="truncate text-sm font-medium text-stone-900">欢迎使用修必达</p>
          <p className="hidden truncate text-xs text-stone-500 sm:block">
            家电故障分诊与维修决策助手
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

        {/* 演示状态标识（窄屏隐藏，减少拥挤） */}
        <span className="hidden text-xs text-stone-400 md:inline">演示</span>

        {/* 通知按钮 - 未接入后端，标注演示状态 */}
        <button
          type="button"
          aria-label="通知（演示状态）"
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* 用户头像 - 未接入后端，标注演示状态 */}
        <button
          type="button"
          aria-label="用户菜单（演示状态）"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200"
        >
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

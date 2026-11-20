import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ShieldCheck, X } from "lucide-react";

import BrandMark from "./BrandMark";
import { NAV_ITEMS, SAFETY_ITEM } from "../config/navigation";
import { usePrefs } from "../stores/prefs";

/** 桌面侧栏断点（与 layout.css 的 1023px/1024px 保持一致） */
export const DESKTOP_NAV_QUERY = "(min-width: 1024px)";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 移动 / 平板端抽屉导航（<1024px 顶栏菜单按钮触发）。
 * - 模态层：遮罩 + Escape + 关闭按钮可关闭；点击抽屉内部不误关
 * - 打开后锁定背景滚动，焦点移入并限制在抽屉内；关闭后恢复到触发按钮
 * - 路由切换自动关闭；视口达到桌面宽度（≥1024px）自动关闭并解除锁定
 */
export default function MobileNavDrawer({
  id,
  open,
  onClose,
}: {
  /** 与顶栏菜单按钮 aria-controls 对应（可选） */
  id?: string;
  open: boolean;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  /** 长辈模式：当前项改用实心高亮，隐藏重复的安全守护入口 */
  const elder = usePrefs((s) => s.mode === "elder");
  /** 减少动画时直接跳转，不做平滑滚动 */
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const { pathname } = useLocation();
  /** 触发按钮：打开时记录，关闭时归还焦点 */
  const triggerRef = useRef<Element | null>(null);
  const [mounted, setMounted] = useState(false);

  /* ---- 挂载过渡：先渲染再显示，支持进入动画 ---- */
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  /* ---- 打开：记录触发元素 / 锁定滚动 / 聚焦抽屉；关闭：归还焦点 ---- */
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement ?? null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 等待抽屉渲染后聚焦关闭按钮
    const t = window.setTimeout(() => {
      const first = drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  /* ---- Escape 关闭 ---- */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* ---- 焦点陷阱：Tab 循环限制在抽屉内 ---- */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !drawerRef.current) return;
    const items = Array.from(
      drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  /* ---- 路由变化关闭：NavLink 点击后由调用方通过 location 触发 onClose；
         滚动锁定统一由上面的 open effect 清理，避免无条件清空覆盖其他弹窗 ---- */

  if (!open) return null;

  /** 关闭抽屉；若点的正是当前页，等滚动锁解除后回到顶部 */
  const handleNavClick = (to: string) => {
    onClose();
    if (pathname !== to) return;
    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }, 0);
  };

  const linkClass = (isActive: boolean) =>
    [
      "app-nav-link flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
      isActive
        ? elder
          ? "bg-brand-600 font-bold text-white"
          : "bg-brand-100 text-brand-800"
        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    ].join(" ");

  return (
    <div
      id={id}
      className="mobile-nav-layer fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="主导航菜单"
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* 抽屉面板（safe-pad-bottom 兜底 iPhone 底部安全区） */}
      <div
        ref={drawerRef}
        onKeyDown={handleKeyDown}
        className={[
          "mobile-nav-drawer safe-pad-bottom absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-stone-200 bg-surface shadow-card",
          mounted ? "mobile-nav-drawer-open" : "",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：品牌 + 关闭 */}
        <div className="flex h-16 items-center justify-between border-b border-stone-200 pl-5 pr-3">
          <BrandMark />
          <button
            type="button"
            aria-label="关闭导航菜单"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 导航菜单 */}
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
                    className={({ isActive }) => linkClass(isActive)}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 底部安全守护（安全专题页，与桌面侧栏一致；长辈模式下精简隐藏） */}
        <div data-elder="hide" className="border-t border-stone-200 px-3 py-3">
          <NavLink
            to={SAFETY_ITEM.to}
            onClick={() => handleNavClick(SAFETY_ITEM.to)}
            className={({ isActive }) => linkClass(isActive)}
          >
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
            {SAFETY_ITEM.label}
          </NavLink>
        </div>
      </div>
    </div>
  );
}

﻿import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { ShieldCheck, X } from "lucide-react";

import { NAV_ITEMS, SAFETY_ITEM } from "../config/navigation";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 移动端 / 平板竖屏导航抽屉（<1024px）
 * 与 SidebarNav 共用 NAV_ITEMS，业务入口一个不少；
 * 不改变任何风险与安全逻辑，仅承载导航跳转。
 */
export default function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  /** 打开前的焦点元素，关闭时恢复（避免焦点丢失到 body） */
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc 关闭；打开时锁定背景滚动、焦点移入抽屉；关闭时恢复焦点
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const linkClass = (isActive: boolean) =>
    [
      "app-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
      isActive
        ? "bg-brand-100 text-brand-800"
        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    ].join(" ");

  return (
    <div className="lg:hidden">
      {/* 遮罩层：点击关闭 */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* 抽屉面板（safe-pad-bottom 兜底 iPhone 底部安全区） */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="导航菜单"
        className="mobile-nav-panel safe-pad-bottom fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-stone-200 bg-surface shadow-card"
      >
        {/* Logo 区 + 关闭按钮 */}
        <div className="flex h-16 items-center justify-between border-b border-stone-200 pl-5 pr-3">
          <span className="flex items-center gap-2 text-base font-bold text-stone-900">
            <span aria-hidden className="text-xl">🔧</span>修必达
          </span>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="关闭导航菜单"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 导航菜单：与桌面侧栏同源 */}
        <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
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

        {/* 底部安全守护入口（与桌面侧栏一致） */}
        <div className="border-t border-stone-200 px-3 py-3">
          <NavLink
            to={SAFETY_ITEM.to}
            onClick={onClose}
            className={({ isActive }) => linkClass(isActive)}
          >
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
            {SAFETY_ITEM.label}
          </NavLink>
        </div>
      </aside>
    </div>
  );
}

﻿import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Menu, Settings, User, UserRound } from "lucide-react";

import NotificationBell from "./NotificationBell";
import { useAuthStore } from "../stores/authStore";
import { usePrefs } from "../stores/prefs";

interface TopBarProps {
  /** 移动端（<1024px）汉堡按钮点击：打开导航抽屉 */
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { mode, setMode } = usePrefs();
  const user = useAuthStore((s) => s.user);
  const avatarUrl = useAuthStore((s) =>
    s.user ? (s.avatars[s.user.id] ?? null) : null,
  );
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  /* 用户菜单（头像点击展开） */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function goSettings() {
    setMenuOpen(false);
    navigate("/settings");
  }

  function handleLogout() {
    setMenuOpen(false);
    signOut();
    navigate("/login", { replace: true });
  }

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
          <p className="truncate text-sm font-semibold text-stone-900">FixIt AI</p>
          <p className="hidden truncate text-xs text-stone-500 sm:block">
            AI 家电维修助手
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

        {/* 用户头像：点击展开菜单（个人中心 / 退出登录） */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="用户菜单"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition-colors hover:bg-brand-200"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : user ? (
              <span aria-hidden className="text-xs font-bold">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="用户菜单"
              className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-stone-200 bg-surface p-1.5 shadow-lg"
            >
              <div className="px-3 py-2">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-stone-800">
                  <UserRound aria-hidden className="h-3.5 w-3.5 text-stone-400" />
                  {user?.username ?? "未登录"}
                </p>
                {user && <p className="mt-0.5 text-xs text-stone-400">账号 #{user.id}</p>}
              </div>
              <div aria-hidden className="my-1 border-t border-stone-100" />
              <button
                role="menuitem"
                type="button"
                onClick={goSettings}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Settings aria-hidden className="h-4 w-4 text-stone-400" />
                个人中心
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

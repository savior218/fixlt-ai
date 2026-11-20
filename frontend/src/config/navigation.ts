import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Home,
  Phone,
  Refrigerator,
  ShieldCheck,
  Stethoscope,
  User,
  Wrench,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** 主导航单一数据源：SidebarNav（桌面）与 MobileNavDrawer（移动）共用，
    保证三端业务入口完全一致，不因屏幕缩小而隐藏入口 */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/diagnose", label: "AI诊断", icon: Stethoscope },
  { to: "/devices", label: "我的设备", icon: Refrigerator },
  { to: "/repair", label: "智能报修", icon: Wrench },
  { to: "/hotlines", label: "售后电话", icon: Phone },
  { to: "/records", label: "维修档案", icon: ClipboardList },
  { to: "/settings", label: "个人中心", icon: User },
];

/** 底部安全守护入口（两端共用） */
export const SAFETY_ITEM: NavItem = {
  to: "/safety",
  label: "安全守护",
  icon: ShieldCheck,
};

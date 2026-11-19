﻿import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
}

interface AuthState {
  /** 当前登录用户；null = 未登录（会跳转登录页） */
  user: AuthUser | null;
  /** 各账号的自定义头像（dataURL，按用户 ID 隔离，本地存储） */
  avatars: Record<number, string>;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
  setAvatar: (userId: number, dataUrl: string) => void;
}

/** 会话状态（localStorage 持久化；后端数据按用户 ID 隔离） */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      avatars: {},
      signIn: (user) => set({ user }),
      signOut: () => set({ user: null }),
      setAvatar: (userId, dataUrl) =>
        set((s) => ({ avatars: { ...s.avatars, [userId]: dataUrl } })),
    }),
    { name: "fixitai-auth" },
  ),
);

/** 读取指定账号的头像（无则返回 null，调用方回退首字母） */
export function getAvatar(userId: number | undefined | null): string | null {
  if (userId == null) return null;
  return useAuthStore.getState().avatars[userId] ?? null;
}

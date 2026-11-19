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
  signIn: (user: AuthUser) => void;
  signOut: () => void;
}

/** 会话状态（localStorage 持久化；后端数据按用户 ID 隔离） */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (user) => set({ user }),
      signOut: () => set({ user: null }),
    }),
    { name: "fixitai-auth" },
  ),
);

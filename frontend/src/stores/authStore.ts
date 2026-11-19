import { create } from "zustand";

import {
  ApiError,
  changeAccountPassword,
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
  setCsrfToken,
  setUnauthorizedHandler,
  updateAccountProfile,
  type AuthSessionPayload,
  type AuthUser,
} from "../services/api";
import {
  LOCAL_OWNER,
  ownerKeyForUser,
  setCurrentOwner,
} from "../services/identity";
import { useDeviceStore } from "./deviceStore";
import { useDiagnosisStore } from "./diagnosisStore";
import { useRepairStore } from "./repairStore";

export type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  csrfToken: string;
  error: string | null;
  /** 账号上下文版本：登录 / 退出 / 失效时递增，用于重置页面内存状态 */
  epoch: number;
  initialized: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    nickname?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<string>;
  markExpired: () => void;
  clearError: () => void;
}

function syncOwner(ownerKey: string): void {
  setCurrentOwner(ownerKey);
  useDiagnosisStore.getState().applyOwner(ownerKey);
  useRepairStore.getState().applyOwner(ownerKey);
  useDeviceStore.getState().applyOwner(ownerKey);
}

/** 登录后拉取当前账号的报告与维修记录；失败不阻断登录 */
async function syncCloudRecords(): Promise<void> {
  await Promise.allSettled([
    useDiagnosisStore.getState().loadCloud(),
    useRepairStore.getState().loadCloud(),
  ]);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: "loading",
  user: null,
  csrfToken: "",
  error: null,
  epoch: 0,
  initialized: false,

  hydrate: async () => {
    if (get().initialized) return;
    set({ status: "loading", error: null });
    try {
      const payload = await getCurrentAccount();
      syncOwner(ownerKeyForUser(payload.user.id));
      setCsrfToken(payload.csrf_token);
      await syncCloudRecords();
      set((s) => ({
        status: "authenticated",
        user: payload.user,
        csrfToken: payload.csrf_token,
        initialized: true,
        epoch: s.epoch + 1,
      }));
    } catch (e) {
      syncOwner(LOCAL_OWNER);
      setCsrfToken("");
      const message =
        e instanceof ApiError && e.status === 401
          ? null
          : "无法连接账号服务，当前以游客演示模式运行";
      set((s) => ({
        status: "guest",
        user: null,
        csrfToken: "",
        error: message,
        initialized: true,
        epoch: s.epoch + 1,
      }));
    }
  },

  login: async (username, password) => {
    const payload = await loginAccount({ username, password });
    syncOwner(ownerKeyForUser(payload.user.id));
    setCsrfToken(payload.csrf_token);
    await syncCloudRecords();
    set((s) => ({
      status: "authenticated",
      user: payload.user,
      csrfToken: payload.csrf_token,
      error: null,
      epoch: s.epoch + 1,
    }));
  },

  register: async (username, password, nickname) => {
    const payload = await registerAccount({ username, password, nickname });
    syncOwner(ownerKeyForUser(payload.user.id));
    setCsrfToken(payload.csrf_token);
    await syncCloudRecords();
    set((s) => ({
      status: "authenticated",
      user: payload.user,
      csrfToken: payload.csrf_token,
      error: null,
      epoch: s.epoch + 1,
    }));
  },

  logout: async () => {
    await logoutAccount();
    syncOwner(LOCAL_OWNER);
    setCsrfToken("");
    set((s) => ({
      status: "guest",
      user: null,
      csrfToken: "",
      error: null,
      epoch: s.epoch + 1,
    }));
  },

  updateNickname: async (nickname) => {
    const payload: AuthSessionPayload = await updateAccountProfile(nickname);
    setCsrfToken(payload.csrf_token);
    set({
      user: payload.user,
      csrfToken: payload.csrf_token,
      status: "authenticated",
      error: null,
    });
  },

  changePassword: async (currentPassword, newPassword) => {
    const result = await changeAccountPassword({
      current_password: currentPassword,
      new_password: newPassword,
    });
    // 修改密码后服务端已撤销全部旧会话，前端同步回到游客状态
    syncOwner(LOCAL_OWNER);
    setCsrfToken("");
    set((s) => ({
      status: "guest",
      user: null,
      csrfToken: "",
      error: null,
      epoch: s.epoch + 1,
    }));
    return result.message;
  },

  markExpired: () => {
    if (get().status !== "authenticated") return;
    syncOwner(LOCAL_OWNER);
    setCsrfToken("");
    set((s) => ({
      status: "guest",
      user: null,
      csrfToken: "",
      error: "登录状态已失效，请重新登录",
      epoch: s.epoch + 1,
    }));
  },

  clearError: () => set({ error: null }),
}));

// 设备等私有接口返回 401 时，只更新前端状态与提示，不做自动跳转，避免跳转循环
setUnauthorizedHandler(() => useAuthStore.getState().markExpired());

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 账号头像（localStorage 持久化，按用户 ID 隔离）。
 * 与登录会话解耦：会话来自服务端 Cookie，头像属于本地展示数据。
 */
interface AvatarState {
  avatars: Record<number, string>;
  setAvatar: (userId: number, dataUrl: string) => void;
}

export const useAvatarStore = create<AvatarState>()(
  persist(
    (set) => ({
      avatars: {},
      setAvatar: (userId, dataUrl) =>
        set((s) => ({ avatars: { ...s.avatars, [userId]: dataUrl } })),
    }),
    { name: "fixitai-avatars" },
  ),
);

/** 读取指定账号的头像（无则返回 null，调用方回退首字母） */
export function getAvatar(userId: number | undefined | null): string | null {
  if (userId == null) return null;
  return useAvatarStore.getState().avatars[userId] ?? null;
}

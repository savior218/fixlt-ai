import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 登录门户页可选语言：简体 / 繁体 / 英文 */
export type Locale = "zh-Hans" | "zh-Hant" | "en";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** 语言偏好持久化：与微信网页版一致，选择后下次访问保持 */
export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "zh-Hans",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "fixitai-locale" }
  )
);

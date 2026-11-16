import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 交互模式：标准 / 长辈关怀（视障、听障、操作辅助为 V1.1 规划） */
export type InteractionMode = "standard" | "elder";
export type FontScale = "normal" | "large" | "xlarge";

interface PrefsState {
  mode: InteractionMode;
  fontScale: FontScale;
  voiceEnabled: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  setMode: (mode: InteractionMode) => void;
  setFontScale: (scale: FontScale) => void;
  setVoiceEnabled: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  reset: () => void;
}

/** 长辈关怀模式要求大字体：切换时字体不小于「大」 */
function bumpScaleForMode(mode: InteractionMode, scale: FontScale): FontScale {
  if (mode === "elder" && scale === "normal") return "large";
  return scale;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      mode: "standard",
      fontScale: "normal",
      voiceEnabled: false,
      highContrast: false,
      reduceMotion: false,
      setMode: (mode) =>
        set((s) => ({
          mode,
          fontScale: bumpScaleForMode(mode, s.fontScale),
        })),
      setFontScale: (fontScale) =>
        set((s) => ({
          fontScale,
          // 手动调回标准字号时，若仍处于长辈模式则保持大字体约束
          mode: fontScale === "normal" && s.mode === "elder" ? s.mode : s.mode,
        })),
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      reset: () =>
        set({
          mode: "standard",
          fontScale: "normal",
          voiceEnabled: false,
          highContrast: false,
          reduceMotion: false,
        }),
    }),
    { name: "fixitai-prefs" }
  )
);

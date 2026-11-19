import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 交互模式：标准 / 长辈关怀（视障、听障、操作辅助为 V1.1 规划） */
export type InteractionMode = "standard" | "elder";
export type FontScale = "normal" | "large" | "xlarge";
/** 对比度三档（P9 显示设置） */
export type ContrastLevel = "normal" | "high" | "extra";

export const ZOOM_MIN = 80;
export const ZOOM_MAX = 150;
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;

interface PrefsState {
  mode: InteractionMode;
  fontScale: FontScale;
  /** 页面缩放百分比（80~150，100 = 不缩放） */
  zoom: number;
  contrast: ContrastLevel;
  voiceEnabled: boolean;
  /** 自动朗读 AI 回复 */
  autoRead: boolean;
  /** 语速 0.5 ~ 2.0 */
  speechRate: number;
  /** 指定音色标识；null 表示自动优先自然/中文音色 */
  speechVoiceURI: string | null;
  /** 消息免打扰：开启后新通知不再弹窗，仅保留未读小红点 */
  doNotDisturb: boolean;
  reduceMotion: boolean;
  setMode: (mode: InteractionMode) => void;
  setFontScale: (scale: FontScale) => void;
  setZoom: (zoom: number) => void;
  setContrast: (contrast: ContrastLevel) => void;
  setVoiceEnabled: (v: boolean) => void;
  setAutoRead: (v: boolean) => void;
  setSpeechRate: (v: number) => void;
  setSpeechVoiceURI: (v: string | null) => void;
  setDoNotDisturb: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  reset: () => void;
}

/** 长辈关怀模式要求大字体：切换时字体不小于「大」 */
function bumpScaleForMode(mode: InteractionMode, scale: FontScale): FontScale {
  if (mode === "elder" && scale === "normal") return "large";
  return scale;
}

const INITIAL = {
  mode: "standard" as InteractionMode,
  fontScale: "normal" as FontScale,
  zoom: 100,
  contrast: "normal" as ContrastLevel,
  voiceEnabled: false,
  autoRead: false,
  speechRate: 1,
  speechVoiceURI: null,
  doNotDisturb: false,
  reduceMotion: false,
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setMode: (mode) =>
        set((s) => ({
          mode,
          fontScale: bumpScaleForMode(mode, s.fontScale),
        })),
      setFontScale: (fontScale) => set({ fontScale }),
      setZoom: (zoom) =>
        set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom))) }),
      setContrast: (contrast) => set({ contrast }),
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setAutoRead: (autoRead) => set({ autoRead }),
      setSpeechRate: (speechRate) =>
        set({
          speechRate: Math.min(
            SPEECH_RATE_MAX,
            Math.max(SPEECH_RATE_MIN, Number(speechRate.toFixed(1)))
          ),
        }),
      setSpeechVoiceURI: (speechVoiceURI) => set({ speechVoiceURI }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setDoNotDisturb: (doNotDisturb) => set({ doNotDisturb }),
      reset: () => set({ ...INITIAL }),
    }),
    { name: "fixitai-prefs" }
  )
);

/* ============================================================
   全站统一语音朗读（阶段十三）
   - 使用浏览器原生 SpeechSynthesis，不接入付费服务
   - 同一时间只播放一段；开始新段落 / 停止 / 页面切换会取消旧内容
   - 语音列表异步加载；缺少中文音色时退回浏览器默认音色，不写死音色名
   - 不支持或播放失败只影响朗读，不影响文字阅读与诊断流程
   ============================================================ */

import { create } from "zustand";

import { SPEECH_RATE_MAX, SPEECH_RATE_MIN, usePrefs } from "../stores/prefs";
import { isWeChatBrowser, WECHAT_SPEECH_HINT } from "../utils/platform";

export type SpeechStatus = "idle" | "speaking" | "error";

export interface SpeechVoiceOption {
  /** 音色唯一标识：voiceURI，缺失时退回名称 */
  id: string;
  name: string;
}

interface SpeechState {
  /** 浏览器是否提供 SpeechSynthesis */
  supported: boolean;
  /** 语音列表是否已加载完成（可能为空） */
  ready: boolean;
  status: SpeechStatus;
  /** 当前正在朗读的段落标识 */
  activeKey: string | null;
  /** 最近一次可展示的错误（不阻塞页面） */
  error: string | null;
  /** 当前选用的音色名称（可能为默认音色） */
  voiceLabel: string | null;
  /** 可用的中文音色，供设置页手动选择 */
  voices: SpeechVoiceOption[];
  /** 语音列表已加载但没有中文音色 */
  noZhVoice: boolean;
  /** 当前语速（用于界面展示） */
  rate: number;
}

export const useSpeech = create<SpeechState>(() => ({
  supported: false,
  ready: false,
  status: "idle",
  activeKey: null,
  error: null,
  voiceLabel: null,
  voices: [],
  noZhVoice: false,
  rate: 1,
}));

// 仅开发环境暴露状态，便于本地试听排查（生产构建不包含）
if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __fixitaiSpeech?: unknown }).__fixitaiSpeech = useSpeech;
}

interface SpeakOptions {
  key: string;
  text: string;
  /** 缺省读取设置中的语速 */
  rate?: number;
}

let initialized = false;
let voicesLoaded = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
/** 语音代次：取消或开始新段落后旧回调不得改写状态 */
let generation = 0;
let safetyTimer: number | null = null;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function supported(): boolean {
  return !!synth() && typeof window.SpeechSynthesisUtterance !== "undefined";
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, value));
}

function refreshVoices(): void {
  const s = synth();
  if (!s) return;
  try {
    cachedVoices = s.getVoices();
  } catch {
    cachedVoices = [];
  }
  if (cachedVoices.length === 0) {
    // 首次调用常为空：保持“加载中”，由 voiceschanged 或超时兜底
    return;
  }
  voicesLoaded = true;
  const zhVoices = listChineseVoices(cachedVoices);
  const zh = pickChineseVoice(cachedVoices, usePrefs.getState().speechVoiceURI);
  useSpeech.setState({
    ready: true,
    voiceLabel: zh?.name ?? null,
    voices: zhVoices,
    noZhVoice: zhVoices.length === 0,
  });
}

function voiceKey(v: SpeechSynthesisVoice): string {
  return v.voiceURI || v.name || "";
}

function isChineseVoice(v: SpeechSynthesisVoice): boolean {
  const lang = (v.lang || "").toLowerCase();
  const name = (v.name || "").toLowerCase();
  return (
    lang.startsWith("zh") ||
    /chinese|mandarin|中文|普通话|国语/.test(name) ||
    /chinese|mandarin|中文|普通话|国语/.test(lang)
  );
}

/** 自然/神经网络音色通常明显不如系统旧版音色机械 */
const NATURAL_VOICE = /natural|neural|online|premium|enhanced|xiaoxiao|yunxi|yunyang|xiaoyi|yunjian|xiaomo|xiaoxuan|tutu/;
/** 同为系统音色时，优先语调更自然的常见中文女声；不存在时自动退回其他中文音色 */
const PREFERRED_SYSTEM_VOICE = /yaoyao|xiaoxiao|xiaoyi|tingting|meijia|mei-jia|sinji/;

/** 依次按语言标签、自然音色、语言前缀、常见中文音色关键词选择，不依赖固定名称 */
export function pickChineseVoice(
  voices: SpeechSynthesisVoice[],
  preferredId?: string | null
): SpeechSynthesisVoice | undefined {
  const chinese = voices.filter(isChineseVoice);
  if (chinese.length === 0) return undefined;
  if (preferredId) {
    const chosen = chinese.find((v) => voiceKey(v) === preferredId);
    if (chosen) return chosen;
  }
  const scored = chinese
    .map((v, index) => {
      const lang = (v.lang || "").toLowerCase();
      const name = (v.name || "").toLowerCase();
      let score = 0;
      if (lang.startsWith("zh-cn")) score += 10;
      if (lang.startsWith("zh")) score += 2;
      if (NATURAL_VOICE.test(name)) score += 30;
      if (PREFERRED_SYSTEM_VOICE.test(name)) score += 15;
      return { v, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.v;
}

function listChineseVoices(voices: SpeechSynthesisVoice[]): SpeechVoiceOption[] {
  return voices.filter(isChineseVoice).map((v) => ({
    id: voiceKey(v),
    name: v.name,
  }));
}

/** 设置页切换音色：保存偏好并立即停止旧音色，下一次朗读生效 */
export function selectSpeechVoice(id: string | null): void {
  usePrefs.getState().setSpeechVoiceURI(id);
  stopSpeech();
  const zh = pickChineseVoice(cachedVoices, id);
  useSpeech.setState({ voiceLabel: zh?.name ?? null });
}

/** 初始化：只绑定一次 voiceschanged，并在超时后标记“已尝试加载” */
export function initSpeech(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const isSupported = supported();
  useSpeech.setState({ supported: isSupported });

  const s = synth();
  if (!s || !isSupported) {
    useSpeech.setState({ ready: true });
    return;
  }

  const onVoices = () => refreshVoices();
  try {
    s.addEventListener("voiceschanged", onVoices);
  } catch {
    // 旧版 Safari 只支持 onvoiceschanged
    s.onvoiceschanged = onVoices;
  }
  refreshVoices();
  window.setTimeout(() => {
    if (!voicesLoaded) {
      refreshVoices();
      useSpeech.setState({ ready: true });
    }
  }, 1500);
}

function clearSafetyTimer(): void {
  if (safetyTimer !== null) {
    window.clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

/** 停止当前朗读（页面切换、退出、关闭语音、组件卸载时调用） */
export function stopSpeech(): void {
  generation += 1;
  clearSafetyTimer();
  const s = synth();
  if (s) {
    try {
      s.cancel();
      if (s.paused) s.resume();
    } catch {
      // 某些浏览器在未播放时 cancel 抛错，忽略即可
    }
  }
  useSpeech.setState({ status: "idle", activeKey: null });
}

/** 开始朗读新段落：自动停止旧内容，同一时间只播一段 */
export function speak({ key, text, rate }: SpeakOptions): boolean {
  if (!supported()) {
    useSpeech.setState({
      supported: false,
      status: "error",
      activeKey: null,
      error: isWeChatBrowser()
        ? WECHAT_SPEECH_HINT
        : "当前浏览器不支持语音合成，请改用最新版 Chrome 或 Edge。",
    });
    return false;
  }
  const prefs = usePrefs.getState();
  if (!prefs.voiceEnabled) {
    useSpeech.setState({
      status: "error",
      activeKey: null,
      error: "语音朗读已关闭，请先在设置中开启。",
    });
    return false;
  }
  const cleaned = normalizeSpeechText([text]);
  if (!cleaned) return false;

  stopSpeech();
  initSpeech();
  const myGeneration = generation;
  const voice = pickChineseVoice(cachedVoices, prefs.speechVoiceURI);
  const effectiveRate = clampRate(rate ?? prefs.speechRate);
  const s = synth();
  if (!s) return false;

  useSpeech.setState({ status: "speaking", activeKey: key, error: null, rate: effectiveRate });

  try {
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "zh-CN";
    if (voice) utterance.voice = voice;
    utterance.rate = effectiveRate;
    utterance.pitch = 1;
    utterance.onstart = () => {
      if (myGeneration !== generation) return;
      useSpeech.setState({ status: "speaking" });
    };
    utterance.onend = () => {
      if (myGeneration !== generation) return;
      clearSafetyTimer();
      useSpeech.setState({ status: "idle", activeKey: null });
    };
    utterance.onerror = (event) => {
      if (myGeneration !== generation) return;
      const code = (event as SpeechSynthesisErrorEvent).error;
      if (code === "interrupted" || code === "canceled") {
        useSpeech.setState({ status: "idle", activeKey: null });
        return;
      }
      clearSafetyTimer();
      useSpeech.setState({
        status: "error",
        activeKey: null,
        error:
          code === "not-allowed"
            ? "浏览器未允许自动播放语音，请点击「朗读」手动播放。"
            : "语音播放失败，文字内容仍可正常查看。",
      });
    };
    // Chrome 连续 cancel/speak 可能吞掉首个请求：稍作延迟并 resume
    window.setTimeout(() => {
      if (myGeneration !== generation) return;
      try {
        if (s.paused) s.resume();
        s.speak(utterance);
      } catch {
        useSpeech.setState({
          status: "error",
          activeKey: null,
          error: "语音播放失败，文字内容仍可正常查看。",
        });
      }
    }, 40);

    // 兜底：部分浏览器在后台标签页丢失 end 事件
    safetyTimer = window.setTimeout(() => {
      if (myGeneration !== generation) return;
      if (useSpeech.getState().status !== "idle") {
        stopSpeech();
      }
    }, 120_000);
    return true;
  } catch {
    useSpeech.setState({
      status: "error",
      activeKey: null,
      error: "语音播放失败，文字内容仍可正常查看。",
    });
    return false;
  }
}

/** 朗读 / 停止同一段 */
export function toggleSpeech(options: SpeakOptions): void {
  const state = useSpeech.getState();
  if (state.status === "speaking" && state.activeKey === options.key) {
    stopSpeech();
    return;
  }
  // 再次点击同一段时不重复叠加：先停再播
  speak(options);
}

/** 清理文本：合并标点与空白，避免把调试/排版符号读出来 */
export function normalizeSpeechText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join("。")
    .replace(/\s+/g, " ")
    .replace(/[`*#_]/g, "")
    .replace(/[。]{2,}/g, "。")
    .replace(/^。|。$/g, "")
    .trim();
}

/** 模板结果朗读前必须明确“并非真实 AI 诊断” */
export function speechLeadIn(source: "ai" | "template" | "unknown"): string {
  if (source === "template") return "以下是模板演示建议，并非真实 AI 诊断。";
  if (source === "unknown") return "以下内容未记录来源，无法确认是否由真实 AI 生成。";
  return "";
}

/** 自动朗读去重：刷新、重渲染、切换标签都不重复播报同一段 */
const ONCE_STORAGE_KEY = "fixitai-speech-once";

function readOnceKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ONCE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeOnceKeys(keys: Set<string>): void {
  try {
    const list = Array.from(keys).slice(-80);
    sessionStorage.setItem(ONCE_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 隐私模式下不可写：仅本次会话内存去重由调用方保证
  }
}

const memoryOnceKeys = new Set<string>();

/** 返回 true 表示该段尚未自动朗读过；随后记录，保证只播一次 */
export function shouldAutoRead(key: string): boolean {
  if (memoryOnceKeys.has(key)) return false;
  const stored = readOnceKeys();
  if (stored.has(key)) {
    memoryOnceKeys.add(key);
    return false;
  }
  memoryOnceKeys.add(key);
  stored.add(key);
  writeOnceKeys(stored);
  return true;
}

/** 仅在测试中重置去重状态 */
export function resetSpeechForTests(): void {
  memoryOnceKeys.clear();
  try {
    sessionStorage.removeItem(ONCE_STORAGE_KEY);
  } catch {
    // ignore
  }
  cachedVoices = [];
  voicesLoaded = false;
  initialized = false;
  stopSpeech();
}

// 设置变化：关闭语音或切换标准/长辈模式时立即停止，下一次用当前模式文案
usePrefs.subscribe((state, previous) => {
  if (previous.voiceEnabled && !state.voiceEnabled) stopSpeech();
  if (previous.mode !== state.mode) stopSpeech();
});

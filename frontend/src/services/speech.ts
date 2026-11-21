/* ============================================================
   全站统一语音朗读
   - 优先使用浏览器原生 SpeechSynthesis（免费、即时）
   - 浏览器没有该能力时，走后端 /api/tts 云端合成（WAV + <audio> 播放）
   - 同一时间只播放一段；开始新段落 / 停止 / 页面切换会取消旧内容
   - 语音列表异步加载；缺少中文音色时退回浏览器默认音色，不写死音色名
   - 不支持或播放失败只影响朗读，不影响文字阅读与诊断流程
   ============================================================ */

import { create } from "zustand";

import { SPEECH_RATE_MAX, SPEECH_RATE_MIN, usePrefs } from "../stores/prefs";
import { isWeChatBrowser } from "../utils/platform";

export type SpeechStatus = "idle" | "speaking" | "error";

export interface SpeechVoiceOption {
  /** 音色唯一标识：voiceURI，缺失时退回名称 */
  id: string;
  name: string;
}

interface SpeechState {
  /** 是否具备朗读能力（原生或云端任一可用） */
  supported: boolean;
  /** 浏览器是否提供原生 SpeechSynthesis */
  nativeSupported: boolean;
  /** 语音列表是否已加载完成（可能为空） */
  ready: boolean;
  status: SpeechStatus;
  /** 云端合成中（尚未开始播放） */
  loading: boolean;
  /** 当前正在朗读的段落标识 */
  activeKey: string | null;
  /** 最近一次可展示的错误（不阻塞页面） */
  error: string | null;
  /** 错误来源：autoplay 由页面内提示，不弹全局 toast */
  errorSource: "native" | "cloud" | "autoplay" | null;
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
  nativeSupported: false,
  ready: false,
  status: "idle",
  loading: false,
  activeKey: null,
  error: null,
  errorSource: null,
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

interface CloudSpeakOptions {
  text: string;
  rate: number;
  myGeneration: number;
}

let initialized = false;
let voicesLoaded = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
/** 语音代次：取消或开始新段落后旧回调不得改写状态 */
let generation = 0;
let safetyTimer: number | null = null;

/** 云端朗读：复用同一个 audio 元素，便于移动端在首次点击后解锁播放 */
let cloudAudio: HTMLAudioElement | null = null;
let cloudAudioUrl: string | null = null;
let cloudAbort: AbortController | null = null;
const cloudBlobCache = new Map<string, Blob>();
const CLOUD_CACHE_MAX = 4;
/** 280 字左右一段，兼顾供应商 1024 字上限与移动端首包延迟 */
const CLOUD_CHUNK_LIMIT = 280;
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

class SpeechAudioError extends Error {
  constructor(message: string, readonly autoplay = false) {
    super(message);
    this.name = "SpeechAudioError";
  }
}

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function nativeSupported(): boolean {
  return !!synth() && typeof window.SpeechSynthesisUtterance !== "undefined";
}

/** 云端兜底只依赖 fetch + Audio + Blob URL，微信/国产浏览器通常都具备 */
function canUseCloud(): boolean {
  return (
    typeof fetch === "function" &&
    typeof Audio !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
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
  const hasNative = nativeSupported();
  const hasCloud = canUseCloud();
  useSpeech.setState({
    nativeSupported: hasNative,
    supported: hasNative || hasCloud,
  });

  const s = synth();
  if (!s || !hasNative) {
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

function stopCloudAudio(): void {
  if (cloudAbort) {
    cloudAbort.abort();
    cloudAbort = null;
  }
  if (cloudAudio) {
    cloudAudio.onended = null;
    cloudAudio.onerror = null;
    try {
      cloudAudio.pause();
    } catch {
      // 忽略未开始播放时的 pause 异常
    }
    try {
      cloudAudio.removeAttribute("src");
      cloudAudio.load();
    } catch {
      // 某些浏览器不支持 load/removeAttribute 组合，忽略
    }
  }
  if (cloudAudioUrl) {
    try {
      URL.revokeObjectURL(cloudAudioUrl);
    } catch {
      // ignore
    }
    cloudAudioUrl = null;
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
  stopCloudAudio();
  useSpeech.setState({ status: "idle", activeKey: null, loading: false });
}

/** 把长文本切成供应商能接受、移动端首包不至于太慢的小段 */
export function splitForSpeech(text: string, limit = CLOUD_CHUNK_LIMIT): string[] {
  const breakChars = "。！？!?；;\n";
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = -1;
    for (let i = Math.min(limit, rest.length - 1); i >= Math.floor(limit * 0.6); i--) {
      if (breakChars.includes(rest[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = limit;
    const part = rest.slice(0, cut).trim();
    if (part) chunks.push(part);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function ensureCloudAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!cloudAudio) {
    cloudAudio = new Audio();
    cloudAudio.preload = "auto";
  }
  return cloudAudio;
}

/** 在用户点击的同一事件循环里播放静音音频，解锁移动端后续播放 */
function primeCloudAudio(): void {
  const el = ensureCloudAudio();
  if (!el) return;
  try {
    el.src = SILENT_WAV;
    const started = el.play();
    if (started && typeof started.catch === "function") {
      started.catch(() => undefined);
    }
  } catch {
    // 未解锁时静默失败，真正的播放错误会在 playCloudBlob 中提示
  }
}

async function fetchTtsBlob(
  text: string,
  speed: number,
  signal: AbortSignal
): Promise<Blob> {
  const cacheKey = `${speed.toFixed(2)}|${text}`;
  const cached = cloudBlobCache.get(cacheKey);
  if (cached) return cached;

  const resp = await fetch("/api/tts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed }),
    signal,
  });

  if (!resp.ok) {
    let message = "";
    try {
      const body = (await resp.json()) as { detail?: unknown };
      const detail = body.detail;
      if (typeof detail === "string") message = detail;
      else if (
        detail &&
        typeof detail === "object" &&
        "message" in detail &&
        typeof (detail as { message?: unknown }).message === "string"
      ) {
        message = String((detail as { message: string }).message);
      }
    } catch {
      // 非 JSON 错误体：走默认提示
    }
    if (!message) {
      message =
        resp.status === 429
          ? "朗读太频繁了，请稍后再试。"
          : "云端朗读暂不可用，请稍后重试。";
    }
    throw new Error(message);
  }

  const blob = await resp.blob();
  if (!blob.size) throw new Error("云端朗读返回为空，请稍后重试。");
  cloudBlobCache.set(cacheKey, blob);
  if (cloudBlobCache.size > CLOUD_CACHE_MAX) {
    const oldest = cloudBlobCache.keys().next().value;
    if (oldest) cloudBlobCache.delete(oldest);
  }
  return blob;
}

function playCloudBlob(blob: Blob): Promise<void> {
  const el = cloudAudio;
  if (!el || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.reject(new SpeechAudioError("当前浏览器不支持音频播放。"));
  }
  return new Promise<void>((resolve, reject) => {
    let url = "";
    try {
      url = URL.createObjectURL(blob);
    } catch {
      reject(new SpeechAudioError("音频准备失败，请重试。"));
      return;
    }
    cloudAudioUrl = url;
    const cleanup = () => {
      el.onended = null;
      el.onerror = null;
      if (cloudAudioUrl === url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        cloudAudioUrl = null;
      }
    };
    el.onended = () => {
      cleanup();
      resolve();
    };
    el.onerror = () => {
      cleanup();
      reject(new SpeechAudioError("音频播放失败，请重试。"));
    };
    el.src = url;
    const started = el.play();
    if (started && typeof started.catch === "function") {
      started.catch((err: unknown) => {
        cleanup();
        const name = err instanceof Error ? err.name : "";
        reject(
          name === "NotAllowedError"
            ? new SpeechAudioError(
                "浏览器限制自动播放，请点击「朗读」手动播放。",
                true
              )
            : new SpeechAudioError("音频播放失败，请重试。")
        );
      });
    }
  });
}

function cloudErrorMessage(err: unknown): string {
  if (err instanceof SpeechAudioError) return err.message;
  if (err instanceof TypeError) {
    return isWeChatBrowser()
      ? "云端朗读连接失败，请检查网络；也可点右上角在浏览器打开。"
      : "云端朗读连接失败，请检查网络后重试。";
  }
  if (err instanceof Error && err.message) return err.message;
  return "云端朗读暂不可用，请稍后重试。";
}

async function speakCloud({
  text,
  rate,
  myGeneration,
}: CloudSpeakOptions): Promise<void> {
  const controller = new AbortController();
  cloudAbort = controller;
  primeCloudAudio();

  try {
    const chunks = splitForSpeech(text);
    for (let i = 0; i < chunks.length; i += 1) {
      if (myGeneration !== generation) return;
      const blob = await fetchTtsBlob(chunks[i], rate, controller.signal);
      if (myGeneration !== generation) return;
      if (i === 0) useSpeech.setState({ loading: false });
      await playCloudBlob(blob);
    }
    if (myGeneration !== generation) return;
    useSpeech.setState({ status: "idle", activeKey: null, loading: false });
  } catch (err) {
    if (myGeneration !== generation) return;
    if (err instanceof Error && err.name === "AbortError") return;
    const autoplay = err instanceof SpeechAudioError && err.autoplay;
    useSpeech.setState({
      status: "error",
      activeKey: null,
      loading: false,
      errorSource: autoplay ? "autoplay" : "cloud",
      error: cloudErrorMessage(err),
    });
  } finally {
    if (cloudAbort === controller) cloudAbort = null;
  }
}

function speakNative(
  key: string,
  cleaned: string,
  effectiveRate: number
): boolean {
  const myGeneration = generation;
  const voice = pickChineseVoice(cachedVoices, usePrefs.getState().speechVoiceURI);
  const s = synth();
  if (!s) return false;

  useSpeech.setState({
    status: "speaking",
    activeKey: key,
    error: null,
    errorSource: null,
    rate: effectiveRate,
    loading: false,
  });

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
      // 原生合成不可用时自动尝试云端兜底，避免用户卡在“播放失败”
      if (
        (code === "synthesis-failed" || code === "synthesis-unavailable") &&
        canUseCloud()
      ) {
        useSpeech.setState({
          status: "speaking",
          activeKey: key,
          loading: true,
          error: null,
          errorSource: null,
        });
        void speakCloud({
          text: cleaned,
          rate: effectiveRate,
          myGeneration,
        });
        return;
      }
      useSpeech.setState({
        status: "error",
        activeKey: null,
        loading: false,
        errorSource: "native",
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
          loading: false,
          errorSource: "native",
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
      loading: false,
      errorSource: "native",
      error: "语音播放失败，文字内容仍可正常查看。",
    });
    return false;
  }
}

/** 开始朗读新段落：自动停止旧内容，同一时间只播一段 */
export function speak({ key, text, rate }: SpeakOptions): boolean {
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
  const effectiveRate = clampRate(rate ?? prefs.speechRate);

  if (nativeSupported()) {
    return speakNative(key, cleaned, effectiveRate);
  }

  if (!canUseCloud()) {
    useSpeech.setState({
      supported: false,
      nativeSupported: false,
      status: "error",
      activeKey: null,
      loading: false,
      errorSource: "native",
      error: isWeChatBrowser()
        ? "当前环境不支持语音播放，文字内容仍可正常查看。"
        : "当前浏览器不支持语音合成，请改用最新版 Chrome、Edge 或 Safari。",
    });
    return false;
  }

  const myGeneration = generation;
  useSpeech.setState({
    status: "speaking",
    activeKey: key,
    error: null,
    errorSource: null,
    rate: effectiveRate,
    loading: true,
  });
  void speakCloud({
    text: cleaned,
    rate: effectiveRate,
    myGeneration,
  });
  return true;
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
  cloudBlobCache.clear();
  cloudAudio = null;
}

// 设置变化：关闭语音或切换标准/长辈模式时立即停止，下一次用当前模式文案
usePrefs.subscribe((state, previous) => {
  if (previous.voiceEnabled && !state.voiceEnabled) stopSpeech();
  if (previous.mode !== state.mode) stopSpeech();
});

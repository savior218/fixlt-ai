﻿/* ============================================================
   语音播报（模块④：Web Speech API，纯浏览器能力）
   - speak(text, options)：支持语速、指定嗓音、结束回调
   - listChineseVoices() / pickGentleVoice()：中文嗓音挑选，
     默认优先温柔女声（晓晓 / 瑶瑶 / 慧慧 等）
   - stopSpeech()：停止朗读
   - isSpeechSupported()：浏览器不支持时 UI 隐藏/禁用并提示
   ============================================================ */

/** 浏览器是否支持 Web Speech API（仅合成，不依赖网络权限） */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 所有中文嗓音（zh-*） */
export function listChineseVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("zh"));
}

/** 温柔女声优先级（Windows/Edge 内置晓晓最自然，其次瑶瑶、慧慧等） */
const GENTLE_PATTERNS: RegExp[] = [
  /xiaoxiao/i,
  /晓晓/,
  /xiaoyi/i,
  /yaoyao/i,
  /瑶瑶/,
  /huihui/i,
  /慧慧/,
  /wanwan/i,
  /婉婉/,
  /female|女/,
  /普通话/,
];

/** 自动挑选一个温柔耐听的中文嗓音；找不到返回 null（由浏览器默认兜底） */
export function pickGentleVoice(): SpeechSynthesisVoice | null {
  const voices = listChineseVoices();
  if (voices.length === 0) return null;
  for (const p of GENTLE_PATTERNS) {
    const hit = voices.find((v) => p.test(v.name));
    if (hit) return hit;
  }
  return voices.find((v) => /zh[-_]cn/i.test(v.lang)) ?? voices[0];
}

export interface SpeakOptions {
  /** 语速 0.5 ~ 2.0 */
  rate?: number;
  /** 指定嗓音 voiceURI；null/缺省 = 自动挑选温柔女声 */
  voiceURI?: string | null;
  /** 朗读自然结束（或被打断）后的回调 */
  onEnd?: () => void;
}

/** 播放语音；返回是否真正触发（不支持/空文本返回 false） */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSupported() || !text.trim()) return false;
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = Math.min(2, Math.max(0.5, options.rate ?? 1));
  const voice = options.voiceURI
    ? listChineseVoices().find((v) => v.voiceURI === options.voiceURI) ?? null
    : pickGentleVoice();
  if (voice) utterance.voice = voice;
  if (options.onEnd) {
    utterance.onend = () => options.onEnd?.();
    utterance.onerror = () => options.onEnd?.();
  }
  window.speechSynthesis.speak(utterance);
  return true;
}

/** 停止当前朗读 */
export function stopSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

﻿import { useCallback, useRef, useState } from "react";

/* ============================================================
   语音输入（Web Speech API · SpeechRecognition）
   - Chrome / Edge 支持 webkitSpeechRecognition；Safari 17+ 支持
   - continuous：听写式输入，说完一句自动判定为最终结果
   - finalText：已确定的文字；interimText：正在说的草稿
   ============================================================ */

/** 最小接口声明（避免依赖实验性 DOM 类型） */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } } & ArrayLike<{ transcript: string }>>;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => RecognitionLike)
    | null;
}

export function useSpeechRecognition(lang = "zh-CN") {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);

  const supported = getRecognitionCtor() != null;

  /** 开始听写；返回是否成功启动 */
  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    try {
      recRef.current?.abort();
    } catch {
      /* 上一次实例可能已结束 */
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let final = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) final += text;
        else interim += text;
      }
      setFinalText(final);
      setInterimText(interim);
    };
    rec.onerror = (e) => {
      setError(
        e?.error === "not-allowed" || e?.error === "service-not-allowed"
          ? "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试"
          : "语音识别暂时不可用，请稍后再试"
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    setFinalText("");
    setInterimText("");
    setError(null);
    rec.start();
    setListening(true);
    return true;
  }, [lang]);

  /** 停止听写（已识别内容保留在 finalText 中） */
  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  /** 清空识别结果（把文字转入输入框后调用） */
  const clear = useCallback(() => {
    setFinalText("");
    setInterimText("");
  }, []);

  return { supported, listening, finalText, interimText, error, start, stop, clear, setError };
}

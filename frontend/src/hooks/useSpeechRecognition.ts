import { useCallback, useEffect, useRef, useState } from "react";

import { isWeChatBrowser, WECHAT_SPEECH_HINT } from "../utils/platform";

/**
 * 语音识别最小接口（兼容 webkitSpeechRecognition）
 */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<
          ReadonlyArray<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

/** 不同浏览器的构造函数名 */
function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => RecognitionLike)
    | null;
}

/** 把 Web Speech 错误码翻译成用户能照做的提示 */
function describeRecognitionError(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试";
    case "no-speech":
      return "没有听到声音，请靠近麦克风再说一次";
    case "audio-capture":
      return "未检测到可用的麦克风，请检查设备后重试";
    case "language-not-supported":
      return "当前浏览器不支持中文语音识别，建议改用 Chrome / Edge";
    case "network":
      return isWeChatBrowser()
        ? WECHAT_SPEECH_HINT
        : "语音识别服务连接失败，请检查网络后重试（部分浏览器不支持该功能）";
    default:
      return isWeChatBrowser()
        ? WECHAT_SPEECH_HINT
        : "语音识别暂时不可用，请稍后再试";
  }
}

/**
 * 听写 Hook：浏览器原生语音识别（Chrome/Edge/Safari）。
 *
 * 交互模型：start() 开始连续听写 → 实时输出 interimText 草稿 → stop() 停止。
 * finalText 为「每次新增的定稿增量」而非会话全量，配合 finalSeq 序号消费，
 * 保证连续多句听写不会重复追加此前句子。
 */
export function useSpeechRecognition(lang = "zh-CN") {
  const [listening, setListening] = useState(false);
  /** 本次新增的定稿增量（配合 finalSeq 一次一取） */
  const [finalText, setFinalText] = useState("");
  /** 定稿增量序号，单调递增，用于消费方去重 */
  const [finalSeq, setFinalSeq] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  /** 最新识别结果快照：onend 时用于补交未定稿草稿 */
  const latestRef = useRef({ final: "", interim: "" });

  const supported = getRecognitionCtor() != null;

  /** 开始听写；返回是否成功启动 */
  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;

    // 先摘掉旧实例的事件再 abort：否则 abort 触发的 onerror/onend 会在新会话
    // 启动后把 listening 置为 false，并弹出「语音识别暂时不可用」（二次点击失败的主因）
    const previous = recRef.current;
    if (previous) {
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      try {
        previous.abort();
      } catch {
        /* 上一次实例可能已结束 */
      }
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    /** 会话内已定稿全量（仅用于 onend 补交），emitted 为已上报字符数 */
    let final = "";
    let emitted = 0;
    latestRef.current = { final: "", interim: "" };
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) final += text;
        else interim += text;
      }
      latestRef.current = { final, interim };
      // 只上报新增的定稿部分，避免连续多句时重复追加
      if (final.length > emitted) {
        const delta = final.slice(emitted);
        emitted = final.length;
        setFinalText(delta);
        setFinalSeq((n) => n + 1);
      }
      setInterimText(interim);
    };
    rec.onerror = (e) => {
      const code = e?.error;
      // 主动 abort / 切换实例会触发 aborted，不是错误，不能打断新会话
      if (code === "aborted") return;
      setError(describeRecognitionError(code));
      setListening(false);
    };
    rec.onend = () => {
      // 识别结束：部分浏览器在停止时不会把最后的草稿定为最终结果，
      // 这里统一补交，避免"说完立刻点停止"丢掉最后几个字
      const pending = latestRef.current;
      if (pending.interim) {
        const merged = pending.final + pending.interim;
        latestRef.current = { final: merged, interim: "" };
        const delta = merged.slice(emitted);
        emitted = merged.length;
        if (delta) {
          setFinalText(delta);
          setFinalSeq((n) => n + 1);
        }
        setInterimText("");
      }
      setListening(false);
    };

    recRef.current = rec;
    setFinalText("");
    setInterimText("");
    setError(null);
    try {
      rec.start();
    } catch {
      // 权限尚未授予、实例状态异常等：返回 false 交给调用方提示，不抛出中断页面
      setError("语音识别启动失败，请检查麦克风权限后重试");
      setListening(false);
      return false;
    }
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

  /** 不支持原生识别时（如 Firefox）隐藏语音入口 */
  useEffect(() => {
    if (!supported) return;
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, [supported]);

  return { supported, listening, finalText, finalSeq, interimText, error, start, stop, setError };
}

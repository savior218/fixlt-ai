﻿import { Bot, Pause, Volume2 } from "lucide-react";

import Chip from "./Chip";
import { usePrefs } from "../stores/prefs";
import { isSpeechSupported, speak, stopSpeech } from "../utils/speech";
import { useState } from "react";

/** AI 问诊对话气泡（TASK-11）：AI 消息 / 用户消息 / 加载中 / 建议选项 */
export default function AIMessageBubble({
  role,
  content,
  time,
  loading = false,
  suggestions = [],
  onSuggestion,
  tone = "standard",
}: {
  role: "ai" | "user";
  content?: string;
  /** 消息时间（如 14:32） */
  time?: string;
  /** AI 正在输入时显示加载动画 */
  loading?: boolean;
  /** AI 建议选项（点选后作为用户输入发送） */
  suggestions?: string[];
  onSuggestion?: (text: string) => void;
  /** standard 标准 / elder 长辈关怀（更大字号与行距） */
  tone?: "standard" | "elder";
}) {
  const elder = tone === "elder";
  const speechRate = usePrefs((s) => s.speechRate);
  const voiceURI = usePrefs((s) => s.voiceURI);
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = isSpeechSupported();

  /** 朗读/停止本条消息（模块④） */
  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    if (content && speak(content, { rate: speechRate, voiceURI, onEnd: () => setSpeaking(false) }))
      setSpeaking(true);
  }

  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={`max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 text-white ${elder ? "px-4 py-3 text-lg leading-relaxed" : "px-3.5 py-2.5 text-sm leading-relaxed"}`}
        >
          {content}
        </div>
        {time && <span className="pr-1 text-xs text-stone-400">{time}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-start gap-2.5">
        {/* AI 头像 */}
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
        >
          <Bot className="h-5 w-5" />
        </span>

        <div
          className={`max-w-[85%] rounded-2xl rounded-tl-md bg-surface text-stone-800 shadow-sm ring-1 ring-stone-200 ${elder ? "px-4 py-3 text-lg leading-loose" : "px-3.5 py-2.5 text-sm leading-relaxed"}`}
        >
          {loading ? (
            <span className="flex items-center gap-1 py-1" role="status" aria-label="AI 正在输入">
              <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:300ms]" />
            </span>
          ) : (
            content
          )}

          {/* 建议选项 */}
          {!loading && suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
              {suggestions.map((s) => (
                <Chip key={s} onClick={() => onSuggestion?.(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}

          {/* 朗读按钮（模块④：浏览器不支持时隐藏） */}
          {!loading && content && canSpeak && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={toggleSpeak}
                aria-label={speaking ? "停止朗读" : "朗读这条消息"}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-stone-400 transition-colors hover:bg-stone-100 hover:text-brand-700"
              >
                {speaking ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                {speaking ? "停止" : "朗读"}
              </button>
            </div>
          )}
        </div>
      </div>
      {time && <span className="pl-10 text-xs text-stone-400">{time}</span>}
    </div>
  );
}

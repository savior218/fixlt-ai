import { Bot } from "lucide-react";

import Chip from "./Chip";
import SpeakButton from "./SpeakButton";

/** AI 问诊对话气泡（TASK-11）：AI 消息 / 用户消息 / 加载中 / 建议选项 */
export default function AIMessageBubble({
  role,
  content,
  time,
  loading = false,
  suggestions = [],
  onSuggestion,
  tone = "standard",
  speakKey,
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
  /** 仅当前助手问题显示朗读入口；用户消息与历史消息不显示 */
  speakKey?: string;
}) {
  const elder = tone === "elder";

  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={`max-w-[85%] break-words rounded-2xl rounded-br-md bg-brand-600 text-white ${elder ? "px-4 py-3 text-lg leading-relaxed" : "px-3.5 py-2.5 text-sm leading-relaxed"}`}
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
          className={`min-w-0 max-w-[85%] break-words rounded-2xl rounded-tl-md bg-surface text-stone-800 shadow-sm ring-1 ring-stone-200 ${elder ? "px-4 py-3 text-lg leading-loose" : "px-3.5 py-2.5 text-sm leading-relaxed"}`}
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
        </div>
      </div>
      <div className="flex items-center gap-2 pl-10">
        {time && <span className="text-xs text-stone-400">{time}</span>}
        {speakKey && content && (
          <SpeakButton
            text={content}
            speechKey={speakKey}
            label={elder ? "朗读这个问题" : "朗读"}
            size="sm"
            variant="ghost"
            elder={elder}
          />
        )}
      </div>
    </div>
  );
}

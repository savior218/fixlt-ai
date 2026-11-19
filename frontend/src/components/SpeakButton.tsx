import { useEffect } from "react";
import { Square, Volume2 } from "lucide-react";

import Button from "./Button";
import { useToast } from "./Toast";
import { usePrefs } from "../stores/prefs";
import { stopSpeech, toggleSpeech, useSpeech } from "../services/speech";

/** 统一的“朗读 / 停止”入口：只在主要内容旁出现，不逐行堆图标 */
export default function SpeakButton({
  text,
  speechKey,
  label = "朗读",
  size = "sm",
  variant = "secondary",
  className = "",
  elder = false,
}: {
  text: string;
  /** 段落标识：用于同段停止与全站单段播放 */
  speechKey: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  /** 长辈模式：更大的触控区域 */
  elder?: boolean;
}) {
  const { notify } = useToast();
  const supported = useSpeech((s) => s.supported);
  const status = useSpeech((s) => s.status);
  const activeKey = useSpeech((s) => s.activeKey);
  const enabled = usePrefs((s) => s.voiceEnabled);
  const active = status === "speaking" && activeKey === speechKey;

  // 组件卸载时只停止自己正在播放的段落，不影响其他页面
  useEffect(
    () => () => {
      const state = useSpeech.getState();
      if (state.status === "speaking" && state.activeKey === speechKey) {
        stopSpeech();
      }
    },
    [speechKey]
  );

  // 浏览器不支持时不堆无效按钮；设置页会给出明确说明
  if (!supported) return null;

  function handleClick() {
    if (!enabled) {
      notify("语音朗读已关闭，请先在「设置 → 语音设置」中开启", "info");
      return;
    }
    toggleSpeech({ key: speechKey, text });
    window.setTimeout(() => {
      const state = useSpeech.getState();
      if (state.status === "error" && state.error) {
        notify(state.error, "error");
      }
    }, 80);
  }

  return (
    <Button
      type="button"
      variant={active ? "primary" : variant}
      size={elder && size === "sm" ? "md" : size}
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? "停止朗读" : label}
      className={className}
      title={
        enabled
          ? "使用浏览器语音合成朗读当前文字，不会重新调用模型"
          : "语音朗读已关闭，可在设置中开启"
      }
    >
      {active ? (
        <Square className={elder ? "h-5 w-5" : "h-4 w-4"} />
      ) : (
        <Volume2 className={elder ? "h-5 w-5" : "h-4 w-4"} />
      )}
      {active ? "停止朗读" : label}
    </Button>
  );
}

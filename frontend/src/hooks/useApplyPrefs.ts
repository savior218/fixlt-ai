import { useEffect } from "react";

import { usePrefs } from "../stores/prefs";

/** 字号档位基准（px），与 global.css html[data-fs] 保持一致 */
const FS_BASE = { normal: 16, large: 18, xlarge: 20 } as const;

/**
 * 将偏好同步到 <html>：
 * - data-fs / data-mode：密度与关怀模式样式选择器
 * - 字号 = 档位基准 × 缩放系数（zoom 80~150 → 0.8~1.5）
 * - contrast：normal 无效果 / high = .hc / extra = .hc + data-contrast
 * - rm：减少动画
 */
export function useApplyPrefs() {
  const { fontScale, contrast, reduceMotion, mode, zoom } = usePrefs();

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.fs = fontScale;
    el.dataset.mode = mode;
    el.dataset.contrast = contrast;
    el.classList.toggle("hc", contrast !== "normal");
    el.classList.toggle("rm", reduceMotion);
    // 字号与页面缩放合并到根字号（Tailwind rem 布局全局生效）
    // 长辈关怀模式：根字号至少 20px，确保整体观感与标准模式有明确差别
    let base: number = FS_BASE[fontScale];
    if (mode === "elder") base = Math.max(base, 20);
    el.style.fontSize = `${Math.round((base * zoom) / 100 * 100) / 100}px`;
  }, [fontScale, contrast, reduceMotion, mode, zoom]);
}

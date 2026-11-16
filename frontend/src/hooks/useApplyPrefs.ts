import { useEffect } from "react";

import { usePrefs } from "../stores/prefs";

/** 将偏好同步到 <html>，驱动字体缩放 / 高对比度 / 减少动画 / 关怀模式样式 */
export function useApplyPrefs() {
  const { fontScale, highContrast, reduceMotion, mode } = usePrefs();

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.fs = fontScale;
    el.dataset.mode = mode;
    el.classList.toggle("hc", highContrast);
    el.classList.toggle("rm", reduceMotion);
  }, [fontScale, highContrast, reduceMotion, mode]);
}

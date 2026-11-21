import { useEffect } from "react";

/**
 * 移动端软键盘适配：把「可见视口」高度写入 --vvh。
 *
 * 部分国产浏览器（夸克 / UC / 微信 X5）弹出键盘时只缩小 visualViewport，
 * 布局视口和 100vh / 100dvh 都不变，导致页面底部的输入框被键盘盖住。
 * 这里主动同步可见高度，配合样式让页面收缩、可滚动，输入框始终露在键盘上方。
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;

    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        // 键盘遮挡高度：布局视口底部到可见视口底部的距离（无键盘时为 0）
        const keyboard = Math.max(
          0,
          Math.round(window.innerHeight - vv.height - vv.offsetTop)
        );
        root.style.setProperty("--kb", `${keyboard}px`);
      });
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      cancelAnimationFrame(raf);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--kb");
    };
  }, []);
}

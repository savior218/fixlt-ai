/**
 * 通知提示音（模块⑤）：用 Web Audio API 合成短促"叮咚"声，
 * 无需音频资源文件。首次用户交互（点击开始诊断等）后 AudioContext 才能出声，
 * 这是浏览器自动播放策略的正常限制，不额外处理。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // 被浏览器挂起时（尚未有用户手势）尝试恢复
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** 播放一声通知提示音（两段上行音，像"叮咚"）。调用方负责免打扰判断。 */
export function playNotificationSound(): void {
  try {
    const ac = getCtx();
    if (!ac || ac.state !== "running") return;

    const now = ac.currentTime;
    // 双音上行：E6 → A6，轻快不刺耳
    const notes = [
      { freq: 1318.5, at: 0 },
      { freq: 1760.0, at: 0.12 },
    ];
    for (const { freq, at } of notes) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + at;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  } catch {
    // 音频失败静默降级：不打断通知弹窗本身
  }
}

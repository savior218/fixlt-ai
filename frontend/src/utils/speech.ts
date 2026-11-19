/* ============================================================
   语音播报（模块④：Web Speech API，纯浏览器能力）
   - speak(text, rate)：播放前先 cancel 当前 utterance
   - stopSpeech()：停止朗读
   - isSpeechSupported()：浏览器不支持时 UI 隐藏/禁用并提示
   ============================================================ */

/** 浏览器是否支持 Web Speech API（仅合成，不依赖网络权限） */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 播放语音；返回是否真正触发（不支持/空文本返回 false） */
export function speak(text: string, rate = 1): boolean {
  if (!isSpeechSupported() || !text.trim()) return false;
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = Math.min(2, Math.max(0.5, rate));
  window.speechSynthesis.speak(utterance);
  return true;
}

/** 停止当前朗读 */
export function stopSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

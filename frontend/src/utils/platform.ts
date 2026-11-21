/** 运行环境判断与提示文案。 */

/** 微信内置浏览器（X5 / iOS WKWebView）不提供可用的语音合成与语音识别能力 */
export function isWeChatBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 微信内无法使用语音功能时，引导用户改用系统浏览器打开 */
export const WECHAT_SPEECH_HINT =
  "微信内置浏览器不支持语音朗读与语音输入，请点右上角「…」→「在浏览器打开」后使用。";

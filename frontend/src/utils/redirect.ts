/** 登录返回地址校验：只允许站内相对路径，避免任意外部跳转。 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(raw, "http://internal.local");
    if (url.origin !== "http://internal.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** 构造登录页地址，保留当前页面作为登录后的返回目标。 */
export function loginHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

/* ============================================================
   格式化工具（阶段五：日期 / 手机号脱敏 / 状态文案 / 费用）
   ============================================================ */

/** ISO → "2026-11-17" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO → "2026-11-17 14:30" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)} ${hh}:${mm}`;
}

/** ISO → "14:30"（对话气泡时间） */
export function formatTime(iso: string | Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ISO → 相对时间："刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期" */
export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatDate(iso);
}

/** 手机号脱敏：13812345678 → 138****5678 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 费用展示：null → "—" */
export function formatCost(cost: number | null): string {
  if (cost == null) return "—";
  return `¥${cost}`;
}

/** 购买日期 → 使用年限描述："约 4 年" / "不足 1 年" / null */
export function usageYearsLabel(purchaseDate: string | null): string | null {
  if (!purchaseDate) return null;
  const d = new Date(purchaseDate).getTime();
  if (Number.isNaN(d)) return null;
  const years = (Date.now() - d) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return "不足 1 年";
  return `约 ${Math.floor(years)} 年`;
}

/** 生成短 ID（诊断 / 维修记录，本地 Mock 阶段） */
export function shortId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

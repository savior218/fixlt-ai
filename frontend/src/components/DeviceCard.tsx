import { Wrench } from "lucide-react";

import type { DeviceCategory } from "../services/api";
import { CATEGORY_LABELS } from "../services/api";
import type { Device } from "../types/device";
import StatusBadge, { type Status } from "./StatusBadge";
import { usePrefs } from "../stores/prefs";

export const CATEGORY_ICONS: Record<
  DeviceCategory,
  { emoji: string; alt: string }
> = {
  ac: { emoji: "❄️", alt: "空调" },
  fridge: { emoji: "🧊", alt: "冰箱" },
  washer: { emoji: "🫧", alt: "洗衣机" },
};

/** 设备卡片（TASK-10）：图片/名称/品牌/型号/位置/状态/维修次数；长辈模式精简信息 */
export default function DeviceCard({
  device,
  status = "normal",
  repairCount = 0,
  onClick,
}: {
  device: Device;
  /** 设备状态徽章（默认运行正常） */
  status?: Status;
  /** 历史维修次数 */
  repairCount?: number;
  /** 点击卡片跳转设备详情（P7） */
  onClick?: () => void;
}) {
  const { mode } = usePrefs();
  const elder = mode === "elder";
  const icon = CATEGORY_ICONS[device.category];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <div className="flex items-start gap-3">
        {/* 设备图标（图片 URL 缺省时按类型回退） */}
        {device.imageUrl ? (
          <img
            src={device.imageUrl}
            alt={device.name}
            className={`shrink-0 rounded-xl object-cover ${elder ? "h-16 w-16" : "h-14 w-14"}`}
          />
        ) : (
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-50 ${elder ? "h-16 w-16 text-3xl" : "h-14 w-14 text-2xl"}`}
          >
            {icon.emoji}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`truncate font-semibold text-stone-900 ${elder ? "text-lg" : "text-base"}`}>
              {device.name}
            </p>
            <span className="shrink-0">
              <StatusBadge status={status} />
            </span>
          </div>

          {/* 标准模式：完整信息；长辈模式：仅保留类型 + 位置 */}
          {elder ? (
            <p className="mt-1 text-base text-stone-600">
              {CATEGORY_LABELS[device.category]}
              {device.location ? ` · ${device.location}` : ""}
            </p>
          ) : (
            <>
              <p className="mt-1 truncate text-sm text-stone-500">
                {CATEGORY_LABELS[device.category]}
                {device.brand ? ` · ${device.brand}` : ""}
                {device.model ? ` ${device.model}` : ""}
                {device.location ? ` · ${device.location}` : ""}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-stone-400">
                <Wrench aria-hidden className="h-3.5 w-3.5" />
                历史维修 {repairCount} 次
              </p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

﻿import { Wrench } from "lucide-react";

import { CATEGORY_LABELS } from "../services/api";
import type { Device } from "../types/device";
import StatusBadge, { type Status } from "./StatusBadge";
import { usePrefs } from "../stores/prefs";
import { DEVICE_IMAGES } from "../utils/deviceImages";

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
  const image = DEVICE_IMAGES[device.category];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-stone-200 bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <div className="flex items-start gap-3">
        {/* 设备图片：用户上传图优先；否则使用本地实物透明 PNG（不拉伸、不裁切） */}
        {device.imageUrl ? (
          <img
            src={device.imageUrl}
            alt={device.name}
            className="h-20 w-20 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span
            className={`flex shrink-0 items-center justify-center ${
              device.category === "ac" ? "h-20 w-[88px] sm:w-[112px]" : "h-20 w-20"
            }`}
          >
            <img
              src={image.src}
              alt={image.alt}
              className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(28,25,23,0.18)]"
            />
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

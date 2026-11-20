import type { DiagnoseCategory } from "../types/diagnosis";

/**
 * 设备实物透明 PNG 映射。
 * 素材来源与许可（PNGimg，CC BY-NC 4.0）见 public/images/devices/给Trae的替换说明.md。
 */
export const DEVICE_IMAGES: Record<
  DiagnoseCategory,
  { src: string; alt: string }
> = {
  ac: { src: "/images/devices/air-conditioner.png", alt: "空调实物图" },
  fridge: { src: "/images/devices/refrigerator.png", alt: "冰箱实物图" },
  washer: { src: "/images/devices/washing-machine.png", alt: "洗衣机实物图" },
  other: { src: "/images/devices/television.png", alt: "其他家电（电视）实物图" },
};

/** 类别为空时按“其他家电”展示 */
export function deviceImage(category?: DiagnoseCategory | null) {
  return DEVICE_IMAGES[category ?? "other"];
}

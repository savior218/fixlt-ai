/* ============================================================
   图片工具（模块③：图片上传 + AI 看图）
   ============================================================ */

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const PHOTO_ACCEPT = ["image/jpeg", "image/png"];

/** 校验文件类型与大小；返回错误信息或 null */
export function validatePhoto(file: File): string | null {
  if (!PHOTO_ACCEPT.includes(file.type.toLowerCase())) {
    return "仅支持 JPG / PNG 格式图片";
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return "图片超过 10MB 限制，请压缩后重试";
  }
  return null;
}

/**
 * canvas 压缩：最长边压到 1280px，JPEG 质量 0.8。
 * 失败时返回原 File（由后端兜底校验）。
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 1024 * 1024) return file; // 已足够小

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + "-compressed.jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** File → data URL（本地预览用，不上传） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * 头像压缩：中心方形裁剪 + 缩放到 128×128，JPEG 质量 0.75。
 * 产物约 3~8KB，适合存 localStorage（按账号隔离展示）。
 */
export async function compressAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布不可用");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, 128, 128);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.75);
}

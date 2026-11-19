﻿import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 通用弹窗（TASK-09）：title + description + 内容区 + 自定义底部 */
export default function ModalDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  /** 标题下的灰色说明文字 */
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  /** 底部操作区；不传则仅显示内容 */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  /** 打开前的焦点元素，关闭时恢复 */
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // 焦点移入弹窗；关闭时恢复焦点，避免焦点丢失
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    // 锁定背景滚动，弹窗内容区自身可滚动（正文 max-h + overflow-y-auto）
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={onClose}
    >
      {/* 移动端：底部弹层（bottom sheet）；≥sm：居中弹窗 */}
      <div
        className={`flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-surface shadow-card sm:rounded-2xl ${width} sm:max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 p-5 pb-4">
          <div>
            <h3 id="modal-title" className="text-base font-bold text-stone-900">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-stone-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            ref={closeBtnRef}
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children && <div className="safe-pad-bottom overflow-y-auto px-5 py-4">{children}</div>}
        {footer && (
          <div className="safe-pad-bottom flex shrink-0 flex-wrap justify-end gap-2 border-t border-stone-100 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

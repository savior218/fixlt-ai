import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 通用弹窗（TASK-09，三端适配版）：title + description + 内容区 + 自定义底部
 * - 高度受可见视口限制（dvh 优先，vh 回退），正文独立滚动，头尾始终可达
 * - 焦点进入、循环（Tab 陷阱）、Escape 关闭、关闭后焦点归还触发元素
 * - 打开时锁定背景滚动
 * - <sm：底部弹层（bottom sheet）；≥sm：居中弹窗
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  /* 打开：锁定背景滚动 + 记录触发元素；关闭：恢复（归还焦点） */
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  /* 打开后：焦点移入面板首个可聚焦元素 */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  /* Escape 关闭 */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onKeyDown={handleKeyDown}
        className={`modal-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl supports-[height:100dvh]:max-h-[85dvh] sm:max-h-[85vh] sm:rounded-2xl ${width}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-5 pb-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* 正文独立滚动（软键盘弹出时高度受限仍可操作） */}
        {children && (
          <div className="safe-pad-bottom min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
        )}
        {footer && (
          <div className="safe-pad-bottom flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

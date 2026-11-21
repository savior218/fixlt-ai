﻿import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_STYLES: Record<ToastType, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-stone-800 text-white",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  /** 相同提示 1.5 秒内只弹一次，避免连点麦克风时叠出多条相同红条 */
  const lastToastRef = useRef<{ message: string; type: ToastType; at: number } | null>(null);

  const notify = useCallback((message: string, type: ToastType = "info") => {
    const now = Date.now();
    const last = lastToastRef.current;
    if (last && last.message === message && last.type === type && now - last.at < 1500) {
      return;
    }
    lastToastRef.current = { message, type, at: now };
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="toast-stack pointer-events-none flex flex-col items-center gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-item pointer-events-auto w-fit max-w-full break-words rounded-xl px-4 py-2.5 text-center text-sm shadow-card ${TYPE_STYLES[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}

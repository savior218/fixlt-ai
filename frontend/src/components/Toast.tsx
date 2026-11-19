import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

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

  const notify = useCallback((message: string, type: ToastType = "info") => {
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
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -transtone-x-1/2 flex-col items-center gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-item pointer-events-auto rounded-xl px-4 py-2.5 text-sm shadow-lg ${TYPE_STYLES[t.type]}`}
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

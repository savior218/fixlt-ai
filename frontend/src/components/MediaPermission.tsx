import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Camera, Mic } from "lucide-react";

import Button from "./Button";
import ModalDialog from "./ModalDialog";

export type MediaPermission = "photo" | "microphone";

/** 请求授权：用户点「允许」后，在同一手势内同步执行 onAllow（文件选择框不会被浏览器拦截） */
type RequestPermission = (kind: MediaPermission, onAllow: () => void) => void;

const PermissionContext = createContext<RequestPermission | null>(null);

/** 在应用内请求照片 / 麦克风授权；未包裹 Provider 时会明确报错 */
export function useMediaPermission(): RequestPermission {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("useMediaPermission 必须在 MediaPermissionProvider 内使用");
  }
  return ctx;
}

const CONTENT: Record<
  MediaPermission,
  {
    title: string;
    description: string;
    icon: typeof Camera;
    allowLabel: string;
    points: string[];
  }
> = {
  photo: {
    title: "允许访问照片？",
    description: "",
    icon: Camera,
    allowLabel: "允许",
    points: [
      "仅在点击选图时读取，不会在后台访问",
      "仅用于故障诊断，可随时在数据管理中删除",
    ],
  },
  microphone: {
    title: "允许使用麦克风？",
    description: "",
    icon: Mic,
    allowLabel: "允许",
    points: [
      "仅在点击语音输入时录音",
      "转写文字仅用于本次问诊",
    ],
  },
};

/**
 * 照片 / 麦克风授权弹窗（全应用共用）。
 * 所有访问照片、录音的入口先经过这里，用户允许后才执行下一步，
 * 与原生应用、正规网站先征得授权的交互一致。
 */
export function MediaPermissionProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    kind: MediaPermission;
    onAllow: () => void;
  } | null>(null);

  const request = useCallback<RequestPermission>((kind, onAllow) => {
    setPending({ kind, onAllow });
  }, []);

  const close = useCallback(() => setPending(null), []);

  const allow = useCallback(() => {
    if (!pending) return;
    const callback = pending.onAllow;
    // 先关闭弹窗，再在点击事件内同步执行，保留浏览器「用户手势」
    setPending(null);
    callback();
  }, [pending]);

  const value = useMemo(() => request, [request]);
  const content = pending ? CONTENT[pending.kind] : null;
  const Icon = content?.icon ?? Camera;

  return (
    <PermissionContext.Provider value={value}>
      {children}
      <ModalDialog
        open={pending !== null && content !== null}
        size="sm"
        title={content?.title ?? ""}
        description={content?.description || undefined}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button onClick={allow}>{content?.allowLabel ?? "允许"}</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <ul className="space-y-2 text-sm leading-relaxed text-stone-600">
            {content?.points.map((point) => (
              <li key={point} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

      </ModalDialog>
    </PermissionContext.Provider>
  );
}

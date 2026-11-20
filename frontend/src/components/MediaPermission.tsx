import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Camera, Mic, ShieldCheck } from "lucide-react";

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
    description: "上传故障照片前，需要先获得你的同意",
    icon: Camera,
    allowLabel: "允许访问",
    points: [
      "仅在你点击「拍照或选择图片」时打开相机 / 相册，不会在后台读取",
      "照片用于识别家电故障，保存在你的账号下，仅本人可查看",
      "可随时在「个人中心 · 数据管理」中删除，不用于广告投放或模型训练",
    ],
  },
  microphone: {
    title: "允许使用麦克风？",
    description: "语音输入前，需要先获得你的同意",
    icon: Mic,
    allowLabel: "允许使用",
    points: [
      "仅在你点击「语音输入」时开始录音，点停止即结束",
      "语音会实时转写成文字填入输入框，你可以修改后再发送",
      "转写内容仅用于本次问诊，不会长期保存",
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
        description={content?.description}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              暂不允许
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
        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
            aria-hidden
          />
          你可以在浏览器地址栏随时撤回授权；选择「暂不允许」不影响其他功能的使用。
        </p>
      </ModalDialog>
    </PermissionContext.Provider>
  );
}

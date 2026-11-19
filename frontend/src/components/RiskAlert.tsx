import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";

import SpeakButton from "./SpeakButton";
import { usePrefs } from "../stores/prefs";
import { normalizeSpeechText } from "../services/speech";

/** 风险等级（PRD SAFE-001） */
export type RiskLevel = "low" | "medium" | "high";

const RISK_META: Record<
  RiskLevel,
  {
    icon: typeof ShieldCheck;
    titleStandard: string;
    titleElder: string;
    className: string;
    iconClass: string;
  }
> = {
  low: {
    icon: ShieldCheck,
    titleStandard: "低风险：可自行处理",
    titleElder: "别担心，自己动手就能解决",
    className: "bg-risk-low-bg border-risk-low-border text-risk-low-deep",
    iconClass: "text-risk-low",
  },
  medium: {
    icon: AlertTriangle,
    titleStandard: "中风险：请谨慎操作",
    titleElder: "要小心，按步骤慢慢来",
    className: "bg-risk-medium-bg border-risk-medium-border text-risk-medium-deep",
    iconClass: "text-risk-medium",
  },
  high: {
    icon: AlertOctagon,
    titleStandard: "高风险：建议立即停用并断电",
    titleElder: "危险！请马上停用并拔掉电源",
    className: "bg-risk-high-bg border-risk-high-border text-risk-high-deep",
    iconClass: "text-risk-high",
  },
};

/** 风险告警条（TASK-12）：三级风险；长辈模式仅替换为通俗文案，等级与拦截规则不变 */
export default function RiskAlert({
  level,
  title,
  description,
  action,
  elder: elderOverride,
  speechKey,
}: {
  level: RiskLevel;
  /** 覆盖默认标题 */
  title?: string;
  /** 补充说明（如具体危险原因） */
  description?: string;
  /** 右侧操作（如"查看安全须知"按钮） */
  action?: ReactNode;
  /** 强制指定文案风格；缺省读取全局偏好 */
  elder?: boolean;
  /** 高风险管理朗读入口的段落标识 */
  speechKey?: string;
}) {
  const { mode } = usePrefs();
  const elder = elderOverride ?? mode === "elder";
  const meta = RISK_META[level];
  const Icon = meta.icon;
  const resolvedTitle = title ?? (elder ? meta.titleElder : meta.titleStandard);
  const speechText = normalizeSpeechText([resolvedTitle, description]);

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-2xl border p-4 ${meta.className}`}
    >
      <Icon aria-hidden className={`mt-0.5 h-6 w-6 shrink-0 ${meta.iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className={`font-bold ${elder ? "text-lg" : "text-base"}`}>
          {resolvedTitle}
        </p>
        {description && (
          <p className={`mt-1 ${elder ? "text-base leading-relaxed" : "text-sm leading-relaxed"}`}>
            {description}
          </p>
        )}
        {level === "high" && (
          <div className="mt-3">
            <SpeakButton
              text={speechText}
              speechKey={speechKey ?? `risk:high:${elder ? "elder" : "standard"}`}
              label="朗读安全提示"
              size="sm"
              variant="secondary"
              elder={elder}
            />
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/** 风险标题（供朗读摘要等复用，不改变任何判断） */
export function riskSpeechTitle(level: RiskLevel, elder: boolean): string {
  return elder ? RISK_META[level].titleElder : RISK_META[level].titleStandard;
}

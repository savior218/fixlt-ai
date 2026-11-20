import { Link } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Flame,
  ShieldCheck,
  Wind,
  XCircle,
  Zap,
} from "lucide-react";

import { buttonClass } from "../components/Button";
import { SAFETY_RULES_VERSION } from "../utils/risk";

/** 三级风险（与 AI 诊断中的风险分级保持一致） */
const RISK_LEVELS = [
  {
    icon: ShieldCheck,
    label: "低风险",
    title: "可自行处理",
    desc: "常见的使用或设置问题，可按诊断给出的步骤自行排查；操作前仍请先断电。",
    tone: "border-risk-low-border bg-risk-low-bg text-risk-low-deep",
    iconTone: "text-risk-low",
  },
  {
    icon: AlertTriangle,
    label: "中风险",
    title: "请谨慎操作",
    desc: "涉及电路、水路或需要拆机的情况，建议停止自行处理，联系专业维修。",
    tone: "border-risk-medium-border bg-risk-medium-bg text-risk-medium-deep",
    iconTone: "text-risk-medium",
  },
  {
    icon: AlertOctagon,
    label: "高风险",
    title: "立即停用并断电",
    desc: "出现漏电、冒烟、焦糊味、燃气泄漏等信号时，请立即停用设备并撤离。",
    tone: "border-risk-high-border bg-risk-high-bg text-risk-high-deep",
    iconTone: "text-risk-high",
  },
];

/** 三类高风险场景：危险信号、立即行动、禁止操作 */
const EMERGENCIES = [
  {
    icon: Zap,
    title: "疑似漏电 / 触电",
    signals: ["漏电", "触电", "火花", "异常发热", "烫手"],
    actions: [
      "立即断电，拔掉电源插头或断开空开",
      "停止自行维修，避免二次风险",
      "联系专业维修人员上门检修",
    ],
    forbidden: [
      "请勿用水清洁或冲洗设备",
      "请勿自行拆机或更换零件",
      "请勿继续使用已损坏的电源线",
    ],
  },
  {
    icon: Flame,
    title: "冒烟 / 起火 / 焦糊味",
    signals: ["冒烟", "起火", "焦糊味", "烧焦"],
    actions: [
      "立即断电，拔掉电源插头或断开空开",
      "火势可控时用干粉灭火器，勿用水浇带电设备",
      "火势不可控时立即撤离并拨打 119",
    ],
    forbidden: [
      "请勿用水扑救带电设备",
      "请勿自行拆机检查起火原因",
      "请勿在火情处理前继续使用",
    ],
  },
  {
    icon: Wind,
    title: "疑似燃气泄漏",
    signals: ["燃气味", "煤气", "疑似泄漏"],
    actions: [
      "关闭气源阀门，只动燃气阀门",
      "开窗通风，转移到户外或远离泄漏点",
      "撤离后联系燃气公司或拨打应急电话",
    ],
    forbidden: [
      "请勿开关任何电器（灯、插头、排风扇）",
      "请勿使用明火或点火",
      "请勿在泄漏区域内使用手机",
    ],
  },
];

/** 日常安全守则 */
const DAILY_RULES = [
  "维修或清洁前先断电，等设备完全冷却再操作。",
  "不自行拆开外壳、更换零件，涉及电路与燃气的作业交给持证专业人员。",
  "不用湿手触碰插头与开关，不用水直接冲洗带电设备。",
  "发现电源线破损、插头变黑、外壳开裂时立即停用。",
  "闻到燃气味先关阀、开窗、撤离，不要触碰任何电器开关。",
];

/** 安全守护页：风险分级、紧急处置与日常安全守则 */
export default function SafetyGuard() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* 页头 */}
      <div className="card-base p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">安全守护</h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              把风险识别放在维修建议之前，是修必达的第一原则。识别到高危故障时，
              产品会优先提示停机避险，而不是鼓励你继续操作。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-stone-100 pt-4 text-xs text-stone-500">
          <span>
            安全规则版本：<span className="font-medium text-stone-700">{SAFETY_RULES_VERSION}</span>
          </span>
          <span>
            更新日期：<time className="font-medium text-stone-700">2026年11月20日</time>
          </span>
        </div>
      </div>

      {/* 风险分级 */}
      <section className="card-base p-6 sm:p-8">
        <h2 className="text-base font-semibold text-stone-900">风险等级与处理方式</h2>
        <p className="mt-1.5 text-sm text-stone-600">
          每一次诊断都会给出风险等级。无论使用标准模式还是关怀模式，等级判断与安全拦截规则完全一致。
        </p>
        <ul className="mt-4 space-y-3">
          {RISK_LEVELS.map((item) => (
            <li
              key={item.label}
              className={`flex items-start gap-3 rounded-xl border p-4 ${item.tone}`}
            >
              <item.icon className={`mt-0.5 h-5 w-5 shrink-0 ${item.iconTone}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {item.label} · {item.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 高风险场景 */}
      <section className="space-y-3">
        <h2 className="px-1 text-base font-semibold text-stone-900">出现这些信号，请立即停机</h2>
        {EMERGENCIES.map((item) => (
          <article key={item.title} className="card-base p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-risk-high-bg text-risk-high">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-sm font-bold text-stone-900">{item.title}</h3>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.signals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-risk-high-border bg-risk-high-bg px-2.5 py-1 text-xs font-medium text-risk-high-deep"
                >
                  {signal}
                </span>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-risk-low-deep">立即行动</p>
                <ul className="mt-2 space-y-1.5">
                  {item.actions.map((action) => (
                    <li key={action} className="flex items-start gap-1.5 text-xs leading-relaxed text-stone-700">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk-low" aria-hidden />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-risk-high-deep">禁止操作</p>
                <ul className="mt-2 space-y-1.5">
                  {item.forbidden.map((rule) => (
                    <li key={rule} className="flex items-start gap-1.5 text-xs leading-relaxed text-stone-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk-high" aria-hidden />
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* 日常安全守则 */}
      <section className="card-base p-6 sm:p-8">
        <h2 className="text-base font-semibold text-stone-900">日常安全守则</h2>
        <ul className="mt-4 space-y-2.5">
          {DAILY_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-sm leading-relaxed text-stone-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      </section>

      {/* 行动引导 */}
      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-900">不确定眼下的情况是否危险？</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">
              先做一次 AI 诊断，产品会在给出维修建议前先判断风险等级。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/diagnose" className={buttonClass("primary", "md")}>
              开始智能诊断
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/guidelines" className={buttonClass("outline", "md")}>
              查看使用规范
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

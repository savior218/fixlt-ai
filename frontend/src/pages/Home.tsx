import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle } from "lucide-react";

import EmptyState from "../components/EmptyState";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { usePrefs } from "../stores/prefs";
import { relativeTime } from "../utils/format";

/** 快速入口三张卡片（点击直接进入对应类型诊断） */
const QUICK_ENTRIES = [
  { category: "ac", emoji: "❄️", title: "空调", hint: "制冷/制热异常？" },
  { category: "fridge", emoji: "🧊", title: "冰箱", hint: "不制冷或有异响？" },
  { category: "washer", emoji: "🫧", title: "洗衣机", hint: "无法启动或漏水？" },
];

const FAQ_ITEMS = [
  { q: "空调不制冷怎么办？", to: "/diagnose?category=ac" },
  { q: "洗衣机脱水时噪音很大", to: "/diagnose?category=washer" },
  { q: "冰箱结冰严重怎么处理", to: "/diagnose?category=fridge" },
  { q: "什么情况必须立即停机？", to: "/diagnose" },
];

/** 首页（对照 UI 设计稿「智修AI家庭家电助手仪表盘.png」） */
export default function Home() {
  const navigate = useNavigate();
  const { mode } = usePrefs();
  const elder = mode === "elder";
  const history = useDiagnosisStore((s) => s.history);

  const recent = history.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* 欢迎横幅 */}
      <section className="rounded-2xl bg-brand-700 p-6 text-white shadow-sm">
        <h1 className={elder ? "text-2xl font-bold" : "text-xl font-bold"}>
          {elder ? "你好！家里电器坏了吗？" : "你好，欢迎使用智修AI！"}
        </h1>
        <p className="mt-1.5 text-sm text-brand-100">
          {elder
            ? "点下面的按钮，AI 帮您一步一步找出问题，安全又放心。"
            : "遇到家电故障？让 AI 帮你快速诊断，安全解决！"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/diagnose")}
          className={`mt-4 inline-flex items-center gap-2 rounded-xl bg-white font-semibold text-brand-700 transition-colors hover:bg-brand-50 ${
            elder ? "px-6 py-3.5 text-lg" : "px-5 py-2.5 text-sm"
          }`}
        >
          开始智能诊断
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </section>

      {/* 快速入口三张卡片 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-600">快速入口</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {QUICK_ENTRIES.map((e) => (
            <Link
              key={e.category}
              to={`/diagnose?category=${e.category}`}
              className="card-base flex items-center gap-3 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              <span aria-hidden className="text-3xl">
                {e.emoji}
              </span>
              <span>
                <span className={`block font-semibold text-slate-900 ${elder ? "text-lg" : "text-base"}`}>
                  {e.title}
                </span>
                <span className="block text-sm text-slate-500">{e.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 最近诊断记录 */}
      <SectionCard
        title="最近诊断记录"
        action={
          <Link to="/records" className="text-xs text-brand-700 hover:underline">
            查看全部 ›
          </Link>
        }
        padding="sm"
      >
        {recent.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title="暂无诊断记录"
            description="完成首次诊断后，记录会自动展示在这里。"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/diagnosis/${d.id}/result`}
                  className="flex items-center justify-between gap-3 px-1 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {d.deviceName ?? "未关联设备"} · {d.symptom}
                    </span>
                    <span className="block text-xs text-slate-400">{relativeTime(d.createdAt)}</span>
                  </span>
                  <RiskBadge level={d.riskLevel} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 常见问题（elder 模式隐藏，降低信息密度） */}
      {!elder && (
        <SectionCard
          title="常见问题"
          action={
            <Link to="/diagnose" className="text-xs text-brand-700 hover:underline">
              更多帮助 ›
            </Link>
          }
          padding="sm"
        >
          <ul>
            {FAQ_ITEMS.map((item) => (
              <li key={item.q} className="border-b border-slate-100 last:border-0">
                <Link
                  to={item.to}
                  className="flex items-center justify-between py-2.5 text-sm text-slate-700 transition-colors hover:text-brand-700"
                >
                  {item.q}
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 底部安全提示条 */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-2xl border border-risk-medium-border bg-risk-medium-bg p-4 text-sm text-risk-medium-deep"
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-risk-medium" />
        <p>
          如出现<span className="font-bold">冒烟、焦糊气味或疑似漏电</span>
          ，请立即停止使用，并联系专业人员。
        </p>
      </div>

    </div>
  );
}

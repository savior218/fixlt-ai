﻿import { Link, useNavigate } from "react-router-dom";
import {
  AirVent,
  ArrowRight,
  ClipboardList,
  Refrigerator,
  Wrench,
  WashingMachine,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { usePrefs } from "../stores/prefs";
import { relativeTime } from "../utils/format";

/** 快速入口（点击直接进入对应类型诊断） */
const QUICK_ENTRIES = [
  { category: "ac", icon: AirVent, title: "空调", hint: "不制冷、不制热、漏水" },
  { category: "fridge", icon: Refrigerator, title: "冰箱", hint: "不制冷、噪音大、结冰" },
  { category: "washer", icon: WashingMachine, title: "洗衣机", hint: "不启动、不脱水、漏水" },
] as const;

const FAQ_ITEMS = [
  { q: "空调不制冷怎么办？", to: "/diagnose?category=ac" },
  { q: "洗衣机脱水时噪音很大", to: "/diagnose?category=washer" },
  { q: "冰箱结冰严重怎么处理", to: "/diagnose?category=fridge" },
  { q: "什么情况必须立即停机？", to: "/diagnose" },
];

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** 首页 */
export default function Home() {
  const navigate = useNavigate();
  const { mode } = usePrefs();
  const elder = mode === "elder";
  const history = useDiagnosisStore((s) => s.history);

  const recent = history.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 顶部：问候 + 主操作（干净的纸面卡，不再用大色块横幅） */}
      <section className="card-base relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 flex h-44 w-44 items-center justify-center rounded-full bg-brand-50"
        >
          <Wrench className="h-20 w-20 text-brand-200" strokeWidth={1.25} />
        </div>

        <p className="text-sm text-stone-500">{greetingByHour()}</p>
        <h1
          className={`mt-2 font-semibold leading-snug text-stone-900 ${
            elder ? "text-2xl" : "text-[26px] sm:text-3xl"
          }`}
        >
          家电坏了？
          <span className="text-brand-700">一步步帮你找到原因</span>
        </h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => navigate("/diagnose")}>
            开始智能诊断
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate("/repair")}>
            <ClipboardList aria-hidden className="h-4 w-4" />
            已找师傅，直接报修
          </Button>
        </div>
      </section>

      {/* 快速入口 */}
      <section>
        <h2 className={`mb-3 font-semibold text-stone-800 ${elder ? "text-lg" : "text-[15px]"}`}>
          按设备开始
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {QUICK_ENTRIES.map((e) => {
            const Icon = e.icon;
            return (
              <Link
                key={e.category}
                to={`/diagnose?category=${e.category}`}
                className="card-base group flex items-center gap-3.5 p-4 transition-colors hover:border-brand-300"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold text-stone-800 ${elder ? "text-lg" : "text-[15px]"}`}>
                    {e.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">{e.hint}</span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500"
                />
              </Link>
            );
          })}
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
          <ul className="divide-y divide-stone-100">
            {recent.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/diagnosis/${d.id}/result`}
                  className="flex items-center justify-between gap-3 px-1 py-3 transition-colors hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-800">
                      {d.deviceName ?? "未关联设备"} · {d.symptom}
                    </span>
                    <span className="block text-xs text-stone-400">{relativeTime(d.createdAt)}</span>
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
              <li key={item.q} className="border-b border-stone-100 last:border-0">
                <Link
                  to={item.to}
                  className="flex items-center justify-between py-2.5 text-sm text-stone-700 transition-colors hover:text-brand-700"
                >
                  {item.q}
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 text-stone-300" />
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

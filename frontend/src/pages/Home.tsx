﻿import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  Wrench,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

import Button from "../components/Button";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import { diagnosesForOwner, useDiagnosisStore } from "../stores/diagnosisStore";
import { usePrefs } from "../stores/prefs";
import { relativeTime } from "../utils/format";
import { DEVICE_IMAGES } from "../utils/deviceImages";

/** 快速入口（点击直接进入对应类型诊断） */
const QUICK_ENTRIES = [
  { category: "ac", title: "空调", hint: "不制冷、不制热、漏水" },
  { category: "fridge", title: "冰箱", hint: "不制冷、噪音大、结冰" },
  { category: "washer", title: "洗衣机", hint: "不启动、不脱水、漏水" },
] as const;

const FAQ_ITEMS = [
  { q: "空调不制冷怎么办？", to: "/diagnose?category=ac" },
  { q: "洗衣机脱水时噪音很大", to: "/diagnose?category=washer" },
  { q: "冰箱结冰严重怎么处理", to: "/diagnose?category=fridge" },
  { q: "什么情况必须立即停机？", to: "/diagnose" },
];

/** 卡片标题右侧的"查看全部"胶囊按钮 */
function MoreLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50/60 px-3 py-1 text-xs font-medium text-stone-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
    >
      {label}
      <ChevronRight
        aria-hidden
        className="h-3.5 w-3.5 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500"
      />
    </Link>
  );
}

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
  const ownerKey = useDiagnosisStore((s) => s.ownerKey);

  // 只展示当前账号的诊断记录，其他账号 / 本机历史不混入
  const recent = diagnosesForOwner(history, ownerKey).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 顶部：问候 + 主操作（长辈模式去掉装饰图与问候语，只留一个大按钮区） */}
      <section className="card-base relative overflow-hidden p-6 sm:p-8">
        {!elder && (
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 hidden h-44 w-44 items-center justify-center rounded-full bg-brand-50 min-[400px]:flex"
          >
            <Wrench className="h-20 w-20 text-brand-200" strokeWidth={1.25} />
          </div>
        )}

        {!elder && (
          <p className="text-sm text-stone-500">{greetingByHour()}</p>
        )}
        <h1
          className={`font-semibold leading-snug text-balance text-stone-900 ${
            elder
              ? "text-3xl leading-relaxed"
              : "mt-2 text-[22px] min-[380px]:text-[26px] sm:text-3xl"
          }`}
        >
          家电坏了？
          <span className="block text-brand-700 min-[380px]:inline">
            一步步帮你找到原因
          </span>
        </h1>

        <div
          className={
            elder
              ? "mt-7 flex flex-col gap-3"
              : "mt-6 flex flex-wrap gap-3"
          }
        >
          <Button
            size="lg"
            className={elder ? "w-full text-lg" : ""}
            onClick={() => navigate("/diagnose")}
          >
            开始智能诊断
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className={elder ? "w-full text-lg" : ""}
            onClick={() => navigate("/repair")}
          >
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
            return (
              <Link
                key={e.category}
                to={`/diagnose?category=${e.category}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:border-brand-300 hover:bg-brand-100 hover:shadow-md"
              >
                <span
                  className={`flex shrink-0 items-center justify-center ${
                    e.category === "ac" ? "h-14 w-[84px]" : "h-14 w-14"
                  }`}
                >
                  <img
                    src={DEVICE_IMAGES[e.category].src}
                    alt={DEVICE_IMAGES[e.category].alt}
                    className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(28,25,23,0.22)]"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-semibold text-stone-800 transition-colors group-hover:text-brand-800 ${elder ? "text-lg" : "text-[15px]"}`}
                  >
                    {e.title}
                  </span>
                  <span
                    data-elder="hide"
                    className="mt-0.5 block truncate text-xs text-stone-500 transition-colors group-hover:text-brand-700"
                  >
                    {e.hint}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* 最近诊断记录（长辈模式隐藏，只留核心入口；历史仍可从「维修档案」查看） */}
      <div data-elder="hide">
      <SectionCard
        title="最近诊断记录"
        action={<MoreLink to="/records" label="查看全部" />}
        padding="sm"
      >
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-surface px-4 py-10 text-center">
            <p className="text-sm text-stone-400">暂无诊断记录</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/diagnosis/${d.id}/result`}
                  className="group flex items-center gap-3 px-1 py-3.5 transition-colors hover:bg-stone-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-800 transition-colors group-hover:text-brand-700">
                      {d.symptom}
                    </span>
                    <span data-elder="hide" className="mt-0.5 block truncate text-xs text-stone-400">
                      {d.deviceName ?? "未关联设备"} · {relativeTime(d.createdAt)}
                    </span>
                  </span>
                  <RiskBadge level={d.riskLevel} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      </div>

      {/* 常见问题（elder 模式隐藏，降低信息密度） */}
      {!elder && (
        <SectionCard
          title="常见问题"
          action={<MoreLink to="/diagnose" label="更多帮助" />}
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

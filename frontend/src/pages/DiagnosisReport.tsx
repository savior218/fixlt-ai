import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lightbulb, PhoneCall } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import RiskAlert from "../components/RiskAlert";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { formatDateTime } from "../utils/format";

const CATEGORY_NAMES: Record<string, string> = {
  ac: "空调",
  fridge: "冰箱",
  washer: "洗衣机",
  other: "其他家电",
};

/** P3 诊断报告（对照「格力空调AI故障诊断报告-1.png」，已确认事实与可能原因严格分离） */
export default function DiagnosisReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  const history = useDiagnosisStore((s) => s.history);
  const diagnosis = useMemo(() => history.find((d) => d.id === id), [history, id]);

  if (!diagnosis) {
    return (
      <EmptyState
        icon="📄"
        title="未找到该诊断报告"
        description="记录可能已被清理，请重新发起诊断。"
        action={<Button onClick={() => navigate("/diagnose")}>重新诊断</Button>}
      />
    );
  }

  const deviceLabel = diagnosis.deviceName
    ? `${diagnosis.deviceName}（${CATEGORY_NAMES[diagnosis.category ?? "other"] ?? "家电"}）`
    : CATEGORY_NAMES[diagnosis.category ?? "other"] ?? "家电";

  return (
    <div className="space-y-5">
      <Link to={`/diagnosis/${diagnosis.id}/result`} className={buttonClass("ghost", "sm")}>
        <ArrowLeft className="h-4 w-4" /> 返回诊断结果
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">诊断报告</h1>
          <p className="mt-1 text-sm text-slate-500">{formatDateTime(diagnosis.createdAt)} 生成</p>
        </div>
        <Link to={`/repair?diagnosisId=${diagnosis.id}`} className={buttonClass("primary", "md")}>
          生成报修说明
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 左栏：设备信息 + 诊断结论 + 已确认事实 */}
        <div className="space-y-5">
          <SectionCard title="设备信息">
            <div className="space-y-2 text-sm">
              <p className="text-slate-800">
                <span className="text-slate-400">设备：</span>
                {deviceLabel}
              </p>
              <p className="text-slate-800">
                <span className="text-slate-400">故障现象：</span>
                {diagnosis.symptom || "自定义描述"}
              </p>
              {diagnosis.description.trim() && (
                <p className="text-slate-800">
                  <span className="text-slate-400">补充描述：</span>
                  {diagnosis.description.trim()}
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="诊断结论">
            <p className="text-sm leading-relaxed text-slate-800">{diagnosis.conclusion}</p>
          </SectionCard>

          {/* 已确认的事实（独立区块，与可能原因严格分离） */}
          <SectionCard title="已确认的事实">
            <ul className="space-y-2">
              {diagnosis.evidence.map((e) => (
                <li key={e} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-risk-low" />
                  {e}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
              以上均为诊断过程中确认的信息，与右侧「可能原因」中的推测严格区分。
            </p>
          </SectionCard>
        </div>

        {/* 右栏：风险 + 可能原因 + 判断依据 + 维修建议 + 联系维修 */}
        <div className="space-y-5">
          <RiskAlert level={diagnosis.riskLevel} description={diagnosis.riskNote ?? undefined} />

          <SectionCard title="可能原因">
            <ul className="space-y-3">
              {diagnosis.possibleCauses.map((c, i) => (
                <li key={c.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="判断依据">
            <ul className="space-y-2">
              {diagnosis.evidence.map((e) => (
                <li key={e} className="flex items-start gap-2 text-sm text-slate-600">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {e}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="维修建议（三步）">
            <ol className="space-y-3">
              {diagnosis.suggestions.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    第 {i + 1} 步 · {s.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="联系维修人员">
            <p className="text-sm text-slate-600">
              如需专业维修，可使用智能报修生成结构化报修说明。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/repair?diagnosisId=${diagnosis.id}`} className={buttonClass("primary", "md")}>
                <PhoneCall className="h-4 w-4" /> 生成报修说明并联系
              </Link>
              <Button variant="secondary" onClick={() => notify("演示功能，暂未对接真实售后平台", "info")}>
                一键联系维修
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">联系维修为演示功能，暂未对接真实售后平台。</p>
          </SectionCard>
        </div>
      </div>

      {/* 底部：小贴士 + 完成诊断 */}
      {diagnosis.tips && (
        <div className="flex items-start gap-3 rounded-2xl border border-risk-medium-border bg-tip-bg p-4 text-sm text-tip-text">
          <Lightbulb aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-tip-icon" />
          <p>
            <span className="font-semibold">小贴士：</span>
            {diagnosis.tips}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => notify("演示状态：报告导出暂未接入", "info")}
        >
          导出报告
        </Button>
        <Button onClick={() => navigate("/")}>完成诊断</Button>
      </div>
    </div>
  );
}

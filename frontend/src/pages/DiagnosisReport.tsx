import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lightbulb, MessageSquare, PhoneCall } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import RiskAlert from "../components/RiskAlert";
import SectionCard from "../components/SectionCard";
import SourceBadge from "../components/SourceBadge";
import { useToast } from "../components/Toast";
import { diagnosesForOwner, useDiagnosisStore } from "../stores/diagnosisStore";
import { usePrefs } from "../stores/prefs";
import { formatDateTime } from "../utils/format";
import { contentFor, hasElderCopy, normalizeDiagnosis } from "../utils/diagnosis";

const CATEGORY_NAMES: Record<string, string> = {
  ac: "空调",
  fridge: "冰箱",
  washer: "洗衣机",
  other: "其他家电",
};

/** P3 诊断报告（已确认事实、未知信息与可能原因严格分离；双文案按模式展示） */
export default function DiagnosisReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const history = useDiagnosisStore((s) => s.history);
  const ownerKey = useDiagnosisStore((s) => s.ownerKey);
  const diagnosis = useMemo(() => {
    const found = diagnosesForOwner(history, ownerKey).find((d) => d.id === id);
    return found ? normalizeDiagnosis(found) : undefined;
  }, [history, ownerKey, id]);

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

  const view = contentFor(diagnosis, elder ? "elder" : "standard");
  const deviceLabel = diagnosis.deviceName
    ? `${diagnosis.deviceName}（${CATEGORY_NAMES[diagnosis.category ?? "other"] ?? "家电"}）`
    : CATEGORY_NAMES[diagnosis.category ?? "other"] ?? "家电";

  return (
    <div className="space-y-5">
      <Link to={`/diagnosis/${diagnosis.id}/result`} className={buttonClass("ghost", "sm")}>
        <ArrowLeft className="h-4 w-4" /> 返回诊断结果
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">诊断报告</h1>
            <SourceBadge source={diagnosis.source} model={diagnosis.model} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(diagnosis.createdAt)} 生成 · {elder ? "长辈版表达" : "标准版表达"}
          </p>
        </div>
        <Link to={`/repair?diagnosisId=${diagnosis.id}`} className={buttonClass("primary", "md")}>
          生成报修说明
        </Link>
      </div>

      {(diagnosis.source !== "ai" || (elder && !hasElderCopy(diagnosis))) && (
        <p
          role="note"
          className={[
            "rounded-xl border px-4 py-3 text-sm",
            diagnosis.source === "template"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-slate-300 bg-slate-50 text-slate-600",
          ].join(" ")}
        >
          {diagnosis.source === "template" &&
            "本报告由本地模板生成，不是真实 AI 诊断，仅用于离线演示。"}
          {diagnosis.source === "unknown" &&
            "该历史记录未保存内容来源，无法确认是否由真实 AI 生成；不对来源作推断。"}
          {elder && !hasElderCopy(diagnosis) &&
            " 该旧记录未保存长辈版文案，当前以标准版内容展示，未声称已具备双版本。"}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 左栏：设备信息 + 问答记录 + 诊断结论 + 已确认事实 */}
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
                <p className="whitespace-pre-wrap break-words text-slate-800">
                  <span className="text-slate-400">补充描述：</span>
                  {diagnosis.description.trim()}
                </p>
              )}
              <p className="text-slate-800">
                <span className="text-slate-400">内容来源：</span>
                {diagnosis.source === "ai"
                  ? `真实 AI${diagnosis.model ? `（${diagnosis.model}）` : ""}`
                  : diagnosis.source === "template"
                    ? "本地模板演示（非 AI）"
                    : "来源未记录"}
              </p>
            </div>
          </SectionCard>

          {/* 完整问答：问题 ID / 文本 / 回答；未知回答单独标注 */}
          <SectionCard title="问诊问答记录">
            {diagnosis.qa.length > 0 ? (
              <ul className="space-y-3">
                {diagnosis.qa.map((item, index) => (
                  <li key={`${item.questionId}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="break-words text-sm font-medium text-slate-800">
                      <span className="mr-1 text-slate-400">问：</span>
                      {item.questionText}
                    </p>
                    <p className="mt-1 break-words text-sm text-slate-600">
                      <span className="text-slate-400">答：</span>
                      {item.answer}
                      {item.unknown && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          未知 / 待确认
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">问题 ID：{item.questionId}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <MessageSquare aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <p>该历史记录未保存问题与回答的对应关系，不补造问答内容。</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="诊断结论">
            <p className="text-sm leading-relaxed text-slate-800">{view.content.conclusion}</p>
          </SectionCard>

          {/* 已确认的事实（独立区块，与可能原因严格分离） */}
          <SectionCard title="已确认的事实">
            <ul className="space-y-2">
              {view.content.evidence.map((e) => (
                <li key={e} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-risk-low" />
                  <span className="min-w-0 break-words">{e}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
              以上事实均来自您提供的设备信息、描述或问诊回答，与「可能原因」中的推测严格区分。
            </p>
          </SectionCard>

          {/* 未知 / 待确认信息 */}
          {view.content.unknownInformation.length > 0 && (
            <SectionCard title="待确认信息">
              <ul className="space-y-2">
                {view.content.unknownInformation.map((u) => (
                  <li key={u} className="flex items-start gap-2 text-sm text-amber-800">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0 break-words">{u}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
                “不知道 / 没试过 / 不清楚”等回答按未知信息保存，未升级为确认事实。
              </p>
            </SectionCard>
          )}
        </div>

        {/* 右栏：风险 + 可能原因 + 判断依据 + 维修建议 + 联系维修 */}
        <div className="space-y-5">
          <RiskAlert level={diagnosis.riskLevel} description={view.content.riskNote ?? undefined} />

          <SectionCard title="可能原因">
            <ul className="space-y-3">
              {view.content.possibleCauses.map((c, i) => (
                <li key={c.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                    <p className="mt-0.5 break-words text-sm text-slate-500">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="判断依据">
            <ul className="space-y-2">
              {view.content.evidence.map((e) => (
                <li key={e} className="flex items-start gap-2 text-sm text-slate-600">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0 break-words">{e}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="维修建议（三步）">
            <ol className="space-y-3">
              {view.content.suggestions.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    第 {i + 1} 步 · {s.title}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-500">{s.description}</p>
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
      {view.content.tips && (
        <div className="flex items-start gap-3 rounded-2xl border border-risk-medium-border bg-tip-bg p-4 text-sm text-tip-text">
          <Lightbulb aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-tip-icon" />
          <p className="min-w-0 break-words">
            <span className="font-semibold">小贴士：</span>
            {view.content.tips}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
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

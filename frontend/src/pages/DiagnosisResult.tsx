import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, FileText, RotateCcw, Save } from "lucide-react";

import { buttonClass } from "../components/Button";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import RiskAlert from "../components/RiskAlert";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { createRecordFromDiagnosis } from "../services/repairService";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useRepairStore } from "../stores/repairStore";
import { usePrefs } from "../stores/prefs";
import { formatDateTime } from "../utils/format";

/** elder 分步引导文案（节奏层：先结论 → 再原因 → 再建议） */
const ELDER_STAGES = [
  "第一步，先看诊断结论",
  "第二步，看看可能是什么原因",
  "第三步，看接下来怎么办",
] as const;

/** P2 诊断完成（对照「智修AI空调诊断报告-2.png」） */
export default function DiagnosisResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const history = useDiagnosisStore((s) => s.history);
  const resetDraft = useDiagnosisStore((s) => s.resetDraft);
  const addRecord = useRepairStore((s) => s.addRecord);
  const records = useRepairStore((s) => s.records);

  /** elder 分步展示：0 结论 / 1 +可能原因 / 2 全部；standard 恒为全部 */
  const [elderStage, setElderStage] = useState(0);
  const showCauses = !elder || elderStage >= 1;
  const showRest = !elder || elderStage >= 2;

  const diagnosis = useMemo(
    () => history.find((d) => d.id === id),
    [history, id]
  );

  /** 是否已保存过（防止重复生成维修记录） */
  const saved = useMemo(
    () => (diagnosis ? records.some((r) => r.diagnosisId === diagnosis.id) : false),
    [records, diagnosis]
  );
  const [justSaved, setJustSaved] = useState(false);

  if (!diagnosis) {
    return (
      <EmptyState
        icon="📄"
        title="未找到该诊断结果"
        description="记录可能已被清理，请重新发起诊断。"
        action={<Button onClick={() => navigate("/diagnose")}>重新诊断</Button>}
      />
    );
  }

  function saveRecord() {
    if (!diagnosis) return;
    if (saved || justSaved) {
      notify("该诊断已保存过维修记录", "info");
      return;
    }
    addRecord(createRecordFromDiagnosis(diagnosis));
    setJustSaved(true);
    notify("已保存到维修档案", "success");
  }

  return (
    <div className="space-y-5">
      {/* elder 分步引导（standard 一屏全出，elder 逐步展开） */}
      {elder && (
        <p className="rounded-xl bg-tip-bg px-4 py-2.5 text-base font-medium text-tip-text">
          👉 {ELDER_STAGES[elderStage]}
        </p>
      )}

      {/* 诊断完成标识 */}
      <div className="card-base flex items-center gap-3 p-5">
        <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-risk-low" />
        <div>
          <h1 className={elder ? "text-xl font-bold text-stone-900" : "text-lg font-bold text-stone-900"}>
            {elder ? "诊断完成！这就告诉您怎么办" : "诊断完成！为您生成详细的维修建议"}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {diagnosis.deviceName ?? "未关联设备"} · {diagnosis.symptom || "自定义描述"} ·{" "}
            {formatDateTime(diagnosis.createdAt)}
          </p>
        </div>
      </div>

      {/* 核心结论 */}
      <SectionCard title="诊断结论">
        <p className={`text-stone-800 ${elder ? "text-lg leading-loose" : "text-sm leading-relaxed"}`}>
          {diagnosis.conclusion}
        </p>
      </SectionCard>

      {/* 风险等级（安全信息：任何模式下始终完整展示，不参与分步折叠） */}
      <RiskAlert
        level={diagnosis.riskLevel}
        description={diagnosis.riskNote ?? undefined}
      />

      {/* elder 第一步 → 第二步 */}
      {elder && elderStage === 0 && (
        <Button size="lg" className="w-full" onClick={() => setElderStage(1)}>
          看看可能是什么原因 <ChevronDown className="h-5 w-5" />
        </Button>
      )}

      {/* 可能原因（推测，标注"可能"） */}
      {showCauses && (
        <SectionCard title={elder ? "可能是这些地方出了问题" : "可能的故障原因"}>
          <ul className="space-y-3">
            {diagnosis.possibleCauses.map((c, i) => (
              <li key={c.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                  {i + 1}
                </span>
                <div>
                  <p className={`font-semibold text-stone-800 ${elder ? "text-base" : "text-sm"}`}>
                    {c.title}
                  </p>
                  <p className={`mt-0.5 text-stone-500 ${elder ? "text-base leading-relaxed" : "text-sm"}`}>
                    {c.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* elder 第二步 → 第三步 */}
      {elder && elderStage === 1 && (
        <Button size="lg" className="w-full" onClick={() => setElderStage(2)}>
          看接下来怎么办 <ChevronDown className="h-5 w-5" />
        </Button>
      )}

      {/* 判断依据（已确认的事实） */}
      {showRest && (
        <SectionCard title={elder ? "我们确认过的情况" : "判断依据"}>
          <ul className="space-y-2">
            {diagnosis.evidence.map((e) => (
              <li
                key={e}
                className={`flex items-start gap-2 text-stone-600 ${elder ? "text-base leading-relaxed" : "text-sm"}`}
              >
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {e}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 操作区（elder 最后一步才出现） */}
      {showRest && (
        <div className="card-base flex flex-wrap items-center gap-2 p-4">
          <Button
            variant="secondary"
            onClick={() => {
              resetDraft();
              navigate("/diagnose");
            }}
          >
            <RotateCcw className="h-4 w-4" /> {elder ? "再诊断一次" : "重新诊断"}
          </Button>
          <Button onClick={saveRecord} disabled={saved || justSaved}>
            <Save className="h-4 w-4" />
            {saved || justSaved
              ? "已保存维修记录"
              : elder
                ? "保存到维修档案"
                : "保存维修记录"}
          </Button>
          <Link to={`/diagnosis/${diagnosis.id}/report`} className={buttonClass("primary", "md")}>
            {elder ? "看完整报告" : "查看完整报告"} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/repair" className={buttonClass("ghost", "md")}>
            <FileText className="h-4 w-4" /> {elder ? "去报修" : "去智能报修"}
          </Link>
        </div>
      )}
    </div>
  );
}

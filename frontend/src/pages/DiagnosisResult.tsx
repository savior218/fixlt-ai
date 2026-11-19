import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, FileText, RotateCcw, Save } from "lucide-react";

import { buttonClass } from "../components/Button";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import RiskAlert from "../components/RiskAlert";
import SectionCard from "../components/SectionCard";
import SourceBadge from "../components/SourceBadge";
import { useToast } from "../components/Toast";
import { createRecordFromDiagnosis } from "../services/repairService";
import { diagnosesForOwner, useDiagnosisStore } from "../stores/diagnosisStore";
import { recordsForOwner, useRepairStore } from "../stores/repairStore";
import { useAuthStore } from "../stores/authStore";
import { usePrefs } from "../stores/prefs";
import { formatDateTime } from "../utils/format";
import { loginHref } from "../utils/redirect";
import { contentFor, hasElderCopy, normalizeDiagnosis } from "../utils/diagnosis";

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
  const diagnosisOwner = useDiagnosisStore((s) => s.ownerKey);
  const resetDraft = useDiagnosisStore((s) => s.resetDraft);
  const saveToCloud = useDiagnosisStore((s) => s.saveToCloud);
  const addRecord = useRepairStore((s) => s.addRecord);
  const allRecords = useRepairStore((s) => s.records);
  const recordOwner = useRepairStore((s) => s.ownerKey);
  const authStatus = useAuthStore((s) => s.status);
  const authed = authStatus === "authenticated";
  const records = useMemo(
    () => recordsForOwner(allRecords, recordOwner),
    [allRecords, recordOwner]
  );

  /** elder 分步展示：0 结论 / 1 +可能原因 / 2 全部；standard 恒为全部 */
  const [elderStage, setElderStage] = useState(0);
  const showCauses = !elder || elderStage >= 1;
  const showRest = !elder || elderStage >= 2;

  const diagnosis = useMemo(() => {
    const found = diagnosesForOwner(history, diagnosisOwner).find((d) => d.id === id);
    return found ? normalizeDiagnosis(found) : undefined;
  }, [history, diagnosisOwner, id]);

  /** 是否已保存过（防止重复生成维修记录；未同步成功的不算） */
  const saved = useMemo(
    () =>
      diagnosis
        ? records.some(
            (r) =>
              r.diagnosisId === diagnosis.id &&
              (r.cloud || r.saveStatus === "saved")
          )
        : false,
    [records, diagnosis]
  );
  const [repairBusy, setRepairBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const reportSaved = !!diagnosis && (!!diagnosis.cloud || diagnosis.saveStatus === "saved");
  const reportFailed = diagnosis?.saveStatus === "failed";
  const reportSaving = diagnosis?.saveStatus === "saving" || reportBusy;

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

  async function saveReport() {
    if (!diagnosis || reportBusy) return;
    if (!authed) {
      notify("登录后才能保存到云端", "info");
      navigate(loginHref(`/diagnosis/${diagnosis.id}/result`));
      return;
    }
    setReportBusy(true);
    try {
      await saveToCloud(diagnosis.id);
      notify("报告已保存到云端，其他设备登录同一账号可查看", "success");
    } catch (e) {
      notify((e as Error).message || "报告保存失败，请稍后重试", "error");
    } finally {
      setReportBusy(false);
    }
  }

  async function saveRecord() {
    if (!diagnosis) return;
    if (saved) {
      notify("该诊断已保存过维修记录", "info");
      return;
    }
    if (repairBusy) return;
    const record = createRecordFromDiagnosis(
      diagnosis,
      elder ? "elder" : "standard"
    );
    if (!authed) {
      addRecord(record);
      notify("已保存到本机维修档案（登录后可保存到云端）", "info");
      return;
    }
    setRepairBusy(true);
    try {
      await useRepairStore.getState().saveToCloud(record);
      notify("已保存到云端维修档案", "success");
    } catch (e) {
      notify(
        (e as Error).message || "维修记录保存失败，内容已保留，可重试",
        "error"
      );
    } finally {
      setRepairBusy(false);
    }
  }

  const view = contentFor(diagnosis, elder ? "elder" : "standard");
  const showSourceNote =
    diagnosis.source !== "ai" || (elder && !hasElderCopy(diagnosis));

  return (
    <div className="space-y-5">
      {/* elder 分步引导（standard 一屏全出，elder 逐步展开） */}
      {elder && (
        <p className="rounded-xl bg-tip-bg px-4 py-2.5 text-base font-medium text-tip-text">
          👉 {ELDER_STAGES[elderStage]}
        </p>
      )}

      {/* 诊断完成标识 + 来源标识 */}
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-risk-low" />
          <div className="min-w-0">
            <h1 className={elder ? "text-xl font-bold text-stone-900" : "text-lg font-bold text-stone-900"}>
              {elder ? "诊断完成！这就告诉您怎么办" : "诊断完成！为您生成详细的维修建议"}
            </h1>
            <p className="mt-0.5 text-sm text-stone-500">
              {diagnosis.deviceName ?? "未关联设备"} · {diagnosis.symptom || "自定义描述"} ·{" "}
              {formatDateTime(diagnosis.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={diagnosis.source} model={diagnosis.model} />
          {authed ? (
            reportSaved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-low-bg px-2.5 py-1 text-xs font-medium text-risk-low-deep">
                <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> 已保存到云端
              </span>
            ) : reportFailed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-risk-high-bg px-2.5 py-1 text-xs font-medium text-risk-high-deep">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> 保存失败
              </span>
            ) : reportSaving ? (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
                保存中…
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                待保存到云端
              </span>
            )
          ) : (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
              游客：仅保存在本机
            </span>
          )}
        </div>
      </div>

      {showSourceNote && (
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
            "本结果由本地模板生成，不是真实 AI 诊断，仅用于离线演示。"}
          {diagnosis.source === "unknown" &&
            "该历史记录未保存内容来源，无法确认是否由真实 AI 生成；不对来源作推断。"}
          {elder && !hasElderCopy(diagnosis) &&
            " 该历史记录只保存了当前版本文案，切换标准/长辈模式不会改变诊断判断。"}
        </p>
      )}

      {/* 核心结论 */}
      <SectionCard title="诊断结论">
        <p className={`text-stone-800 ${elder ? "text-lg leading-loose" : "text-sm leading-relaxed"}`}>
          {view.content.conclusion}
        </p>
        {(diagnosis.source === "ai" || diagnosis.source === "template") && (
          <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
            {diagnosis.source === "ai"
              ? `内容由真实 AI 生成${diagnosis.model ? `（${diagnosis.model}）` : ""}；风险等级由本地安全规则独立判定。`
              : "内容由本地固定模板生成（非 AI）；风险等级由本地安全规则独立判定。"}
          </p>
        )}
      </SectionCard>

      {/* 风险等级（安全信息：任何模式下始终完整展示，不参与分步折叠） */}
      <RiskAlert
        level={diagnosis.riskLevel}
        description={view.content.riskNote ?? undefined}
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
            {view.content.possibleCauses.map((c, i) => (
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
            {view.content.evidence.map((e) => (
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

      {/* 未知 / 待确认信息：不升级为事实 */}
      {showRest && view.content.unknownInformation.length > 0 && (
        <SectionCard title={elder ? "还没弄清楚的情况" : "待确认信息"}>
          <ul className="space-y-2">
            {view.content.unknownInformation.map((u) => (
              <li
                key={u}
                className={`flex items-start gap-2 text-amber-800 ${elder ? "text-base leading-relaxed" : "text-sm"}`}
              >
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {u}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
            这些回答属于“不知道 / 没试过”等未知信息，未作为已确认事实使用。
          </p>
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
          {authed ? (
            <Button
              variant={reportSaved ? "secondary" : "primary"}
              onClick={() => void saveReport()}
              disabled={reportSaved || reportSaving}
            >
              <Save className="h-4 w-4" />
              {reportSaved
                ? "报告已保存"
                : reportSaving
                  ? "保存中…"
                  : reportFailed
                    ? "重试保存报告"
                    : "保存报告到云端"}
            </Button>
          ) : (
            <Link
              to={loginHref(`/diagnosis/${diagnosis.id}/result`)}
              className={buttonClass("primary", "md")}
            >
              <Save className="h-4 w-4" /> 登录后保存报告
            </Link>
          )}
          <Button onClick={() => void saveRecord()} disabled={saved || repairBusy}>
            <Save className="h-4 w-4" />
            {repairBusy
              ? "保存中…"
              : saved
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

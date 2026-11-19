import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import SourceBadge from "../components/SourceBadge";
import { useToast } from "../components/Toast";
import { avgIntervalLabel, computeStats } from "../services/repairService";
import {
  diagnosesForOwner,
  useDiagnosisStore,
} from "../stores/diagnosisStore";
import {
  localRepairCount,
  recordsForOwner,
  useRepairStore,
} from "../stores/repairStore";
import { formatDateTime, relativeTime } from "../utils/format";
import {
  REPAIR_STATUS_LABELS,
  VERIFICATION_LABELS,
  type RepairRecord,
  type VerificationStatus,
} from "../types/repair";

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "unverified", label: "待验证" },
  { value: "recovered", label: "已恢复" },
  { value: "partial", label: "部分恢复" },
  { value: "notRecovered", label: "未恢复" },
];

const TIME_OPTIONS = [
  { value: "all", label: "全部时间" },
  { value: "30", label: "近 30 天" },
  { value: "90", label: "近 90 天" },
];

/** 维修结果验证四选一（P4 核心交互） */
const VERIFY_OPTIONS: { value: VerificationStatus; label: string }[] = [
  { value: "recovered", label: "已恢复" },
  { value: "partial", label: "部分恢复" },
  { value: "notRecovered", label: "未恢复" },
  { value: "unknown", label: "暂无法确认" },
];

export default function Records() {
  const { notify } = useToast();

  const allRecords = useRepairStore((s) => s.records);
  const ownerKey = useRepairStore((s) => s.ownerKey);
  const updateVerification = useRepairStore((s) => s.updateVerification);
  /** 只展示当前账号的记录；旧本机历史保留但不混入 */
  const records = useMemo(
    () => recordsForOwner(allRecords, ownerKey),
    [allRecords, ownerKey]
  );
  const localCount = localRepairCount(allRecords, ownerKey);
  const retryCloud = useRepairStore((s) => s.retryCloud);

  const allDiagnoses = useDiagnosisStore((s) => s.history);
  const diagnosisOwner = useDiagnosisStore((s) => s.ownerKey);
  /** 诊断历史：云端已保存 + 本账号本地记录（跨浏览器登录后可从服务端恢复） */
  const reports = useMemo(
    () =>
      diagnosesForOwner(allDiagnoses, diagnosisOwner)
        .filter((d) => d.status === "completed")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allDiagnoses, diagnosisOwner]
  );

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  /** 展开的记录详情 */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => computeStats(records), [records]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const days = timeFilter === "all" ? null : Number(timeFilter);
    const since = days ? Date.now() - days * 86_400_000 : null;
    return records.filter((r) => {
      if (statusFilter !== "all" && r.verificationStatus !== statusFilter) return false;
      if (since && new Date(r.createdAt).getTime() < since) return false;
      if (kw) {
        const hay = [r.deviceName, r.faultDescription, r.repairMethod, r.technician ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [records, keyword, statusFilter, timeFilter]);

  async function verify(r: RepairRecord, v: VerificationStatus) {
    try {
      await updateVerification(r.id, v);
      notify(`已更新验证结果：${VERIFICATION_LABELS[v]}`, "success");
    } catch (e) {
      notify(
        `更新失败，已还原原状态：${(e as Error).message || "请稍后重试"}`,
        "error"
      );
    }
  }

  async function retry(r: RepairRecord) {
    try {
      await retryCloud(r.id);
      notify("已重新保存到云端", "success");
    } catch (e) {
      notify((e as Error).message || "重试失败，内容仍保留在本机", "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="维修档案"
        subtitle="查看您的维修记录，了解设备健康状况"
        actions={
          <Button variant="secondary" onClick={() => notify("演示状态：导出功能暂未接入", "info")}>
            <Download className="h-4 w-4" /> 导出记录
          </Button>
        }
      />

      {localCount > 0 && (
        <p role="note" className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          另有 <strong>{localCount}</strong> 条本机历史维修记录未归属任何账号，仍保留在本机，
          切换到游客演示可查看；不会自动归入当前账号。
        </p>
      )}

      {/* 诊断历史：已保存报告可在另一浏览器登录同一账号后查看 */}
      {reports.length > 0 && (
        <SectionCard title={`诊断报告（${reports.length}）`} padding="sm">
          <ul className="divide-y divide-stone-100">
            {reports.slice(0, 10).map((d) => (
              <li key={d.id}>
                <Link
                  to={`/diagnosis/${d.id}/report`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 transition-colors hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-800">
                      {d.deviceName ?? "未关联设备"} · {d.symptom || "自定义描述"}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-400">
                      {formatDateTime(d.createdAt)}
                      {d.imported ? " · 本机导入（未经服务端校验）" : ""}
                      {d.saveStatus === "failed" ? " · 未同步到云端" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <SourceBadge source={d.source} model={d.model} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {reports.length > 10 && (
            <p className="mt-2 text-xs text-stone-400">仅显示最近 10 份报告。</p>
          )}
        </SectionCard>
      )}

      {/* 顶部安全提示条 */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-2xl border border-risk-medium-border bg-risk-medium-bg p-4 text-sm text-risk-medium-deep"
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-risk-medium" />
        <p>
          维修前后如发现<span className="font-bold">冒烟、焦糊气味或疑似漏电</span>
          ，请立即停止使用并联系专业人员。
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="累计维修" value={String(stats.total)} cls="text-brand-700" />
        <Stat label="已恢复" value={String(stats.recovered)} cls="text-risk-low-deep" />
        <Stat label="待验证" value={String(stats.unverified)} cls="text-risk-medium-deep" />
        <Stat label="平均维修间隔" value={avgIntervalLabel(stats)} cls="text-stone-900" small />
      </div>

      {/* 筛选 */}
      <FilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        filters={[
          { label: "验证状态", value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS },
          { label: "时间", value: timeFilter, onChange: setTimeFilter, options: TIME_OPTIONS },
        ]}
        onReset={() => {
          setKeyword("");
          setStatusFilter("all");
          setTimeFilter("all");
        }}
        searchPlaceholder="搜索设备 / 故障 / 维修人员…"
      />

      {/* 记录列表 */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={records.length === 0 ? "暂无维修记录" : "没有符合筛选条件的记录"}
          description={
            records.length === 0
              ? "完成诊断后点击「保存维修记录」，或手动添加维修记录。"
              : "试试调整筛选条件。"
          }
          action={
            records.length === 0 ? (
              <Link to="/diagnose" className={buttonClass("primary", "md")}>
                开始诊断
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const open = expandedId === r.id;
            const sourceLabel = !r.diagnosisId
              ? "手动记录"
              : r.diagnosisSource === "ai"
                ? "真实 AI 生成"
                : r.diagnosisSource === "template"
                  ? "模板演示（非 AI）"
                  : "来源未记录";
            return (
              <li key={r.id} className="card-base overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : r.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {r.deviceName} · {r.faultDescription}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {relativeTime(r.createdAt)} · {REPAIR_STATUS_LABELS[r.status]} · 验证：
                      {VERIFICATION_LABELS[r.verificationStatus]}
                      {r.cloud ? " · 云端" : ""}
                      {r.imported ? " · 本机导入" : ""}
                      {r.saveStatus === "failed" ? " · 未同步" : ""}
                    </p>
                  </div>
                  <span aria-hidden className="text-stone-300">
                    {open ? "▴" : "▾"}
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-stone-100 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="创建时间" value={formatDateTime(r.createdAt)} />
                      <Field label="维修时间" value={r.repairTime ? formatDateTime(r.repairTime) : "—"} />
                      <Field label="维修人员" value={r.technician ?? "—"} />
                      <Field label="费用" value={r.cost != null ? `¥${r.cost}` : "—"} />
                      <Field label="诊断来源" value={sourceLabel} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-400">处理方式</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{r.repairMethod}</p>
                    </div>
                    {r.diagnosisId && (
                      <p className="text-xs">
                        <Link to={`/diagnosis/${r.diagnosisId}/report`} className="text-brand-700 hover:underline">
                          查看关联诊断报告 ›
                        </Link>
                      </p>
                    )}

                    {/* 维修结果验证（四选一） */}
                    <div className="rounded-xl bg-stone-50 p-3">
                      <p className="text-sm font-medium text-stone-700">维修结果验证</p>
                      <p className="mt-0.5 text-xs text-stone-400">当前：{VERIFICATION_LABELS[r.verificationStatus]}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {VERIFY_OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => verify(r, o.value)}
                            className={[
                              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                              r.verificationStatus === o.value
                                ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                                : "border-stone-300 bg-surface text-stone-600 hover:bg-stone-100",
                            ].join(" ")}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.saveStatus === "failed" && (
                          <>
                            <span className="text-xs text-risk-high-deep">
                              保存失败，内容仍保留在本机
                            </span>
                            <Button variant="secondary" size="sm" onClick={() => void retry(r)}>
                              重试保存
                            </Button>
                          </>
                        )}
                        <span className="text-xs text-stone-400">
                          如问题再次出现，可点击「再次诊断」或联系客服。
                        </span>
                      </div>
                      <Link to="/diagnose" className={buttonClass("secondary", "sm")}>
                        <RotateCcw className="h-3.5 w-3.5" /> 再次诊断
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, cls, small }: { label: string; value: string; cls: string; small?: boolean }) {
  return (
    <div className="card-base p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-1 font-bold ${small ? "text-lg" : "text-2xl"} ${cls}`}>{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-800">{value}</p>
    </div>
  );
}

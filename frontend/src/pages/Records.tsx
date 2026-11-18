import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { avgIntervalLabel, computeStats } from "../services/repairService";
import { useRepairStore } from "../stores/repairStore";
import {
  REPAIR_STATUS_LABELS,
  VERIFICATION_LABELS,
  type RepairRecord,
  type VerificationStatus,
} from "../types/repair";
import { formatDateTime, relativeTime } from "../utils/format";

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

  const records = useRepairStore((s) => s.records);
  const updateVerification = useRepairStore((s) => s.updateVerification);

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

  function verify(r: RepairRecord, v: VerificationStatus) {
    updateVerification(r.id, v);
    notify(`已更新验证结果：${VERIFICATION_LABELS[v]}`, "success");
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
        <Stat label="平均维修间隔" value={avgIntervalLabel(stats)} cls="text-slate-900" small />
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
            return (
              <li key={r.id} className="card-base overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : r.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {r.deviceName} · {r.faultDescription}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {relativeTime(r.createdAt)} · {REPAIR_STATUS_LABELS[r.status]} · 验证：
                      {VERIFICATION_LABELS[r.verificationStatus]}
                    </p>
                  </div>
                  <span aria-hidden className="text-slate-300">
                    {open ? "▴" : "▾"}
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-slate-100 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="创建时间" value={formatDateTime(r.createdAt)} />
                      <Field label="维修时间" value={r.repairTime ? formatDateTime(r.repairTime) : "—"} />
                      <Field label="维修人员" value={r.technician ?? "—"} />
                      <Field label="费用" value={r.cost != null ? `¥${r.cost}` : "—"} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">处理方式</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.repairMethod}</p>
                    </div>
                    {r.diagnosisId && (
                      <p className="text-xs">
                        <Link to={`/diagnosis/${r.diagnosisId}/report`} className="text-brand-700 hover:underline">
                          查看关联诊断报告 ›
                        </Link>
                      </p>
                    )}

                    {/* 维修结果验证（四选一） */}
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-700">维修结果验证</p>
                      <p className="mt-0.5 text-xs text-slate-400">当前：{VERIFICATION_LABELS[r.verificationStatus]}</p>
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
                                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
                            ].join(" ")}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        如问题再次出现，可点击「再次诊断」或联系客服。
                      </p>
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
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${small ? "text-lg" : "text-2xl"} ${cls}`}>{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

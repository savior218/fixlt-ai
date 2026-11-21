import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Download, Phone, RotateCcw } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import FilterBar from "../components/FilterBar";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import {
  LEGACY_STATUS_LABELS,
  PROGRESS_STATUS_LABELS,
  type RepairTicket,
} from "../services/api";
import {
  CATEGORY_LABELS,
  MAINTENANCE_CATALOG,
  computeDue,
  intervalLabel,
  lookupHotline,
} from "../services/afterSalesService";
import { useToast } from "../components/Toast";
import { avgIntervalLabel, computeStats } from "../services/repairService";
import {
  localRepairCount,
  recordsForOwner,
  useRepairStore,
} from "../stores/repairStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import { useTicketStore } from "../stores/ticketStore";
import {
  diagnosesForOwner,
  useDiagnosisStore,
} from "../stores/diagnosisStore";
import { formatDateTime, relativeTime } from "../utils/format";
import {
  REPAIR_STATUS_LABELS,
  VERIFICATION_LABELS,
  type RepairRecord,
  type VerificationStatus,
} from "../types/repair";

const STATUS_OPTIONS = [
  { value: "all", label: "验证状态" },
  { value: "unverified", label: "待验证" },
  { value: "recovered", label: "已恢复" },
  { value: "partial", label: "部分恢复" },
  { value: "notRecovered", label: "未恢复" },
];

const TIME_OPTIONS = [
  { value: "all", label: "时间" },
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
        actions={
          <Button variant="secondary" onClick={() => notify("演示状态：导出功能暂未接入", "info")}>
            <Download className="h-4 w-4" /> 导出记录
          </Button>
        }
      />

      {/* 报修流程闭环：官方售后电话 + 话术 + 已维修 / 未维修跟踪 */}
      <AfterSalesSection />

      {/* 保养提醒：按品类间隔记录保养，到期自动提醒 */}
      <MaintenanceSection />

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
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-brand-700">
                    点击查看
                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
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
          { label: "", value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS },
          { label: "", value: timeFilter, onChange: setTimeFilter, options: TIME_OPTIONS },
        ]}
        onReset={() => {
          setKeyword("");
          setStatusFilter("all");
          setTimeFilter("all");
        }}
        searchPlaceholder="搜索设备、故障、维修人员…"
      />

      {/* 记录列表 */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-surface px-4 py-12 text-center">
          {records.length === 0 ? (
            <>
              <p className="text-sm text-stone-500">暂无维修记录</p>
              <p data-elder="hide" className="mt-1 text-xs text-stone-400">
                完成诊断后点击保存维修记录，或手动添加维修记录。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-500">没有符合筛选条件的记录</p>
              <p data-elder="hide" className="mt-1 text-xs text-stone-400">
                试试调整筛选条件。
              </p>
            </>
          )}
        </div>
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

/** 报修流程记录：平台不代报修；按「已维修 / 未维修 / 进行中」分组展示官方售后跟进闭环 */
function AfterSalesSection() {
  const { notify } = useToast();
  const tickets = useTicketStore((s) => s.tickets);
  const total = useTicketStore((s) => s.total);
  const page = useTicketStore((s) => s.page);
  const pageSize = useTicketStore((s) => s.pageSize);
  const loading = useTicketStore((s) => s.loading);
  const legacyDrafts = useTicketStore((s) => s.legacyDrafts);
  const load = useTicketStore((s) => s.load);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function changePage(next: number) {
    const ok = await load(next);
    if (!ok) notify("报修流程记录加载失败，请稍后重试", "error");
  }

  /** 按闭环进度分组：进行中 / 已维修 / 未维修 */
  const groups = useMemo(() => {
    const isInProgress = (t: RepairTicket) =>
      !t.progress_status ||
      (["pending_contact", "contacted", "scheduled"] as string[]).includes(t.progress_status);
    return {
      ongoing: tickets.filter(isInProgress),
      repaired: tickets.filter((t) => t.progress_status === "completed"),
      unrepaired: tickets.filter((t) => t.progress_status === "canceled"),
    };
  }, [tickets]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function renderTicket(t: RepairTicket) {
    const hotline = lookupHotline(t.brand);
    return (
      <li key={t.id} className="rounded-xl border border-stone-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/tickets/${t.id}`} className="text-sm font-semibold text-stone-900 hover:underline">
            {t.symptom}
            <span className="ml-2 text-xs font-normal text-stone-400">
              #{t.id} · {relativeTime(t.created_at)}
            </span>
          </Link>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs",
              t.progress_status === "completed"
                ? "bg-risk-low-bg text-risk-low-deep"
                : t.progress_status === "canceled"
                  ? "bg-stone-100 text-stone-500"
                  : "bg-brand-50 text-brand-700",
            ].join(" ")}
          >
            {t.progress_status
              ? `${PROGRESS_STATUS_LABELS[t.progress_status]}${
                  t.progress_status === "pending_contact" ? "" : `（由 ${t.progress_updated_by ?? "本人"} 更新）`
                }`
              : `旧状态：${LEGACY_STATUS_LABELS[t.status]}（未经本轮确认）`}
          </span>
        </div>
        {t.brand || t.model ? (
          <p className="mt-1 text-xs text-stone-500">
            {CATEGORY_LABELS[t.category] ?? "家电"}
            {" · "}
            {[t.brand, t.model].filter(Boolean).join(" ")}
          </p>
        ) : null}
        {hotline && (
          <a
            href={`tel:${hotline.phone.replace(/-/g, "")}`}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <Phone aria-hidden className="h-3.5 w-3.5" />
            {hotline.brand}官方售后 {hotline.phone}
          </a>
        )}
        {t.photo_ids.length > 0 && (
          <p className="mt-1 text-xs text-stone-500">关联照片 {t.photo_ids.length} 张</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link to={`/tickets/${t.id}`} className="text-xs text-brand-700 hover:underline">
            查看话术与详情并更新进度
          </Link>
        </div>
      </li>
    );
  }

  return (
    <SectionCard
      title="报修流程记录"
      action={
        <span className="text-xs text-stone-500">
          已维修 {groups.repaired.length} · 未维修 {groups.unrepaired.length} · 进行中{" "}
          {groups.ongoing.length}
        </span>
      }
    >
      {legacyDrafts.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          另有 {legacyDrafts.length} 条旧版本本地草稿（未提交到服务端，仅保留在本机，不会被当作已保存事项）：
          <ul className="mt-1 space-y-0.5">
            {legacyDrafts.slice(0, 3).map((t) => (
              <li key={t.id}>{t.symptom} · {t.created_at}</li>
            ))}
          </ul>
        </div>
      )}

      {tickets.length === 0 && !loading ? (
        <div className="py-8 text-center">
          <p className="text-sm text-stone-500">暂无保修流程记录</p>
          <p className="mt-1 text-xs text-stone-400">
            可在
            <Link to="/repair" className="mx-1 text-brand-700 hover:underline">
              智能报修助手
            </Link>
            生成报修话术并拨打官方售后电话后，把报修流程存入维修档案。
          </p>
        </div>
      ) : (
        <>
          {groups.repaired.length > 0 && (
            <TicketGroup label={`已通过官方售后维修（${groups.repaired.length}）`}>
              {groups.repaired.map(renderTicket)}
            </TicketGroup>
          )}
          {groups.unrepaired.length > 0 && (
            <TicketGroup label={`未维修（${groups.unrepaired.length}）`}>
              {groups.unrepaired.map(renderTicket)}
            </TicketGroup>
          )}
          {groups.ongoing.length > 0 && (
            <TicketGroup label={`进行中（${groups.ongoing.length}）`}>
              {groups.ongoing.map(renderTicket)}
            </TicketGroup>
          )}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
              <span>第 {page} / {totalPages} 页 · 共 {total} 条</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => void changePage(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => void changePage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function TicketGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-semibold text-stone-600">{label}</p>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

/** 保养提醒：按品类保养目录记录每台设备的保养间隔，到期自动站内提醒 */
function MaintenanceSection() {
  const { notify } = useToast();
  const { devices, load } = useDeviceStore();
  const logs = useMaintenanceStore((s) => s.logs);
  const recordMaintenance = useMaintenanceStore((s) => s.recordMaintenance);
  const dispatchDueReminders = useMaintenanceStore((s) => s.dispatchDueReminders);
  /** 补记日期输入（key = `${deviceId}:${item}`） */
  const [dates, setDates] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
  }, [load]);

  // 进入维修档案时即时检查一次到期提醒（同一周期全局只提醒一次，重复调用安全）
  useEffect(() => {
    dispatchDueReminders();
  }, [dispatchDueReminders]);

  const rows = useMemo(() => {
    const result: {
      key: string;
      deviceId: number;
      deviceName: string;
      category: string;
      location: string | null;
      item: string;
      intervalDays: number;
      lastDoneAt: string | null;
    }[] = [];
    for (const d of devices) {
      for (const cat of MAINTENANCE_CATALOG[d.category] ?? []) {
        const log = logs.find((l) => l.deviceId === d.id && l.item === cat.item);
        result.push({
          key: `${d.id}:${cat.item}`,
          deviceId: d.id,
          deviceName: d.name,
          category: d.category,
          location: d.location,
          item: cat.item,
          intervalDays: cat.intervalDays,
          lastDoneAt: log?.lastDoneAt ?? null,
        });
      }
    }
    // 已到期的排最前
    return result.sort((a, b) => {
      const dueOf = (r: (typeof result)[number]) =>
        r.lastDoneAt ? computeDue(r.lastDoneAt, r.intervalDays).daysLeft : -Infinity;
      return dueOf(a) - dueOf(b);
    });
  }, [devices, logs]);

  function save(r: (typeof rows)[number], doneAt: string) {
    if (!doneAt) {
      notify("请先选择保养完成日期", "error");
      return;
    }
    recordMaintenance({
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      category: r.category,
      location: r.location,
      item: r.item,
      intervalDays: r.intervalDays,
      doneAt: new Date(doneAt).toISOString(),
    });
    notify(
      `已记录「${r.deviceName} · ${r.item}」，下次提醒将在 ${intervalLabel(r.intervalDays)}后`,
      "success"
    );
  }

  const dueCount = rows.filter(
    (r) => r.lastDoneAt && computeDue(r.lastDoneAt, r.intervalDays).overdue
  ).length;

  return (
    <SectionCard
      title="保养提醒"
      action={
        dueCount > 0 ? (
          <span className="rounded-full bg-risk-high-bg px-2 py-0.5 text-xs font-medium text-risk-high-deep">
            {dueCount} 项已到期
          </span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-stone-500">暂无可跟踪保养的设备</p>
          <p className="mt-1 text-xs text-stone-400">
            先在
            <Link to="/devices" className="mx-1 text-brand-700 hover:underline">
              我的设备
            </Link>
            添加相应设备，这里会自动生成对应保养计划。
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => {
            const due = r.lastDoneAt ? computeDue(r.lastDoneAt, r.intervalDays) : null;
            const doneDate = dates[r.key] ?? new Date().toISOString().slice(0, 10);
            return (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800">
                    {r.deviceName} · {r.item}
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      {r.location ? `${r.location} · ` : ""}
                      {intervalLabel(r.intervalDays)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {r.lastDoneAt
                      ? `上次保养：${formatDateTime(r.lastDoneAt)} · ${
                          due?.overdue
                            ? `已到期 ${Math.abs(due.daysLeft)} 天，建议尽快保养`
                            : `下次提醒：${formatDateTime(due!.dueAt)}（约 ${due!.daysLeft} 天后）`
                        }`
                      : "尚未记录保养，记录一次后开始按间隔提醒"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {due?.overdue && (
                    <span className="rounded-full bg-risk-high-bg px-2 py-0.5 text-xs font-medium text-risk-high-deep">
                      已到期
                    </span>
                  )}
                  <input
                    type="date"
                    aria-label={`${r.deviceName} ${r.item} 保养完成日期`}
                    value={doneDate}
                    onChange={(e) => setDates((d) => ({ ...d, [r.key]: e.target.value }))}
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                  />
                  <Button variant="secondary" size="sm" onClick={() => save(r, doneDate)}>
                    记录保养
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Database, Download, HardDrive, Loader2, Trash2 } from "lucide-react";

import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { useAuthStore } from "../stores/authStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useRepairStore } from "../stores/repairStore";
import { useTicketStore } from "../stores/ticketStore";
import { usePrefs } from "../stores/prefs";
import { countLocalHistory } from "../services/cloudSync";
import {
  ApiError,
  DATA_TYPE_LABELS,
  deleteDataItems,
  exportMyData,
  getDataSummary,
  listDataItems,
  photoUrl,
  type DataItem,
  type DataItemType,
  type DataSummary,
} from "../services/api";

const TABS: DataItemType[] = ["device", "diagnosis", "repair", "ticket", "photo"];

const IMPACT_TEXT: Record<DataItemType, string> = {
  device: "删除设备只解除报告/维修/报修中的设备关联，不会删除这些历史记录。",
  diagnosis: "删除报告会解除维修记录与它的关联，不会删除维修记录本身。",
  repair: "删除维修记录会解除报修事项与它的关联，不会删除报修事项。",
  ticket: "删除报修事项会同时删除照片关联，但不会删除照片文件本身。",
  photo: "删除照片会从服务端删除图片本体，并解除报修事项中的照片关联。",
};

export default function DataManagement() {
  const { notify } = useToast();
  const status = useAuthStore((s) => s.status);
  const diagnosisHistory = useDiagnosisStore((s) => s.history);
  const repairs = useRepairStore((s) => s.records);
  const legacyDrafts = useTicketStore((s) => s.legacyDrafts);
  const prefs = usePrefs();

  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [tab, setTab] = useState<DataItemType>("device");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [items, setItems] = useState<DataItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearLocalOpen, setClearLocalOpen] = useState(false);

  const localCounts = countLocalHistory(diagnosisHistory, repairs);

  const selection = useMemo(() => {
    return Array.from(selected).map((key) => {
      const [type, id] = key.split(":");
      return { type: type as DataItemType, id: Number(id) };
    });
  }, [selected]);

  async function refreshSummary() {
    if (status !== "authenticated") return;
    try {
      setSummary(await getDataSummary());
    } catch {
      /* 汇总失败不阻塞列表 */
    }
  }

  async function loadPage(nextPage = page, nextTab = tab) {
    if (status !== "authenticated") return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listDataItems(nextTab, nextPage, pageSize);
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "数据列表加载失败");
      // 保留当前列表，允许重试
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSummary();
    void loadPage(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function switchTab(next: DataItemType) {
    setTab(next);
    setPage(1);
    setSelected(new Set());
    setItems([]);
    void loadPage(1, next);
  }

  function toggleItem(item: DataItem) {
    const key = `${item.type}:${item.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (status !== "authenticated") return;
    setExporting(true);
    try {
      await exportMyData();
      notify("导出已开始；文件只包含当前账号的结构化数据", "success");
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "导出失败，请重试", "error");
    } finally {
      setExporting(false);
    }
  }

    async function handleDelete() {
    if (selection.length === 0) return;
    setDeleting(true);
    try {
      const result = await deleteDataItems(selection);
      setSummary(result.summary);
      setSelected(new Set());
      setConfirmOpen(false);
      notify(`已删除 ${result.deleted} 项；关联关系已按说明处理`, "success");
      await loadPage(1, tab);
    } catch (err) {
      // 失败时保留界面记录与选中项，允许重试
      notify(err instanceof ApiError ? err.message : "删除失败，请重试", "error");
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  function clearLocalData() {
    prefs.reset();
    useDiagnosisStore.getState().clearAll();
    useRepairStore.getState().clearAll();
    localStorage.removeItem("fixitai-diagnosis");
    localStorage.removeItem("fixitai-repairs");
    localStorage.removeItem("fixitai-notifications");
    localStorage.removeItem("fixitai-tickets");
    setClearLocalOpen(false);
    notify("本机缓存已清除；云端账号数据未受影响", "success");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedTypes = selection.map((s) => s.type);

  return (
    <div className="space-y-5">
      <PageHeader
        title="个人数据管理"
        subtitle="查看、导出或删除当前账号的数据；本机缓存与云端数据分开处理"
      />

      {status !== "authenticated" ? (
        <SectionCard title="需要登录">
          <p className="text-sm text-stone-600">
            登录后才能查看账号内的设备、报告、维修记录、报修事项和照片。
          </p>
          <Link to="/login" className="mt-2 inline-block text-brand-700 hover:underline">
            去登录
          </Link>
        </SectionCard>
      ) : (
        <SectionCard title="账号数据概览">
          {summary ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["设备", summary.devices],
                  ["报告", summary.diagnoses],
                  ["维修记录", summary.repairs],
                  ["报修事项", summary.tickets],
                  ["照片", summary.photos],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="rounded-xl bg-stone-50 p-3">
                  <p className="text-xs text-stone-500">{label}</p>
                  <p className="text-lg font-semibold text-stone-900">{count}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">正在读取账号数据…</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "导出中…" : "导出我的数据"}
            </Button>
            <Button
              variant="danger"
              disabled={selection.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> 删除选中（{selection.length}）
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            导出不包含密码哈希、会话令牌、密钥等内部字段；照片只导出元数据。
          </p>
        </SectionCard>
      )}

      {status === "authenticated" && (
        <SectionCard title="账号数据列表">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  tab === t ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                ].join(" ")}
              >
                {DATA_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {loadError && (
            <div role="alert" className="mb-2 rounded-lg border border-risk-high-border bg-risk-high-bg p-2 text-xs text-risk-high-deep">
              {loadError}
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => void loadPage(page, tab)}
              >
                重试
              </button>
            </div>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在加载…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-stone-500">当前分类暂无数据。</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((item) => {
                const key = `${item.type}:${item.id}`;
                return (
                  <li key={key} className="flex items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleItem(item)}
                      aria-label={`选择 ${DATA_TYPE_LABELS[item.type]} ${item.title}`}
                      className="mt-1 h-4 w-4"
                    />
                    {item.type === "photo" && (
                      <img
                        src={photoUrl(item.id)}
                        alt=""
                        className="h-12 w-12 rounded border border-stone-200 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800">{item.title}</p>
                      <p className="text-xs text-stone-500">
                        {DATA_TYPE_LABELS[item.type]} #{item.id}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                        {item.created_at ? ` · ${item.created_at}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
              <span>第 {page} / {totalPages} 页 · 共 {total} 条</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => void loadPage(page - 1, tab)}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => void loadPage(page + 1, tab)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="本机数据（与账号数据分开）">
        <p className="flex items-center gap-1 text-xs text-stone-500">
          <HardDrive className="h-3.5 w-3.5" />
          本机历史：{localCounts.diagnoses} 份诊断报告、{localCounts.repairs} 条维修记录、
          {legacyDrafts.length} 条旧报修草稿。
        </p>
        <p className="mt-1 text-xs text-stone-400">
          清除本机缓存只影响这台设备上的草稿与偏好，不会删除服务端已保存的设备、报告、
          维修记录或报修事项。
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setClearLocalOpen(true)}>
          <Database className="h-4 w-4" /> 清除本机数据
        </Button>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除选中数据？"
        message={
          `将删除 ${selection.length} 项账号数据。\n` +
          selectedTypes
            .filter((t, i) => selectedTypes.indexOf(t) === i)
            .map((t) => `· ${DATA_TYPE_LABELS[t]}：${IMPACT_TEXT[t]}`)
            .join("\n") +
          "\n删除失败时会保留列表与选中项；不会删除本机草稿。"
        }
        confirmLabel={deleting ? "删除中…" : "确认删除"}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={clearLocalOpen}
        title="清除本机数据？"
        message="将清除本机偏好、诊断草稿、维修记录和旧报修草稿；服务端账号数据不会受影响。此操作不会删除云端任何记录。"
        confirmLabel="确认清除本机"
        onConfirm={clearLocalData}
        onCancel={() => setClearLocalOpen(false)}
      />
    </div>
  );
}

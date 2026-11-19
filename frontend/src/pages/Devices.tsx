import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Info, Plus } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import DeviceCard from "../components/DeviceCard";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import FilterBar from "../components/FilterBar";
import InputField from "../components/InputField";
import Loading from "../components/Loading";
import ModalDialog from "../components/ModalDialog";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { CATEGORY_LABELS, type DeviceCategory } from "../services/api";
import { loginHref } from "../utils/redirect";
import { withMeta } from "../services/deviceService";
import { useDeviceStore } from "../stores/deviceStore";
import { useRepairStore } from "../stores/repairStore";
import { usePrefs } from "../stores/prefs";
import type { DeviceForm } from "../types/device";
import { validateDeviceForm } from "../utils/validation";

const EMPTY_FORM: DeviceForm = {
  name: "",
  category: "ac",
  brand: "",
  model: "",
  purchaseDate: null,
  location: "",
  imageUrl: null,
  note: "",
};

/** P6 我的设备（对照「智修AI智能家居维修仪表盘.png」设备列表屏） */
export default function Devices() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const { devices, loading, error, load, add, update, remove, demoMode } =
    useDeviceStore();
  const records = useRepairStore((s) => s.records);
  const ownerKey = useRepairStore((s) => s.ownerKey);
  const visibleRecords = useMemo(
    () => records.filter((r) => (r.ownerKey || "local") === ownerKey),
    [records, ownerKey]
  );

  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState<DeviceForm | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof DeviceForm, string>>>({});
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => void load(), [load]);

  /** 派生：维修次数 / 状态（与 P4/P8 同源 repairStore） */
  const devicesWithMeta = useMemo(
    () => devices.map((d) => withMeta(d, visibleRecords)),
    [devices, visibleRecords]
  );

  const stats = useMemo(() => {
    const total = devicesWithMeta.length;
    const normal = devicesWithMeta.filter((d) => d.status === "normal").length;
    const pending = devicesWithMeta.filter((d) => d.status === "pending").length;
    const fault = devicesWithMeta.filter((d) => d.status === "failed").length;
    return { total, normal, pending, fault };
  }, [devicesWithMeta]);

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return devicesWithMeta.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (!kw) return true;
      return [d.name, d.brand ?? "", d.model ?? "", d.location ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(kw.toLowerCase());
    });
  }, [devicesWithMeta, keyword, categoryFilter]);

  function openCreate() {
    setEditingId(null);
    setErrors({});
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(id: number) {
    const d = devices.find((x) => x.id === id);
    if (!d) return;
    setEditingId(id);
    setErrors({});
    setForm({
      name: d.name,
      category: d.category,
      brand: d.brand ?? "",
      model: d.model ?? "",
      purchaseDate: d.purchaseDate,
      location: d.location ?? "",
      imageUrl: d.imageUrl,
      note: d.note ?? "",
    });
  }

  async function submit() {
    if (!form) return;
    const errs = validateDeviceForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      if (editingId == null) {
        await add(form);
        notify("设备已添加", "success");
      } else {
        await update(editingId, form);
        notify("设备已更新", "success");
      }
      setForm(null);
      setEditingId(null);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id);
      notify("设备已删除", "success");
      setDeleting(null);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="我的设备"
        subtitle="管理家庭设备，随时查看状态与维修记录"
        actions={
          demoMode ? (
            <Link to={loginHref("/devices")} className={buttonClass("primary", "md")}>
              登录后管理自己的设备
            </Link>
          ) : (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> 添加设备
            </Button>
          )
        }
      />

      {demoMode && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            当前为<strong>游客演示</strong>，展示的是只读样例设备，不能修改真实账号或共享种子数据。
            登录后可添加、编辑和删除自己的设备，数据会归当前账号所有。
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {/* 统计卡片：elder 模式精简为一句话 */}
      {elder ? (
        <p className="card-base p-4 text-base text-slate-700">
          共有 <span className="font-bold text-brand-700">{stats.total}</span> 台设备，
          <span className="font-bold text-risk-medium-deep">{stats.pending + stats.fault}</span> 台需要关注。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "设备总数", value: stats.total, cls: "text-brand-700" },
            { label: "运行正常", value: stats.normal, cls: "text-risk-low-deep" },
            { label: "待关注", value: stats.pending, cls: "text-risk-medium-deep" },
            { label: "故障", value: stats.fault, cls: "text-risk-high-deep" },
          ].map((s) => (
            <div key={s.label} className="card-base p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 分类筛选 */}
      {!elder && (
        <FilterBar
          keyword={keyword}
          onKeywordChange={setKeyword}
          filters={[
            {
              label: "设备类型",
              value: categoryFilter,
              onChange: setCategoryFilter,
              options: [
                { value: "all", label: "全部" },
                ...(Object.keys(CATEGORY_LABELS) as DeviceCategory[]).map((c) => ({
                  value: c,
                  label: CATEGORY_LABELS[c],
                })),
              ],
            },
          ]}
          onReset={() => {
            setKeyword("");
            setCategoryFilter("all");
          }}
          searchPlaceholder="搜索设备名称 / 品牌 / 位置…"
        />
      )}

      {/* 列表 */}
      {loading && devices.length === 0 ? (
        <Loading label="加载设备中…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏠"
          title={devices.length === 0 ? "暂无设备" : "没有符合筛选条件的设备"}
          description={
            devices.length === 0
              ? "添加家里的空调、冰箱或洗衣机，诊断时可直接关联。"
              : "试试调整筛选条件或清空关键词。"
          }
          action={
            devices.length === 0 && !demoMode ? (
              <Button onClick={openCreate}>添加设备</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <div key={d.id} className="space-y-2">
              <DeviceCard
                device={d}
                status={d.status}
                repairCount={d.repairCount}
                onClick={() => navigate(`/devices/${d.id}`)}
              />
              {!demoMode && (
                <div className="flex justify-end gap-2 px-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(d.id)}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-risk-high hover:bg-risk-high-bg"
                    onClick={() => setDeleting({ id: d.id, name: d.name })}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 添加 / 编辑弹窗 */}
      <ModalDialog
        open={form != null}
        title={editingId == null ? "添加设备" : "编辑设备"}
        description="设备信息将用于更精准的诊断建议"
        onClose={() => setForm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button onClick={() => void submit()}>保存</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <InputField
              label="设备名称"
              required
              maxLength={64}
              error={errors.name}
              placeholder="如：客厅空调"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                设备类型 <span className="text-risk-high">*</span>
              </span>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as DeviceCategory })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {(Object.keys(CATEGORY_LABELS) as DeviceCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="品牌" placeholder="格力" value={form.brand ?? ""} error={errors.brand}
                onChange={(v) => setForm({ ...form, brand: v })} />
              <InputField label="型号" placeholder="KFR-35GW" value={form.model ?? ""} error={errors.model}
                onChange={(v) => setForm({ ...form, model: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">购买日期</span>
                <input
                  type="date"
                  value={form.purchaseDate ?? ""}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <InputField label="摆放位置" placeholder="客厅" value={form.location ?? ""} error={errors.location}
                onChange={(v) => setForm({ ...form, location: v })} />
            </div>
            <InputField
              label="备注"
              mode="textarea"
              rows={2}
              placeholder="选填，如：房东购置、遥控器丢失等"
              value={form.note ?? ""}
              onChange={(v) => setForm({ ...form, note: v })}
            />
          </div>
        )}
      </ModalDialog>

      {/* 删除二次确认 */}
      <ConfirmDialog
        open={deleting != null}
        title="确认删除设备？"
        message={
          deleting
            ? `删除「${deleting.name}」后无法恢复，该设备的诊断与维修记录仍会保留。`
            : ""
        }
        confirmLabel="确认删除"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />

      {/* 状态图例（帮助理解派生状态） */}
      {!elder && devices.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-400">
          状态说明：
          <StatusBadge status="normal" />
          <StatusBadge status="pending" />
          <StatusBadge status="failed" />
          （由维修记录自动推导）
        </p>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import {
  CATEGORY_LABELS,
  type Device,
  type DeviceCategory,
  type DeviceInput,
  createDevice,
  deleteDevice,
  listDevices,
  updateDevice,
} from "../services/api";

const EMPTY_FORM: DeviceInput = {
  name: "",
  category: "ac",
  brand: "",
  model: "",
  purchase_date: null,
  location: "",
  image_url: null,
  note: "",
};

export default function Devices() {
  const { notify } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDevices(await listDevices());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(d: Device) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      category: d.category,
      brand: d.brand ?? "",
      model: d.model ?? "",
      purchase_date: d.purchase_date,
      location: d.location ?? "",
      image_url: d.image_url,
      note: d.note ?? "",
    });
  }

  async function submit() {
    if (!form || form.name.trim() === "") return;
    const payload: DeviceInput = {
      ...form,
      name: form.name.trim(),
      brand: form.brand?.trim() || null,
      model: form.model?.trim() || null,
      location: form.location?.trim() || null,
      note: form.note?.trim() || null,
    };
    try {
      if (editingId == null) {
        await createDevice(payload);
        notify("设备已添加", "success");
      } else {
        await updateDevice(editingId, payload);
        notify("设备已更新", "success");
      }
      setForm(null);
      setEditingId(null);
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await deleteDevice(deletingId);
      notify("设备已删除", "success");
      setDeletingId(null);
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="我的设备"
        action={
          form == null ? (
            <Button variant="primary" onClick={openCreate}>+ 添加设备</Button>
          ) : undefined
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      {form != null && (
        <form
          className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-sm font-semibold text-slate-700">
            {editingId == null ? "添加设备" : "编辑设备"}
          </h2>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">设备名称 *</span>
            <input
              required
              maxLength={64}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：客厅空调"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">设备类型 *</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as DeviceCategory })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {(Object.keys(CATEGORY_LABELS) as DeviceCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">品牌</span>
              <input
                maxLength={64}
                value={form.brand ?? ""}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="格力"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">型号</span>
              <input
                maxLength={64}
                value={form.model ?? ""}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="KFR-35GW"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">购买日期</span>
              <input
                type="date"
                value={form.purchase_date ?? ""}
                onChange={(e) =>
                  setForm({ ...form, purchase_date: e.target.value || null })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">摆放位置</span>
              <input
                maxLength={64}
                value={form.location ?? ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="客厅"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">备注</span>
            <textarea
              rows={2}
              value={form.note ?? ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="选填，如：房东购置、遥控器丢失等"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <Button type="submit">保存</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              取消
            </Button>
          </div>
        </form>
      )}

      {devices.length === 0 && !error && (
        <EmptyState
          icon="❄️"
          title="暂无设备"
          description="添加家里的空调、冰箱或洗衣机，诊断时可直接关联。"
          action={
            form == null ? (
              <Button variant="primary" onClick={openCreate}>添加设备</Button>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2">
        {devices.map((d) => (
          <li
            key={d.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {CATEGORY_LABELS[d.category]}
                  {d.brand ? ` · ${d.brand}` : ""}
                  {d.model ? ` ${d.model}` : ""}
                  {d.location ? ` · ${d.location}` : ""}
                  {d.purchase_date ? ` · 购于 ${d.purchase_date}` : ""}
                </p>
                {d.note && (
                  <p className="mt-1 text-xs text-slate-400">备注：{d.note}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(d)}>
                  编辑
                </Button>
                <Button variant="danger" size="sm" onClick={() => setDeletingId(d.id)}>
                  删除
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deletingId != null}
        title="确认删除设备？"
        message="删除后无法恢复，该设备的诊断与维修记录仍会保留。"
        confirmLabel="确认删除"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

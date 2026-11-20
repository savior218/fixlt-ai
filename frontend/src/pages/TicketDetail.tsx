import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, ImageIcon, Loader2, Phone } from "lucide-react";

import Button from "../components/Button";
import InputField from "../components/InputField";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import {
  ApiError,
  LEGACY_STATUS_LABELS,
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_ORDER,
  getTicket,
  linkTicketRepairRecord,
  listCloudRepairs,
  photoUrl,
  updateTicketProgress,
  type ProgressStatus,
  type RepairTicket,
  type CloudRepairRecord,
} from "../services/api";
import { lookupHotline } from "../services/afterSalesService";
import { copyText } from "../utils/clipboard";

/** 报修事项详情：用户自报联系进度，不虚构维修方受理 */
export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { notify } = useToast();
  const [ticket, setTicket] = useState<RepairTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState<ProgressStatus>("pending_contact");
  const [contactTarget, setContactTarget] = useState("");
  const [contactedAt, setContactedAt] = useState("");
  const [appointmentAt, setAppointmentAt] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState<CloudRepairRecord[]>([]);
  const [recordId, setRecordId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!Number.isFinite(ticketId)) {
        setError("报修事项编号无效");
        setLoading(false);
        return;
      }
      try {
        const data = await getTicket(ticketId);
        if (!alive) return;
        setTicket(data);
        setProgress(data.progress_status ?? "pending_contact");
        // 联系对象默认填品牌官方售后（平台不代报修，仅便于用户自行联系时登记）
        setContactTarget(
          data.contact_target ??
            (lookupHotline(data.brand) ? `${data.brand}官方售后` : "")
        );
        setContactedAt(data.contacted_at ?? "");
        setAppointmentAt(data.appointment_at ?? "");
        setContactNote(data.contact_note ?? "");
        setRecordId(data.repair_record_id ? String(data.repair_record_id) : "");
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "报修事项读取失败");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [ticketId]);

  useEffect(() => {
    void listCloudRepairs()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  const legacyOnly = useMemo(
    () => ticket != null && ticket.progress_status == null,
    [ticket]
  );

  async function saveProgress() {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await updateTicketProgress(ticket.id, {
        progress_status: progress,
        contact_target: contactTarget.trim() || null,
        contacted_at: contactedAt || null,
        appointment_at: appointmentAt || null,
        contact_note: contactNote.trim() || null,
      });
      setTicket(updated);
      notify("进度已保存（由你本人更新）", "success");
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "进度保存失败，请重试", "error");
    } finally {
      setSaving(false);
    }
  }

  async function linkRecord(nextId: string) {
    if (!ticket) return;
    setLinking(true);
    try {
      const updated = await linkTicketRepairRecord(
        ticket.id,
        nextId ? Number(nextId) : null
      );
      setTicket(updated);
      setRecordId(nextId);
      notify(nextId ? "已关联维修记录" : "已取消关联", "success");
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "关联失败，请重试", "error");
    } finally {
      setLinking(false);
    }
  }

  async function copyContent() {
    if (!ticket) return;
    if (await copyText(ticket.content)) {
      notify("报修话术已复制，可致电官方售后时参考", "success");
    } else {
      notify("复制失败，请手动选择文本复制", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" /> 正在读取报修事项…
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-xl border border-risk-high-border bg-risk-high-bg p-3 text-sm text-risk-high-deep">
          {error || "报修事项不存在"}
        </p>
        <Link to="/records" className="text-brand-700 hover:underline">
          返回维修档案
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/records" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> 返回维修档案
      </Link>
      <PageHeader
        title={`报修事项 #${ticket.id}`}
        subtitle="仅记录你个人的联系与预约进度，不会自动通知维修人员"
      />

      <SectionCard title="报修说明">
        <p className="text-sm font-semibold text-stone-900">{ticket.symptom}</p>
        <p className="mt-1 text-xs text-stone-500">
          {[ticket.brand, ticket.model].filter(Boolean).join(" ") || "未填写品牌型号"}
          {ticket.found_at ? ` · 发现于 ${ticket.found_at}` : ""}
        </p>
        {/* 官方售后电话：平台不代报修，由用户自行拨打 */}
        {(() => {
          const hotline = lookupHotline(ticket.brand);
          if (!hotline) return null;
          return (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
              <p className="text-sm">
                <span className="font-semibold text-stone-800">
                  {hotline.brand}官方售后
                </span>
                <span className="ml-2 text-lg font-bold tracking-wide text-brand-800">
                  {hotline.phone}
                </span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  号码仅供参考，以品牌官方公布为准
                </span>
              </p>
              <a href={`tel:${hotline.phone.replace(/-/g, "")}`}>
                <Button size="sm">
                  <Phone aria-hidden className="h-4 w-4" /> 拨打官方售后
                </Button>
              </a>
            </div>
          );
        })()}
        {legacyOnly && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            旧记录状态：{LEGACY_STATUS_LABELS[ticket.status]}。该状态来自旧版本，
            未经过本轮确认，不代表维修人员实际受理。
          </p>
        )}
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
          {ticket.content}
        </pre>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void copyContent()}>
          <ClipboardCopy className="h-4 w-4" /> 复制报修话术
        </Button>
      </SectionCard>

      {ticket.photo_ids.length > 0 && (
        <SectionCard title={`关联照片（${ticket.photo_ids.length}）`}>
          <div className="flex flex-wrap gap-3">
            {ticket.photo_ids.map((photoId) => (
              <a key={photoId} href={photoUrl(photoId)} target="_blank" rel="noreferrer">
                <img
                  src={photoUrl(photoId)}
                  alt={`报修照片 ${photoId}`}
                  className="h-28 w-28 rounded-lg border border-stone-200 object-cover"
                />
              </a>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="联系与进度（由你更新）">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-stone-700">进度</span>
            <select
              value={progress}
              onChange={(e) => setProgress(e.target.value as ProgressStatus)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              {PROGRESS_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROGRESS_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <InputField
            label="联系对象（选填）"
            placeholder="例如：格力官方售后"
            value={contactTarget}
            onChange={setContactTarget}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-stone-700">联系时间（选填）</span>
            <input
              type="date"
              value={contactedAt}
              onChange={(e) => setContactedAt(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-stone-700">预约时间（选填）</span>
            <input
              type="date"
              value={appointmentAt}
              onChange={(e) => setAppointmentAt(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-stone-700">处理备注（选填）</span>
          <textarea
            value={contactNote}
            onChange={(e) => setContactNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => void saveProgress()} disabled={saving}>
            {saving ? "保存中…" : "保存进度"}
          </Button>
          {ticket.progress_updated_by && (
            <span className="text-xs text-stone-500">最近由 {ticket.progress_updated_by} 更新</span>
          )}
        </div>
        {ticket.progress_history.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-stone-500">
            {ticket.progress_history.slice(-5).map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {h.at} · {PROGRESS_STATUS_LABELS[h.status as ProgressStatus] ?? h.status}
                {h.by ? ` · ${h.by}` : ""}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="关联维修结果">
        <p className="mb-2 text-xs text-stone-500">
          只关联已有维修记录，不复制数据，避免与维修档案重复；删除该维修记录时会自动解除关联。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[240px] flex-1 text-sm">
            <span className="mb-1 block text-stone-700">选择维修记录</span>
            <select
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">未关联</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.device_name || r.fault_description || "维修记录"}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => void linkRecord(recordId)} disabled={linking}>
            {linking ? "处理中…" : recordId ? "关联记录" : "取消关联"}
          </Button>
        </div>
        {records.length === 0 && (
          <p className="mt-2 flex items-center gap-1 text-xs text-stone-400">
            <ImageIcon className="h-3.5 w-3.5" /> 暂无维修记录，可先在维修档案中记录维修结果
          </p>
        )}
      </SectionCard>
    </div>
  );
}

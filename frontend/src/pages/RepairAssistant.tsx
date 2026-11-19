import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, CheckCircle2, ClipboardCopy, Loader2, Send, ShieldAlert, X } from "lucide-react";

import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import InputField from "../components/InputField";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import SourceBadge from "../components/SourceBadge";
import { useToast } from "../components/Toast";
import { useDeviceStore } from "../stores/deviceStore";
import { getDiagnosisById } from "../stores/diagnosisStore";
import { useAuthStore } from "../stores/authStore";
import { useNotificationStore } from "../stores/notifications";
import { useTicketStore } from "../stores/ticketStore";
import { uploadDiagnosisPhoto } from "../services/api";
import { compressImage, fileToDataUrl, validatePhoto } from "../utils/image";
import { formatDate } from "../utils/format";
import { contentFor } from "../utils/diagnosis";
import { usePrefs } from "../stores/prefs";

/** P5 设备类型（报修场景比设备库更宽：含电视/其他） */
const REPAIR_CATEGORIES = [
  { value: "ac", label: "空调" },
  { value: "fridge", label: "冰箱" },
  { value: "washer", label: "洗衣机" },
  { value: "tv", label: "电视" },
  { value: "other", label: "其他" },
] as const;

const SYMPTOMS = ["无法启动", "运行中异常", "漏水", "噪音过大", "其他问题"];

const CHECK_OPTIONS = [
  "已检查电源是否正常",
  "已清理过滤网或排水口",
  "已重启设备",
];

const PRO_ADVICE = "建议联系官方售后进行专业检测，避免自行拆机导致更大损坏。";
const CAUTIONS = ["维修前请断开电源", "避免在潮湿环境下使用设备"];

interface FormState {
  deviceId: number | null;
  category: string;
  brand: string;
  model: string;
  symptom: string;
  description: string;
  foundAt: string;
  checks: string[];
  customCheck: string;
}

const EMPTY: FormState = {
  deviceId: null,
  category: "",
  brand: "",
  model: "",
  symptom: "",
  description: "",
  foundAt: "",
  checks: [],
  customCheck: "",
};

/** P5 智能报修助手：左表单 / 右预览，生成结构化报修说明 */
export default function RepairAssistant() {
  const { notify } = useToast();
  const { mode } = usePrefs();
  const elder = mode === "elder";
  const [params] = useSearchParams();

  const { devices, load } = useDeviceStore();
  const diagnosisId = params.get("diagnosisId");
  const diagnosis = useMemo(
    () => (diagnosisId ? getDiagnosisById(diagnosisId) : undefined),
    [diagnosisId]
  );
  const linkedContent = diagnosis
    ? contentFor(diagnosis, elder ? "elder" : "standard").content
    : null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [generated, setGenerated] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** elder 模式分两步填写 */
  const [wizardStep, setWizardStep] = useState(0);
  /** 本次会话已保存的报修事项 ID（仅服务端确认成功后才有值） */
  const [submittedTicketId, setSubmittedTicketId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 幂等标识：超时重试沿用同一个，服务端会返回同一条而不是重复创建 */
  const clientRef = useRef(
    `ticket-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const authStatus = useAuthStore((s) => s.status);

  const tickets = useTicketStore((s) => s.tickets);
  const loadTickets = useTicketStore((s) => s.load);
  const addNotification = useNotificationStore((s) => s.add);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (authStatus === "authenticated") void loadTickets(1);
  }, [authStatus, loadTickets]);

  // 未登录时离开页面去登录：保留文字表单，回来后仍能继续提交
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fixitai-repair-draft");
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<FormState>;
      setForm((f) => ({ ...f, ...saved }));
      sessionStorage.removeItem("fixitai-repair-draft");
    } catch {
      /* 忽略损坏草稿 */
    }
  }, []);

  const submittedTicket = useMemo(
    () =>
      submittedTicketId != null
        ? tickets.find((t) => t.id === submittedTicketId) ?? null
        : null,
    [tickets, submittedTicketId]
  );

  /** 从诊断结果带入（P3 → P5） */
  useEffect(() => {
    if (!diagnosis) return;
    const categoryMap: Record<string, string> = {
      ac: "ac",
      fridge: "fridge",
      washer: "washer",
      other: "other",
    };
    setForm((f) => ({
      ...f,
      deviceId: diagnosis.deviceId,
      category: categoryMap[diagnosis.category ?? "other"] ?? "other",
      brand: "",
      model: "",
      symptom: diagnosis.symptom || "其他问题",
      description: diagnosis.description,
      foundAt: formatDate(diagnosis.createdAt),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function toggleCheck(c: string) {
    setForm((f) => ({
      ...f,
      checks: f.checks.includes(c)
        ? f.checks.filter((x) => x !== c)
        : [...f.checks, c],
    }));
  }

  function onPickDevice(id: string) {
    if (!id) {
      patch({ deviceId: null });
      return;
    }
    const d = devices.find((x) => x.id === Number(id));
    if (!d) return;
    const catMap: Record<string, string> = { ac: "ac", fridge: "fridge", washer: "washer" };
    patch({
      deviceId: d.id,
      category: catMap[d.category] ?? "other",
      brand: d.brand ?? "",
      model: d.model ?? "",
    });
  }

  /** 基于表单组装结构化文本（不凭空增加故障事实） */
  function generate() {
    if (!form.category) return notify("请先选择设备类型", "error");
    if (!form.symptom) return notify("请先选择故障现象", "error");
    const catLabel = REPAIR_CATEGORIES.find((c) => c.value === form.category)?.label ?? "";
    const checks = [...form.checks];
    if (form.customCheck.trim()) checks.push(form.customCheck.trim());
    const lines = [
      "【报修说明】",
      `设备类型：${catLabel}${form.brand || form.model ? `（${[form.brand, form.model].filter(Boolean).join(" ")}）` : ""}`,
      `故障现象：${form.symptom}`,
      form.description.trim() ? `故障描述：${form.description.trim()}` : "",
      form.foundAt ? `发现时间：${form.foundAt}` : "",
      checks.length > 0 ? `已完成的检查：${checks.join("；")}` : "",
      diagnosis && linkedContent
        ? `关联诊断结论：${linkedContent.conclusion}`
        : "",
      diagnosis
        ? `诊断内容来源：${
            diagnosis.source === "ai"
              ? `真实 AI${diagnosis.model ? `（${diagnosis.model}）` : ""}`
              : diagnosis.source === "template"
                ? "本地模板演示（非 AI）"
                : "来源未记录"
          }`
        : "",
      "",
      `专业建议：${PRO_ADVICE}`,
      `注意事项：${CAUTIONS.join("；")}。`,
    ].filter((l) => l !== "");
    setGenerated(lines.join("\n"));
    setEditing(null);
    notify("报修说明已生成，可在右侧编辑", "success");
  }

  async function copy() {
    const text = editing ?? generated;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify("报修内容已复制到剪贴板", "success");
    } catch {
      notify("复制失败，请手动选择文本复制", "error");
    }
  }

  async function handlePhoto(file: File | null | undefined) {
    if (!file) return;
    const err = validatePhoto(file);
    if (err) {
      notify(err, "error");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const compressed = await compressImage(file);
      setPhotoPreview(await fileToDataUrl(compressed));
      try {
        const uploaded = await uploadDiagnosisPhoto(compressed);
        setPhotoId(uploaded.id);
        notify("照片已上传，保存报修事项后会一并关联", "success");
      } catch {
        // 上传失败不能显示“已上传”：保留预览，但明确标记未保存
        setPhotoId(null);
        setPhotoError("照片未上传成功，保存时不会包含这张照片；可重试或先保存文字说明");
        notify("照片未上传成功", "error");
      }
    } catch {
      setPhotoPreview(null);
      setPhotoId(null);
      notify("图片处理失败，请换一张试试", "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    setPhotoPreview(null);
    setPhotoId(null);
    setPhotoError(null);
  }

  function keepFormForLogin() {
    try {
      sessionStorage.setItem("fixitai-repair-draft", JSON.stringify(form));
    } catch {
      /* 隐私模式不可写时仅保留当前页面状态 */
    }
  }

  /** 保存报修事项：只有服务端确认成功才显示“已保存”；失败不创建本地工单 */
  async function submitTicket() {
    const content = editing ?? generated;
    if (!content) return;
    if (!form.category || !form.symptom) {
      setSubmitError("请先选择设备类型和故障现象");
      notify("请先选择设备类型和故障现象", "error");
      return;
    }
    if (submitting) return;
    const checks = [...form.checks];
    if (form.customCheck.trim()) checks.push(form.customCheck.trim());

    setSubmitting(true);
    setSubmitError(null);
    const result = await useTicketStore.getState().submit({
      client_ref: clientRef.current,
      category: form.category,
      symptom: form.symptom,
      description: form.description.trim() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      found_at: form.foundAt || null,
      checks,
      content,
      device_id: form.deviceId,
      diagnosis_ref: diagnosis?.id ?? null,
      photo_ids: photoId != null ? [photoId] : [],
    });
    setSubmitting(false);

    if (result.ok) {
      setSubmittedTicketId(result.ticket.id);
      setSubmitError(null);
      // 同一内容再次保存视为新事项：换一个幂等标识
      clientRef.current = `ticket-${
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()
      }`;
      addNotification({
        type: "ticket",
        title: "报修事项已保存",
        body: `${form.symptom} · 待联系。仅记录在你的账号中，不会自动通知维修人员。`,
      });
      notify(
        elder
          ? "报修事项已保存好啦，可以点开查看详情"
          : "报修事项已保存，可打开详情记录联系进度",
        "success"
      );
      return;
    }

    if (result.kind === "unauthenticated" || result.kind === "session_expired") {
      keepFormForLogin();
    }
    setSubmitError(result.message);
    notify(result.message, "error");
  }

  const step1Valid = form.category !== "" && form.symptom !== "";
  const checks = [...form.checks];
  if (form.customCheck.trim()) checks.push(form.customCheck.trim());

  /* ---------- 左侧表单（elder 模式分两步） ---------- */
  const basicFields = (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">选择已添加的设备（可选）</span>
        <select
          value={form.deviceId ?? ""}
          onChange={(e) => onPickDevice(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">手动填写</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}（{d.brand ?? ""} {d.model ?? ""}）
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">
          设备类型 <span className="text-risk-high">*</span>
        </span>
        <select
          value={form.category}
          onChange={(e) => patch({ category: e.target.value })}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">请选择</option>
          {REPAIR_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <InputField label="品牌" placeholder="格力" value={form.brand} onChange={(v) => patch({ brand: v })} />
        <InputField label="型号" placeholder="KFR-35GW" value={form.model} onChange={(v) => patch({ model: v })} />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">
          故障现象 <span className="text-risk-high">*</span>
        </span>
        <select
          value={form.symptom}
          onChange={(e) => patch({ symptom: e.target.value })}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">请选择</option>
          {SYMPTOMS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  const detailFields = (
    <>
      <InputField
        label="故障描述"
        mode="textarea"
        rows={3}
        maxLength={500}
        placeholder="补充故障发生的时间、频率、表现等"
        value={form.description}
        onChange={(v) => patch({ description: v })}
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">发现时间</span>
        <input
          type="date"
          value={form.foundAt}
          onChange={(e) => patch({ foundAt: e.target.value })}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-stone-700">已完成的检查（多选）</legend>
        <div className="space-y-2">
          {CHECK_OPTIONS.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={form.checks.includes(c)}
                onChange={() => toggleCheck(c)}
                className="h-4 w-4 accent-brand-600"
              />
              {c}
            </label>
          ))}
          <InputField
            placeholder="自定义补充（选填）"
            value={form.customCheck}
            onChange={(v) => patch({ customCheck: v })}
          />
        </div>
      </fieldset>

      <div className="rounded-xl border border-stone-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="repair-photo" className="text-sm font-medium text-stone-700">
            故障照片（可选）
          </label>
          {photoPreview && (
            <button
              type="button"
              onClick={removePhoto}
              aria-label="移除照片"
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <X className="h-3.5 w-3.5" /> 移除
            </button>
          )}
        </div>
        <input
          id="repair-photo"
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => void handlePhoto(e.target.files?.[0])}
        />
        {!photoPreview ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
          >
            {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {photoBusy ? "正在上传…" : "拍照或选择图片"}
          </Button>
        ) : (
          <div className="mt-2 space-y-2">
            <img
              src={photoPreview}
              alt="报修照片预览"
              className="max-h-40 rounded-lg border border-stone-200 object-contain"
            />
            <p className={photoId != null ? "text-xs text-risk-low" : "text-xs text-amber-700"}>
              {photoId != null
                ? "照片已上传，保存报修事项后会关联到该事项"
                : photoBusy
                  ? "正在上传照片…"
                  : "照片仅本地预览，尚未保存"}
            </p>
            {photoError && <p className="text-xs text-risk-high">{photoError}</p>}
          </div>
        )}
        <p className="mt-2 text-xs text-stone-400">
          照片保存在服务端数据库，重新部署后仍可查看；仅当前账号可读取。
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="智能报修助手"
        subtitle="整理故障信息，生成专业报修说明，帮助您更高效地联系维修服务"
      />

      {/* 顶部安全提示条 */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-2xl border border-risk-medium-border bg-risk-medium-bg p-4 text-sm text-risk-medium-deep"
      >
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-risk-medium" />
        <p>
          如出现冒烟、焦糊气味或疑似漏电，请<span className="font-bold">立即停止使用并断电</span>
          ，直接联系专业人员，不要继续操作设备。
        </p>
      </div>

      {diagnosis && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          <span>
            已带入诊断结果（{diagnosis.symptom}），可在表单中继续补充。
          </span>
          <SourceBadge source={diagnosis.source} model={diagnosis.model} />
          {diagnosis.source === "template" && (
            <span className="text-xs text-amber-800">模板演示内容不是真实 AI 诊断。</span>
          )}
          {diagnosis.source === "unknown" && (
            <span className="text-xs text-slate-600">旧记录来源未记录，不作推断。</span>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- 左：表单 ---------- */}
        <SectionCard
          title={elder ? (wizardStep === 0 ? "第一步：请填写设备信息" : "第二步：请描述故障情况") : "报修信息"}
        >
          <div className="space-y-4">
            {elder ? (
              <>
                {wizardStep === 0 ? basicFields : detailFields}
                {wizardStep === 0 ? (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => (step1Valid ? setWizardStep(1) : notify("请先选择设备类型和故障现象", "error"))}
                  >
                    填好了，下一步
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="lg" onClick={() => setWizardStep(0)}>
                      上一步
                    </Button>
                    <Button size="lg" className="flex-1" onClick={generate}>
                      生成报修说明
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {basicFields}
                {detailFields}
                <Button onClick={generate} className="w-full">
                  生成报修说明
                </Button>
              </>
            )}
          </div>
        </SectionCard>

        {/* ---------- 右：预览 ---------- */}
        <SectionCard
          title="报修说明预览"
          action={
            generated && (
              <button
                type="button"
                onClick={() => setEditing(editing ?? generated)}
                className="text-xs text-brand-700 hover:underline"
              >
                编辑
              </button>
            )
          }
        >
          {!generated ? (
            <EmptyState
              icon="📝"
              title="尚未生成"
              description="填写左侧表单并点击「生成报修说明」，此处会展示可复制的结构化内容。"
            />
          ) : editing != null ? (
            <div className="space-y-3">
              <InputField
                mode="textarea"
                rows={12}
                value={editing}
                onChange={setEditing}
                description="可直接修改生成内容"
              />
              <Button onClick={() => { setGenerated(editing); setEditing(null); notify("修改已保存", "success"); }}>
                保存修改
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <pre className="whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
                {generated}
              </pre>

              <div className="rounded-xl border border-stone-200 p-3">
                <p className="text-sm font-semibold text-stone-800">专业建议</p>
                <p className="mt-1 text-sm text-stone-600">{PRO_ADVICE}</p>
                <p className="mt-2 text-sm font-semibold text-stone-800">注意事项</p>
                <ul className="mt-1 space-y-1">
                  {CAUTIONS.map((c) => (
                    <li key={c} className="flex items-center gap-1.5 text-sm text-stone-600">
                      <CheckCircle2 aria-hidden className="h-4 w-4 text-risk-low" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {submittedTicket && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <p className="text-sm font-semibold text-stone-800">
                    报修事项已保存
                  </p>
                  <p className="mt-1 text-xs text-stone-600">
                    编号 #{submittedTicket.id} · 当前进度：
                    {" "}
                    {submittedTicket.progress_status === "pending_contact"
                      ? "待联系"
                      : submittedTicket.progress_status === "contacted"
                        ? "已联系"
                        : submittedTicket.progress_status === "scheduled"
                          ? "已预约"
                          : submittedTicket.progress_status === "completed"
                            ? "已完成"
                            : submittedTicket.progress_status === "canceled"
                              ? "已取消"
                              : "旧状态"}
                    。仅记录在你的账号中，不会自动通知维修人员。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to={`/tickets/${submittedTicket.id}`}>
                      <Button size="sm">打开事项详情</Button>
                    </Link>
                    <Link to="/records">
                      <Button variant="secondary" size="sm">去维修档案</Button>
                    </Link>
                  </div>
                </div>
              )}

              {submitError && (
                <div role="alert" className="rounded-xl border border-risk-high-border bg-risk-high-bg p-3 text-sm text-risk-high-deep">
                  <p>{submitError}</p>
                  {authStatus !== "authenticated" ? (
                    <Link to="/login" className="mt-2 inline-block font-semibold underline">
                      去登录（表单内容已暂存在本机，登录后返回本页继续提交）
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => void submitTicket()}
                      disabled={submitting}
                    >
                      {submitting ? "重试中…" : "重试提交"}
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copy}>
                  <ClipboardCopy className="h-4 w-4" /> 复制报修说明（自行发给售后）
                </Button>
                <Button onClick={() => void submitTicket()} disabled={submitting || photoBusy}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting ? "保存中…" : elder ? "保存报修事项" : "保存报修事项"}
                </Button>
              </div>
              <p className="text-xs text-stone-400">
                这里只保存你个人的报修跟踪，不会自动通知维修人员。你可复制说明自行联系售后，
                并在详情里记录联系对象、联系时间、预约时间和处理备注。
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

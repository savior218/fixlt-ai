import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardCopy, ImagePlus, Loader2, Send, ShieldAlert, X } from "lucide-react";

import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import InputField from "../components/InputField";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import TicketTracker from "../components/TicketTracker";
import SourceBadge from "../components/SourceBadge";
import { useToast } from "../components/Toast";
import { useDeviceStore } from "../stores/deviceStore";
import { getDiagnosisById } from "../stores/diagnosisStore";
import { useNotificationStore } from "../stores/notifications";
import { useTicketStore } from "../stores/ticketStore";
import { formatDate } from "../utils/format";
import { contentFor } from "../utils/diagnosis";
import { usePrefs } from "../stores/prefs";
import { uploadDiagnosisPhoto } from "../services/api";
import { compressImage, fileToDataUrl, validatePhoto } from "../utils/image";

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
  /** 本次会话已提交的工单 ID（null = 未提交 / 降级为复制说明） */
  const [submittedTicketId, setSubmittedTicketId] = useState<number | null>(null);

  /* ---------- 故障照片上传（与诊断页同能力：压缩 → 预览 → 后端入库） ---------- */
  const [photo, setPhoto] = useState<{ preview: string; id: number | null } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoDragOver, setPhotoDragOver] = useState(false);

  async function handlePhotoFile(file: File) {
    const err = validatePhoto(file);
    if (err) return notify(err, "error");
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const preview = await fileToDataUrl(compressed);
      try {
        const res = await uploadDiagnosisPhoto(compressed);
        setPhoto({ preview, id: res.id });
        notify("照片已上传，编号将写入报修说明", "success");
      } catch {
        // 后端不可用 / 未登录：仅本地预览
        setPhoto({ preview, id: null });
        notify("AI 服务不可用，照片仅本地预览", "info");
      }
    } catch {
      notify("图片处理失败，请换一张试试", "error");
    } finally {
      setPhotoUploading(false);
    }
  }

  const { tickets, syncFromBackend } = useTicketStore();
  const addNotification = useNotificationStore((s) => s.add);

  useEffect(() => {
    void load();
    void syncFromBackend();
  }, [load, syncFromBackend]);

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
      photo ? `故障照片：已附 1 张${photo.id != null ? `（上传编号 #${photo.id}）` : "（本地保存）"}` : "",
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

  /** 一键提交报修（模块②）：优先后端工单入库；后端不可用时降级为复制报修说明 */
  async function submitTicket() {
    const content = editing ?? generated;
    if (!content) return;
    if (!form.category || !form.symptom) {
      notify("请先选择设备类型和故障现象", "error");
      return;
    }
    const checks = [...form.checks];
    if (form.customCheck.trim()) checks.push(form.customCheck.trim());

    const backendOk = await useTicketStore.getState().submit({
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
    });

    if (backendOk) {
      const id = useTicketStore.getState().tickets[0]?.id ?? null;
      setSubmittedTicketId(id);
      addNotification({
        type: "ticket",
        title: "报修工单已提交",
        body: `${form.symptom} · 工单已进入「待受理」状态，进度可在维修档案查看。`,
      });
      notify(
        elder
          ? "报修已提交好啦！进度可以到「维修档案」里查看"
          : "报修工单已提交，可在维修档案查看状态进度",
        "success"
      );
    } else {
      // 降级：未登录 / 离线 → 保留原有复制说明行为
      setSubmittedTicketId(null);
      try {
        await navigator.clipboard.writeText(content);
        notify("当前为离线演示模式：报修说明已复制，可手动联系售后", "info");
      } catch {
        notify("当前为离线演示模式，请手动复制报修说明", "info");
      }
    }
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

      {/* 上传照片：点击/拖拽上传 + 压缩预览 + 后端入库（失败降级本地） */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-stone-700">故障照片（可选）</legend>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          aria-label="选择故障照片"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handlePhotoFile(f);
            e.target.value = ""; // 允许重复选择同一文件
          }}
        />
        {photo ? (
          <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-3">
            <img
              src={photo.preview}
              alt="故障照片预览"
              className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-700">
                {photo.id != null ? "照片已上传 ✓" : "照片仅本地预览"}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {photo.id != null ? "上传编号会写入报修说明，方便师傅查看" : "未连接服务器：照片不会随工单保存"}
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                  重新选择
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                  <X className="h-3.5 w-3.5" /> 移除
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-label="上传故障照片"
            onClick={() => photoInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setPhotoDragOver(true);
            }}
            onDragLeave={() => setPhotoDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setPhotoDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handlePhotoFile(f);
            }}
            className={[
              "flex w-full flex-col items-center rounded-xl border border-dashed p-4 text-center transition-colors",
              photoDragOver ? "border-brand-500 bg-brand-50" : "border-stone-300 hover:border-brand-400",
            ].join(" ")}
          >
            {photoUploading ? (
              <>
                <Loader2 aria-hidden className="h-6 w-6 animate-spin text-brand-600" />
                <span className="mt-1.5 text-sm text-stone-600">照片处理中…</span>
              </>
            ) : (
              <>
                <ImagePlus aria-hidden className="h-6 w-6 text-stone-400" />
                <span className="mt-1.5 text-sm text-stone-600">
                  {elder ? "点这里，拍一张或选一张故障照片" : "点击上传或拖拽图片到此处"}
                </span>
                <span className="mt-0.5 text-xs text-stone-400">支持 JPG、PNG，不超过 10MB</span>
              </>
            )}
          </button>
        )}
        <p className="mt-2 text-xs leading-relaxed text-stone-400">
          照片会随报修说明上传，仅用于故障判断与工单展示，不会用于广告投放或模型训练。详见
          <Link to="/privacy" className="text-brand-700 underline underline-offset-2 hover:text-brand-800">
            《隐私政策》
          </Link>
          。
        </p>
      </fieldset>
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

              {/* 已提交工单的状态跟踪条（模块②） */}
              {submittedTicket && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <p className="mb-2 flex items-center justify-between text-sm font-semibold text-stone-800">
                    工单状态跟踪
                    <span className="text-xs font-normal text-stone-400">
                      #{submittedTicket.id}
                    </span>
                  </p>
                  <TicketTracker status={submittedTicket.status} compact />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={copy}>
                  <ClipboardCopy className="h-4 w-4" /> 复制报修内容
                </Button>
                <Button onClick={submitTicket}>
                  <Send className="h-4 w-4" /> {elder ? "一键提交报修" : "一键提交报修"}
                </Button>
              </div>
              <p className="text-xs text-stone-400">
                提交后工单将进入「待受理」状态，进度可在
                <a href="#/records" className="text-brand-700 hover:underline">维修档案</a>
                跟踪；离线或未登录时自动降级为复制报修说明。
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

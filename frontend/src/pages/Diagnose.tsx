import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AirVent,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Lightbulb,
  Loader2,
  Mic,
  PhoneCall,
  Refrigerator,
  RotateCcw,
  ShieldAlert,
  Square,
  Undo2,
  Wrench,
  WashingMachine,
  ArrowLeft,
  X,
} from "lucide-react";

import Button from "../components/Button";
import DeviceCard from "../components/DeviceCard";
import DiagnosisStepper from "../components/DiagnosisStepper";
import InputField from "../components/InputField";
import AIMessageBubble from "../components/AIMessageBubble";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import { useToast } from "../components/Toast";
import { CATEGORY_LABELS } from "../services/api";
import { uploadDiagnosisPhoto } from "../services/api";
import type { DiagnoseCategory } from "../services/diagnosisService";
import {
  SYMPTOM_OPTIONS,
  nextTurn,
  generateDiagnosis,
} from "../services/diagnosisService";
import type { Diagnosis } from "../types/diagnosis";
import { withMeta } from "../services/deviceService";
import { useDeviceStore } from "../stores/deviceStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useNotificationStore } from "../stores/notifications";
import { useRepairStore } from "../stores/repairStore";
import { usePrefs } from "../stores/prefs";
import { speak } from "../utils/speech";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
  compressImage,
  fileToDataUrl,
  validatePhoto,
} from "../utils/image";

/** 设备类型卡片（P1 步骤一） */
const CATEGORY_CARDS: { key: DiagnoseCategory; icon: typeof AirVent; title: string; hint: string }[] = [
  { key: "ac", icon: AirVent, title: "空调", hint: "制冷 / 制热异常、漏水" },
  { key: "fridge", icon: Refrigerator, title: "冰箱", hint: "不制冷、噪音大" },
  { key: "washer", icon: WashingMachine, title: "洗衣机", hint: "无法启动、漏水" },
  { key: "other", icon: Wrench, title: "其他家电", hint: "手动选择并描述" },
];

/** elder 模式分步引导文案 */
const ELDER_GUIDES = [
  "第一步，选择您要检查的设备",
  "第二步，描述遇到的问题",
  "第三步，回答 AI 的几个小问题",
  "完成",
];

/** P1 AI 诊断交互（四步流程：选择设备 → 描述故障 → AI 问诊 → 查看结果） */
export default function Diagnose() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [params] = useSearchParams();
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const { devices, load } = useDeviceStore();
  const repairRecords = useRepairStore((s) => s.records);
  const { draft, setDraft, appendMessage, saveDiagnosis, resetDraft } =
    useDiagnosisStore();

  const [customSymptom, setCustomSymptom] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ---------- 语音输入（Web Speech Recognition） ---------- */
  const voiceRec = useSpeechRecognition("zh-CN");
  const heardText = voiceRec.finalText + voiceRec.interimText;

  /** 识别出最终文字：追加进输入框 */
  useEffect(() => {
    if (voiceRec.finalText) {
      setInput((prev) => (prev ? `${prev}${voiceRec.finalText}` : voiceRec.finalText));
      voiceRec.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRec.finalText]);

  /** 识别出错提示 */
  useEffect(() => {
    if (voiceRec.error) notify(voiceRec.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRec.error]);

  function toggleVoiceInput() {
    if (!voiceRec.supported) {
      notify("当前浏览器不支持语音输入，请使用 Chrome 或 Edge 浏览器", "error");
      return;
    }
    if (voiceRec.listening) {
      voiceRec.stop();
    } else {
      voiceRec.start();
    }
  }

  /* ---------- 模块③：故障照片上传 ---------- */
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addNotification = useNotificationStore((s) => s.add);

  /** 校验 → 压缩 → 本地预览 → 优先后端入库；后端不可用时仅本地预览（Mock 模式） */
  async function handlePhotoFile(file: File) {
    const err = validatePhoto(file);
    if (err) return notify(err, "error");

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const preview = await fileToDataUrl(compressed);
      try {
        const res = await uploadDiagnosisPhoto(compressed);
        setDraft({ photoId: res.id, photoPreview: preview });
        notify("照片已上传，AI 看图诊断将结合照片分析", "success");
      } catch {
        // 后端不可用 / 未登录：仅本地预览，不参与 AI 看图
        setDraft({ photoId: null, photoPreview: preview });
        notify("AI 服务不可用，照片仅在本地预览，不参与诊断", "info");
      }
    } catch {
      notify("图片处理失败，请换一张试试", "error");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto() {
    setDraft({ photoId: null, photoPreview: null });
  }

  useEffect(() => {
    void load();
  }, [load]);

  /** URL 预选：?deviceId= 或 ?category=（首页快速入口 / P7 跳转） */
  useEffect(() => {
    const deviceId = params.get("deviceId");
    const category = params.get("category");
    if (deviceId) {
      void load().then(() => {
        const d = useDeviceStore.getState().devices.find((x) => x.id === Number(deviceId));
        if (d) {
          setDraft({
            deviceId: d.id,
            deviceName: d.name,
            category: d.category,
            step: 1,
          });
        }
      });
    } else if (category) {
      setDraft({ category: category as DiagnoseCategory, step: 1 });
    }
    // 仅在首次挂载消费 URL 参数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === draft.deviceId) ?? null,
    [devices, draft.deviceId]
  );

  const interception = draft.riskInterception;

  /* ---------- 步骤流转 ---------- */

  function pickCategory(key: DiagnoseCategory) {
    setDraft({ category: key, step: 1 });
  }

  function pickExistingDevice(id: number) {
    const d = devices.find((x) => x.id === id);
    if (!d) return;
    setDraft({
      deviceId: d.id,
      deviceName: d.name,
      category: d.category,
      step: 1,
    });
  }

  function pickSymptom(symptom: string) {
    setDraft({ symptom, step: 2 });
    startConsult(symptom);
  }

  function submitCustomSymptom() {
    if (draft.description.trim().length < 5) {
      notify("请再描述详细一点（至少 5 个字）", "error");
      return;
    }
    setDraft({ symptom: null, step: 2 });
    startConsult(null);
  }

  /** 进入问诊：发送首个 AI 问题 */
  function startConsult(symptom: string | null) {
    const ctx = makeCtx(symptom);
    const tone = elder ? "elder" : "standard";
    const turn = nextTurn(ctx, tone);

    appendMessage({
      role: "ai",
      content: elder
        ? "好的，我了解了。接下来我问您两个小问题，您点下面的按钮回答就行。"
        : "收到，为了更准确地判断，我需要再确认几个问题。",
    });

    if (turn.kind === "question") {
      appendMessage({ role: "ai", content: turn.text, suggestions: turn.suggestions });
    } else if (turn.kind === "interception") {
      setDraft({ riskInterception: turn.interception });
      // 通知中心（模块⑤）：高风险告警
      addNotification({
        type: "risk",
        title: `高风险告警 · ${turn.interception.title}`,
        body: turn.interception.description,
      });
    } else {
      // 问诊信息已齐（防御分支）：异步生成真实 AI 结果
      void generateDiagnosis(ctx, tone).then((diagnosis) => {
        finishDiagnosis(diagnosis);
      });
    }
  }

  function makeCtx(symptomOverride?: string | null) {
    return {
      category: draft.category,
      symptom:
        symptomOverride !== undefined
          ? symptomOverride
          : draft.symptom,
      description: draft.description,
      answers: draft.answers,
      device: selectedDevice,
      photoId: draft.photoId,
    };
  }

  /** 用户回答（点选建议 / 自由输入）；返回是否实际发送（用于决定是否清空输入框） */
  function sendAnswer(text: string): boolean {
    if (thinking || !text.trim()) return false;
    const answer = text.trim();
    const newAnswers = [...draft.answers, answer];

    appendMessage({ role: "user", content: answer });
    setThinking(true);

    const ctx = {
      category: draft.category,
      symptom: draft.symptom,
      description: draft.description,
      answers: newAnswers,
      device: selectedDevice,
      photoId: draft.photoId,
    };
    const tone = elder ? "elder" : "standard";
    const turn = nextTurn(ctx, tone);

    // 问诊完成：异步生成真实 AI 结果（后端不可用时自动回退 Mock）
    if (turn.kind === "result") {
      setDraft({ answers: newAnswers });
      void generateDiagnosis(ctx, tone).then((diagnosis) => {
        setThinking(false);
        finishDiagnosis(diagnosis);
      });
      return true;
    }

    // 问下一题 / 高风险拦截：保留短暂思考延迟
    window.setTimeout(() => {
      if (turn.kind === "question") {
        setDraft({ answers: newAnswers });
        appendMessage({ role: "ai", content: turn.text, suggestions: turn.suggestions });
      } else if (turn.kind === "interception") {
        setDraft({ answers: newAnswers, riskInterception: turn.interception });
        // 通知中心（模块⑤）：高风险告警
        addNotification({
          type: "risk",
          title: `高风险告警 · ${turn.interception.title}`,
          body: turn.interception.description,
        });
      }
      setThinking(false);
    }, 500);
    return true;
  }

  /** 问诊完成：保存并跳转 P2 */
  function finishDiagnosis(diagnosis: Diagnosis) {
    appendMessage({
      role: "ai",
      content: elder
        ? "问好了！我已经整理好诊断结果，这就带您去看。"
        : "诊断完成，已为您生成详细的维修建议。",
    });
    // 通知中心（模块⑤）：诊断完成
    addNotification({
      type: "diagnosis",
      title: "诊断完成",
      body: `${diagnosis.symptom || "自定义故障"}：${diagnosis.conclusion.slice(0, 50)}`,
    });
    saveDiagnosis(diagnosis);
    setDraft({ step: 3 });
    navigate(`/diagnosis/${diagnosis.id}/result`);
  }

  /** 关闭拦截，返回第一步安全重述（清空描述，避免旧文本再次触发拦截） */
  function dismissInterception() {
    setDraft({
      riskInterception: null,
      answers: [],
      description: "",
      step: 1,
    });
    notify("已返回描述步骤，请调整描述后重新开始", "info");
  }

  // 对话区自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [draft.chat.length, thinking]);

  /* ---------- 模块④：自动朗读新 AI 消息（需开启语音朗读 + 自动朗读） ---------- */
  const autoRead = usePrefs((s) => s.autoRead);
  const voiceEnabled = usePrefs((s) => s.voiceEnabled);
  const speechRate = usePrefs((s) => s.speechRate);
  const voiceURI = usePrefs((s) => s.voiceURI);
  /** 最近一次诊断（第 4 步闭环卡展示用） */
  const lastDiagnosis = useDiagnosisStore((s) => s.history[0]);
  const lastChatMsgId = draft.chat[draft.chat.length - 1]?.id;
  const lastChatAiContent = useMemo(() => {
    const last = draft.chat[draft.chat.length - 1];
    return last && last.role === "ai" ? last.content : null;
  }, [draft.chat]);
  useEffect(() => {
    if (autoRead && voiceEnabled && lastChatAiContent) {
      speak(lastChatAiContent, { rate: speechRate, voiceURI });
    }
    // 仅在最后一条消息变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChatMsgId]);

  const symptoms = draft.category ? SYMPTOM_OPTIONS[draft.category] : [];

  /* ================= 高风险安全拦截（4.4 结构，等级不随模式变化） ================= */
  if (interception) {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="rounded-2xl border-2 border-risk-high bg-risk-high-bg p-6"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert aria-hidden className="h-8 w-8 text-risk-high" />
            <h1 className="text-xl font-bold text-risk-high-deep">
              △ 高风险 · {interception.title}
            </h1>
          </div>
          <p className={`mt-3 text-risk-high-deep ${elder ? "text-lg leading-relaxed" : "text-sm leading-relaxed"}`}>
            {interception.description}
          </p>
          {interception.matched.length > 0 && (
            <p className="mt-1 text-xs text-risk-high-deep/70">
              触发关键词：{interception.matched.join("、")}
            </p>
          )}
        </div>

        <SectionCard title="立即采取的行动">
          <div className="grid gap-3 sm:grid-cols-3">
            {interception.immediateActions.map((a) => (
              <div key={a.title} className="rounded-xl border border-risk-high-border bg-risk-high-bg/50 p-3">
                <p className={`font-bold text-risk-high-deep ${elder ? "text-base" : "text-sm"}`}>{a.title}</p>
                <p className="mt-1 text-sm text-risk-high-deep/80">{a.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="禁止操作">
          <ul className="space-y-2">
            {interception.forbiddenActions.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm font-medium text-risk-high-deep">
                <span aria-hidden className="text-risk-high">✕</span>
                {f}
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="lg" onClick={() => navigate("/repair")}>
            <PhoneCall className="h-4 w-4" /> 一键联系维修
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              const last = useDiagnosisStore.getState().history[0];
              if (last) navigate(`/diagnosis/${last.id}/report`);
              else notify("暂无历史诊断报告", "info");
            }}
          >
            返回诊断报告
          </Button>
          <Button variant="ghost" size="lg" onClick={dismissInterception}>
            <Undo2 className="h-4 w-4" /> 我已了解，暂不处理
          </Button>
        </div>
      </div>
    );
  }

  /* ================= 正常四步流程 ================= */
  return (
    <div className="space-y-5">
      <div className="card-base p-4">
        <DiagnosisStepper current={draft.step} />
      </div>

      {elder && draft.step < 3 && (
        <p className="rounded-xl bg-tip-bg px-4 py-2.5 text-base font-medium text-tip-text">
          👉 {ELDER_GUIDES[draft.step]}
        </p>
      )}

      {/* ---------- 步骤 0：选择设备 ---------- */}
      {draft.step === 0 && (
        <>
          <SectionCard title={elder ? "您要检查哪台设备？点下面的卡片" : "选择设备类型"}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {CATEGORY_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => pickCategory(c.key)}
                    className="flex items-start gap-3 rounded-xl border border-stone-200 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50"
                  >
                    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className={`block font-semibold text-stone-900 ${elder ? "text-lg" : "text-base"}`}>{c.title}</span>
                      <span className="mt-0.5 block text-xs text-stone-500">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="已有设备"
            action={
              draft.chat.length > 0 || draft.step > 0 ? (
                <button type="button" onClick={resetDraft} className="text-xs text-brand-700 hover:underline">
                  重新开始
                </button>
              ) : undefined
            }
          >
            {devices.length === 0 ? (
              <p className="text-sm text-stone-500">
                暂无已添加设备。可直接在上方选择类型继续，或先到
                <a href="#/devices" className="text-brand-700 hover:underline">我的设备</a>
                添加。
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {devices.map((d) => (
                  <div key={d.id} className="space-y-2">
                    <DeviceCard
                      device={d}
                      status={withMeta(d, repairRecords).status}
                      repairCount={withMeta(d, repairRecords).repairCount}
                      onClick={() => pickExistingDevice(d.id)}
                    />
                    <p className="text-center text-xs text-stone-400">点击选择此设备</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* ---------- 步骤 1：描述故障 ---------- */}
      {draft.step === 1 && (
        <>
          {/* 已选设备信息卡 */}
          {(selectedDevice || draft.category) && (
            <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  {(() => {
                    const Icon = CATEGORY_CARDS.find((c) => c.key === draft.category)?.icon ?? Wrench;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-stone-900">
                    {selectedDevice ? selectedDevice.name : CATEGORY_CARDS.find((c) => c.key === draft.category)?.title}
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      已识别
                    </span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {selectedDevice
                      ? `${CATEGORY_LABELS[selectedDevice.category]}${selectedDevice.brand ? ` · ${selectedDevice.brand}` : ""}${selectedDevice.model ? ` ${selectedDevice.model}` : ""}${selectedDevice.location ? ` · ${selectedDevice.location}` : ""}`
                      : "未关联具体设备，可返回上一步选择"}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ step: 0 })}>
                重选设备
              </Button>
            </div>
          )}

          {/* 图片上传（模块③：点击/拖拽上传 + 本地预览 + AI 看图） */}
          <SectionCard title="上传故障照片（可选）">
            {/* 隐藏的文件选择器（label 触发，兼容移动端） */}
            <input
              ref={fileInputRef}
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

            {draft.photoPreview ? (
              /* 已选照片：预览 + 移除 */
              <div className="flex items-center gap-4">
                <img
                  src={draft.photoPreview}
                  alt="故障照片预览"
                  className="h-28 w-28 rounded-xl border border-stone-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-700">
                    {draft.photoId != null ? "照片已上传 ✓" : "照片仅本地预览"}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {draft.photoId != null
                      ? "AI 看图诊断将结合这张照片分析"
                      : "未连接 AI 服务：照片不参与本次诊断"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      重新选择
                    </Button>
                    <Button variant="ghost" size="sm" onClick={removePhoto}>
                      <X className="h-3.5 w-3.5" /> 移除
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* 空状态：点击 / 拖拽上传 */
              <div
                role="button"
                tabIndex={0}
                aria-label="上传故障照片"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handlePhotoFile(f);
                }}
                className={[
                  "rounded-xl border border-dashed p-6 text-center transition-colors",
                  dragOver
                    ? "border-brand-500 bg-brand-50"
                    : "border-stone-300 hover:border-brand-400",
                ].join(" ")}
              >
                {uploading ? (
                  <>
                    <Loader2 aria-hidden className="mx-auto h-8 w-8 animate-spin text-brand-600" />
                    <p className="mt-2 text-sm text-stone-600">照片处理中…</p>
                  </>
                ) : (
                  <>
                    <Camera aria-hidden className="mx-auto h-8 w-8 text-stone-400" />
                    <p className="mt-2 text-sm text-stone-600">
                      {elder ? "点这里，拍一张或选一张故障照片" : "点击上传或拖拽图片到此处"}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      支持 JPG、PNG 格式，单张不超过 10MB；配置 AI 服务后自动看图诊断
                    </p>
                  </>
                )}
              </div>
            )}
          </SectionCard>

          {/* 小贴士 */}
          <div className="flex items-start gap-2 rounded-xl bg-tip-bg px-4 py-3 text-sm text-tip-text">
            <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-tip-icon" />
            <p>
              请尽量提供设备的品牌型号；拍摄清晰的故障照片有助于更准确诊断；如不确定，可先描述故障现象。
            </p>
          </div>

          {/* 故障现象卡片 */}
          <SectionCard title={elder ? "设备出了什么问题？点选一个" : "故障现象"}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {symptoms.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => pickSymptom(s.title)}
                  className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  <span>
                    <span className={`font-medium text-stone-900 ${elder ? "text-lg" : "text-base"}`}>
                      {s.title}
                    </span>
                    <span className="ml-2 text-sm text-stone-400">({s.note})</span>
                  </span>
                  <span aria-hidden className="text-stone-300">›</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomSymptom(true)}
                className="flex items-center justify-between rounded-xl border border-dashed border-stone-300 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                <span className={`font-medium text-stone-600 ${elder ? "text-lg" : "text-base"}`}>
                  其他问题，直接描述
                </span>
                <span aria-hidden className="text-stone-300">›</span>
              </button>
            </div>
          </SectionCard>

          {/* 自定义描述 */}
          {(customSymptom || draft.description) && (
            <SectionCard title="描述故障">
              <div className="space-y-3">
                <InputField
                  mode="textarea"
                  rows={3}
                  maxLength={500}
                  placeholder="请输入您的问题，比如：空调开了半小时还是不凉，出风口只有自然风…"
                  value={draft.description}
                  onChange={(v) => setDraft({ description: v })}
                />
                {/* 已收集信息面板 */}
                <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
                  <p className="font-medium text-stone-600">已收集信息</p>
                  <p className="mt-1">故障现象：{draft.symptom ?? "自定义描述"}</p>
                  <p>描述字数：{draft.description.length}/500</p>
                  <p>
                    相关图片：{draft.photoPreview ? "1 张" : "0 张"}
                    {draft.photoPreview && draft.photoId == null && "（仅本地预览）"}
                  </p>
                </div>
                <Button size="lg" className="w-full" onClick={submitCustomSymptom}>
                  {elder ? "写好了，开始问诊" : "开始 AI 问诊"}
                </Button>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ---------- 步骤 2：AI 问诊 ---------- */}
      {draft.step === 2 && (
        <>
          <SectionCard padding="none">
            <div className="max-h-[52vh] space-y-4 overflow-y-auto p-4">
              {draft.chat.map((m) => (
                <AIMessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  time={m.time}
                  suggestions={m.role === "ai" ? m.suggestions : undefined}
                  onSuggestion={sendAnswer}
                  tone={elder ? "elder" : "standard"}
                />
              ))}
              {thinking && <AIMessageBubble role="ai" loading tone={elder ? "elder" : "standard"} />}
              <div ref={chatEndRef} />
            </div>

            {/* 底部输入框 + 语音入口 */}
            <div className="flex items-center gap-2 border-t border-stone-100 p-3">
              <input
                type="text"
                value={voiceRec.listening ? heardText || "正在听写，请说话…" : input}
                onChange={(e) => {
                  if (!voiceRec.listening) setInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (voiceRec.listening) return;
                  // 中文输入法组合中（选字 / 候选词）不触发发送；
                  // keyCode 229 兼容部分浏览器组合态上报
                  const composing =
                    e.nativeEvent.isComposing || e.keyCode === 229;
                  if (e.key === "Enter" && !composing) {
                    // 仅在实际发送时清空输入，避免丢失未发出的内容
                    if (sendAnswer(input)) setInput("");
                  }
                }}
                placeholder={elder ? "也可以打字或点麦克风说话…" : "请输入您的问题，比如：空调不制冷了…"}
                className={[
                  "min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm focus:outline-none",
                  voiceRec.listening
                    ? "border-risk-high bg-risk-high-bg/40 focus:border-risk-high"
                    : "border-stone-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
                ].join(" ")}
              />
              <button
                type="button"
                onClick={toggleVoiceInput}
                aria-label={voiceRec.listening ? "停止语音输入" : "语音输入"}
                title={voiceRec.listening ? "点击结束听写" : "点我说话，说完再点一下结束"}
                className={[
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  voiceRec.listening
                    ? "border-risk-high bg-risk-high text-white animate-pulse"
                    : "border-stone-300 bg-surface text-stone-600 hover:border-brand-400 hover:text-brand-700",
                ].join(" ")}
              >
                {voiceRec.listening ? (
                  <Square aria-hidden className="h-4 w-4" />
                ) : (
                  <Mic aria-hidden className="h-4 w-4" />
                )}
              </button>
              <Button
                onClick={() => {
                  if (voiceRec.listening) voiceRec.stop();
                  if (sendAnswer(input)) setInput("");
                }}
              >
                发送
              </Button>
            </div>
          </SectionCard>

          {/* 底部操作条：返回 / 重开 */}
          <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
            <Button variant="outline" onClick={() => setDraft({ step: 1 })}>
              <ArrowLeft aria-hidden className="h-4 w-4" />
              返回重新描述
            </Button>
            {(draft.answers.length > 0 || draft.chat.length > 0) && (
              <Button variant="outline" onClick={resetDraft}>
                <RotateCcw aria-hidden className="h-4 w-4" />
                重新开始
              </Button>
            )}
          </div>
        </>
      )}

      {/* 第 4 步：诊断完成后的流程闭环（避免回到本页时一片空白卡死） */}
      {draft.step === 3 && (
        <SectionCard title="诊断完成">
          {lastDiagnosis ? (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden className="mt-0.5 h-8 w-8 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <p className={`font-semibold text-stone-900 ${elder ? "text-lg" : "text-base"}`}>
                    {lastDiagnosis.deviceName ? `${lastDiagnosis.deviceName} · ` : ""}
                    {lastDiagnosis.symptom}
                  </p>
                  <p className={`mt-1 leading-relaxed text-stone-600 ${elder ? "text-base" : "text-sm"}`}>
                    {lastDiagnosis.conclusion}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <RiskBadge level={lastDiagnosis.riskLevel} />
                    <span className="text-xs text-stone-400">
                      已自动保存到维修档案
                    </span>
                  </div>
                </div>
              </div>

              {/* 流程闭环：看报告 → 报修 / 回档案 / 再来一次 */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/diagnosis/${lastDiagnosis.id}/report`)}>
                  <FileText aria-hidden className="h-4 w-4" />
                  查看完整报告
                </Button>
                <Button variant="outline" onClick={() => navigate(`/repair?diagnosisId=${lastDiagnosis.id}`)}>
                  <Wrench aria-hidden className="h-4 w-4" />
                  生成报修说明
                </Button>
                <Button variant="outline" onClick={() => navigate("/records")}>
                  <ClipboardList aria-hidden className="h-4 w-4" />
                  去维修档案
                </Button>
                <Button variant="outline" onClick={resetDraft}>
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  再诊断一次
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-500">暂未找到本次诊断结果。</p>
              <div className="mt-3">
                <Button onClick={resetDraft}>
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  开始新的诊断
                </Button>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  FlaskConical,
  Lightbulb,
  Loader2,
  Mic,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";

import Button from "../components/Button";
import DeviceCard from "../components/DeviceCard";
import DiagnosisStepper from "../components/DiagnosisStepper";
import InputField from "../components/InputField";
import AIMessageBubble from "../components/AIMessageBubble";
import SectionCard from "../components/SectionCard";
import SourceBadge from "../components/SourceBadge";
import SpeakButton from "../components/SpeakButton";
import { useToast } from "../components/Toast";
import { normalizeSpeechText, shouldAutoRead, speak, stopSpeech, useSpeech } from "../services/speech";
import { CATEGORY_LABELS } from "../services/api";
import { uploadDiagnosisPhoto } from "../services/api";
import type { DiagnoseCategory } from "../services/diagnosisService";
import {
  SYMPTOM_OPTIONS,
  buildLocalRisk,
  buildTemplateDiagnosis,
  generateAIDiagnosis,
  nextTurn,
  type AskContext,
} from "../services/diagnosisService";
import { questionsFor } from "../services/questionScript";
import type { Diagnosis, QAPair } from "../types/diagnosis";
import { isUnknownAnswer } from "../utils/risk";
import { withMeta } from "../services/deviceService";
import { useDeviceStore } from "../stores/deviceStore";
import { useDiagnosisStore, diagnosesForOwner } from "../stores/diagnosisStore";
import { useNotificationStore } from "../stores/notifications";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useRepairStore, recordsForOwner } from "../stores/repairStore";
import { usePrefs } from "../stores/prefs";
import {
  compressImage,
  fileToDataUrl,
  validatePhoto,
} from "../utils/image";

/** 设备类型卡片（P1 步骤一） */
const CATEGORY_CARDS: { key: DiagnoseCategory; emoji: string; title: string; hint: string }[] = [
  { key: "ac", emoji: "❄️", title: "空调", hint: "制冷 / 制热异常、漏水" },
  { key: "fridge", emoji: "🧊", title: "冰箱", hint: "不制冷、噪音大" },
  { key: "washer", emoji: "🫧", title: "洗衣机", hint: "无法启动、漏水" },
  { key: "other", emoji: "📺", title: "其他家电", hint: "手动选择并描述" },
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
  const { mode, autoRead, voiceEnabled } = usePrefs();
  const speechError = useSpeech((s) => s.error);
  const elder = mode === "elder";

  const { devices, load } = useDeviceStore();
  const allRepairRecords = useRepairStore((s) => s.records);
  const repairOwner = useRepairStore((s) => s.ownerKey);
  const repairRecords = useMemo(
    () => recordsForOwner(allRepairRecords, repairOwner),
    [allRepairRecords, repairOwner]
  );
  const { draft, setDraft, appendMessage, saveDiagnosis, resetDraft } =
    useDiagnosisStore();

  const [customSymptom, setCustomSymptom] = useState(false);
  const [input, setInput] = useState("");
  /** 问诊问题之间的短暂等待（不用于最终 AI 生成） */
  const [thinking, setThinking] = useState(false);
  /** 最终诊断生成中（真实状态，不显示虚构进度） */
  const [generating, setGenerating] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  /** 用户是否在消息区向上翻阅（此时不强制拉回底部） */
  const userScrolledUp = useRef(false);

  /** 防止重复生成 / 重复保存 */
  const busyRef = useRef(false);
  /** 异步会话令牌：返回、重开、切设备后旧响应不得覆盖新会话 */
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** 当前问诊所属设备 / 类别（用于检测会话变化） */
  const sessionKeyRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
      busyRef.current = false;
    };
  }, []);

  /* ---------- 模块③：故障照片上传 ---------- */
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addNotification = useNotificationStore((s) => s.add);

  /* ---------- 语音听写输入：再点一次停止，最终文字并入输入框 ---------- */
  const voice = useSpeechRecognition();
  const voiceConsumedSeqRef = useRef(0);
  useEffect(() => {
    // finalText 为增量文本，finalSeq 单调递增防止同一增量被消费两次
    if (!voice.finalText || voice.finalSeq === voiceConsumedSeqRef.current) return;
    voiceConsumedSeqRef.current = voice.finalSeq;
    setInput((prev) => (prev ? `${prev}${voice.finalText}` : voice.finalText));
  }, [voice.finalText, voice.finalSeq]);
  useEffect(() => {
    if (voice.error) notify(voice.error, "error");
  }, [voice.error, notify]);
  function toggleVoice() {
    if (voice.listening) {
      voice.stop();
    } else if (!voice.supported) {
      notify("当前浏览器不支持语音输入，建议使用 Chrome / Edge", "error");
    } else if (!voice.start()) {
      notify("语音识别启动失败，请稍后再试", "error");
    }
  }

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
            qa: [],
            chat: [],
            aiError: null,
            riskInterception: null,
          });
        }
      });
    } else if (category) {
      setDraft({
        category: category as DiagnoseCategory,
        step: 1,
        qa: [],
        chat: [],
        aiError: null,
        riskInterception: null,
      });
    }
    // 仅在首次挂载消费 URL 参数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === draft.deviceId) ?? null,
    [devices, draft.deviceId]
  );

  const interception = draft.riskInterception;

  /** 会话标识：类别 + 关联设备。变化时取消未完成的生成 */
  const sessionKey = `${draft.category ?? ""}|${draft.deviceId ?? ""}`;
  useEffect(() => {
    if (sessionKeyRef.current && sessionKeyRef.current !== sessionKey) {
      cancelGeneration();
    }
    sessionKeyRef.current = sessionKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  function cancelGeneration() {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setGenerating(false);
    setThinking(false);
  }

  /* ---------- 步骤流转 ---------- */

  function pickCategory(key: DiagnoseCategory) {
    cancelGeneration();
    setDraft({ category: key, step: 1, qa: [], chat: [], aiError: null, riskInterception: null });
  }

  function pickExistingDevice(id: number) {
    const d = devices.find((x) => x.id === id);
    if (!d) return;
    cancelGeneration();
    setDraft({
      deviceId: d.id,
      deviceName: d.name,
      category: d.category,
      step: 1,
      qa: [],
      chat: [],
      aiError: null,
      riskInterception: null,
    });
  }

  function pickSymptom(symptom: string) {
    cancelGeneration();
    setDraft({ symptom, step: 2, qa: [], chat: [], aiError: null, riskInterception: null });
    startConsult(symptom);
  }

  function submitCustomSymptom() {
    if (draft.description.trim().length < 5) {
      notify("请再描述详细一点（至少 5 个字）", "error");
      return;
    }
    cancelGeneration();
    setDraft({ symptom: null, step: 2, qa: [], chat: [], aiError: null, riskInterception: null });
    startConsult(null);
  }

  function makeCtx(symptomOverride?: string | null, qaOverride?: QAPair[]): AskContext {
    return {
      category: draft.category,
      symptom:
        symptomOverride !== undefined ? symptomOverride : draft.symptom,
      description: draft.description,
      qa: qaOverride ?? draft.qa,
      device: selectedDevice,
      photoId: draft.photoId,
    };
  }

  /** 进入问诊：发送首个 AI 问题（新会话从空问答开始） */
  function startConsult(symptom: string | null) {
    const ctx = makeCtx(symptom, []);
    const tone = elder ? "elder" : "standard";
    const turn = nextTurn(ctx, tone);

    appendMessage({
      role: "ai",
      content: elder
        ? "好的，我了解了。接下来我问您两个小问题，您点下面的按钮回答就行。"
        : "收到，为了更准确地判断，我需要再确认几个问题。",
    });

    if (turn.kind === "question") {
      appendMessage({ role: "ai", content: turn.question.text, suggestions: turn.question.suggestions });
    } else if (turn.kind === "interception") {
      setDraft({ riskInterception: turn.interception });
      // 通知中心（模块⑤）：高风险告警
      addNotification({
        type: "risk",
        title: `高风险告警 · ${turn.interception.title}`,
        body: turn.interception.description,
      });
    } else {
      // 问诊信息已齐（例如旧草稿迁移后）：直接生成
      void generateResult(ctx);
    }
  }

  /** 用户回答（点选建议 / 自由输入） */
  function sendAnswer(text: string) {
    if (thinking || generating || busyRef.current || !text.trim()) return;
    const answer = text.trim();
    const questions = questionsFor(draft.category);
    const question = questions[draft.qa.length];
    if (!question) {
      notify("本轮问诊已完成，正在生成诊断结果", "info");
      return;
    }

    const pair: QAPair = {
      questionId: question.id,
      questionText: question.text,
      answer,
      unknown: isUnknownAnswer(answer),
    };
    const newQa = [...draft.qa, pair];

    appendMessage({ role: "user", content: answer });
    setInput("");

    const ctx = makeCtx(undefined, newQa);
    const tone = elder ? "elder" : "standard";
    const turn = nextTurn(ctx, tone);

    if (turn.kind === "result") {
      setDraft({ qa: newQa });
      void generateResult(ctx);
      return;
    }

    setThinking(true);
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (turn.kind === "question") {
        setDraft({ qa: newQa });
        appendMessage({ role: "ai", content: turn.question.text, suggestions: turn.question.suggestions });
      } else {
        setDraft({ qa: newQa, riskInterception: turn.interception });
        // 通知中心（模块⑤）：高风险告警
        addNotification({
          type: "risk",
          title: `高风险告警 · ${turn.interception.title}`,
          body: turn.interception.description,
        });
      }
      setThinking(false);
    }, 500);
  }

  /**
   * 生成诊断结果。
   * mode=ai：调用真实 AI，失败保留输入并提示重试（不静默回退模板）
   * mode=template：用户主动选择的模板演示，来源恒为 template
   */
  async function generateResult(ctx: AskContext, mode: "ai" | "template" = "ai") {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ aiError: null });

    if (mode === "template") {
      const diagnosis = buildTemplateDiagnosis(ctx);
      if (token === generationRef.current && mountedRef.current) {
        finishDiagnosis(diagnosis);
      }
      busyRef.current = false;
      abortRef.current = null;
      return;
    }

    setGenerating(true);
    const tone = elder ? "elder" : "standard";
    const result = await generateAIDiagnosis(ctx, tone, controller.signal);

    // 旧响应：返回 / 重开 / 切设备后不得覆盖当前会话
    if (token !== generationRef.current || !mountedRef.current) return;

    busyRef.current = false;
    abortRef.current = null;
    setGenerating(false);

    if (result.ok) {
      finishDiagnosis(result.diagnosis);
      return;
    }
    if (result.kind === "interception") {
      setDraft({ riskInterception: result.interception });
      return;
    }
    if (result.error.code === "aborted") return;
    setDraft({ aiError: result.error });
  }

  /** 问诊完成：保存并跳转 P2 */
  function finishDiagnosis(diagnosis: Diagnosis) {
    appendMessage({
      role: "ai",
      content:
        diagnosis.source === "ai"
          ? "真实 AI 已生成诊断结果，正在为您打开结果页。"
          : "已生成模板演示结果（非 AI 生成），仅供演示参考。",
    });
    // 通知中心（模块⑤）：诊断完成
    addNotification({
      type: "diagnosis",
      title: "诊断完成",
      body: `${diagnosis.symptom || "自定义故障"}：${diagnosis.conclusion.slice(0, 50)}`,
    });
    saveDiagnosis(diagnosis);
    setDraft({ step: 3, aiError: null });
    navigate(`/diagnosis/${diagnosis.id}/result`);
  }

  /** 关闭拦截，返回第一步安全重述（清空描述，避免旧文本再次触发拦截） */
  function dismissInterception() {
    cancelGeneration();
    setDraft({
      riskInterception: null,
      qa: [],
      description: "",
      step: 1,
    });
    notify("已返回描述步骤，请调整描述后重新开始", "info");
  }

  /** 重新开始 / 返回修改：取消未完成请求，但保留历史记录 */
  function restart() {
    cancelGeneration();
    resetDraft();
  }

  function backToDescribe() {
    cancelGeneration();
    setDraft({ step: 1, aiError: null });
  }

  // 对话区滚动：用户上翻阅读时不强制拉回底部，仅在贴近底部时跟随新消息
  useEffect(() => {
    if (userScrolledUp.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [draft.chat.length, thinking, generating]);

  /** 用户主动向上翻阅后标记；重新贴近底部（<80px）时恢复自动跟随 */
  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !nearBottom;
  }

  /* ---------- 模块④：自动朗读逻辑见下方“最新 AI 问题”与高风险提示 ---------- */

  const symptoms = draft.category ? SYMPTOM_OPTIONS[draft.category] : [];
  const questions = questionsFor(draft.category);
  const allAnswered = draft.qa.length >= questions.length;
  const riskPreview = buildLocalRisk(makeCtx());

  /** 仅最新一条 AI 消息展示可点选建议与朗读：防止历史选项误答新一轮问题 */
  const lastAi = useMemo(
    () => [...draft.chat].reverse().find((m) => m.role === "ai") ?? null,
    [draft.chat]
  );
  const lastAiId = lastAi?.id;

  /** 自动朗读：只读最新的助手问题（带建议选项），不读用户输入与开场白 */
  /** 进入页面时已存在的问题只作基线，不当作“新问题”自动朗读（刷新/返回不重复播报） */
  const autoBaselineRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (autoBaselineRef.current === undefined) {
      autoBaselineRef.current = lastAiId ?? null;
      return;
    }
    if (!autoRead || !voiceEnabled || thinking || generating || interception) return;
    if (!lastAi?.content || !lastAi.suggestions?.length) return;
    if (lastAi.id === autoBaselineRef.current) return;
    const key = `auto:diag:${lastAi.id}:${mode}`;
    if (!shouldAutoRead(key)) return;
    speak({ key, text: lastAi.content });
  }, [lastAi, lastAiId, autoRead, voiceEnabled, thinking, generating, interception, mode]);

  /** 高风险拦截优先：停止普通内容，自动播报一次安全提示 */
  const interceptionSpeechText = interception
    ? normalizeSpeechText([
        `高风险。${interception.title}`,
        interception.description,
        ...interception.immediateActions.map((a) => `${a.title}。${a.description}`),
        ...interception.forbiddenActions.map((f) => `禁止：${f}`),
      ])
    : "";

  useEffect(() => {
    if (!interception || !autoRead || !voiceEnabled) return;
    const key = `auto:risk:${interception.title}:${mode}`;
    if (!shouldAutoRead(key)) return;
    speak({ key, text: interceptionSpeechText });
  }, [interception, interceptionSpeechText, autoRead, voiceEnabled, mode]);

  // 离开问诊页或组件卸载时停止朗读
  useEffect(() => () => stopSpeech(), []);

  /* ================= 高风险安全拦截（4.4 结构，等级不随模式变化） ================= */
  if (interception) {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="rounded-2xl border-2 border-risk-high bg-risk-high-bg p-6"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert aria-hidden className="h-8 w-8 shrink-0 text-risk-high" />
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
          <div className="mt-4 flex flex-wrap gap-2">
            <SpeakButton
              text={interceptionSpeechText}
              speechKey={`risk-interception:${mode}`}
              label="朗读安全提示"
              variant="secondary"
              size="md"
              elder={elder}
            />
          </div>
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
              const last = diagnosesForOwner(
                useDiagnosisStore.getState().history,
                useDiagnosisStore.getState().ownerKey
              )[0];
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
      {/* 进度条：长辈模式下由下方大号文字引导取代，避免小字干扰 */}
      <div data-elder="hide" className="card-base p-4">
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
              {CATEGORY_CARDS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pickCategory(c.key)}
                  className="rounded-xl border border-stone-200 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  <span aria-hidden className="text-3xl">{c.emoji}</span>
                  <p className={`mt-2 font-semibold text-stone-900 ${elder ? "text-lg" : "text-base"}`}>{c.title}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{c.hint}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="已有设备"
            action={
              draft.chat.length > 0 || draft.step > 0 ? (
                <button type="button" onClick={restart} className="text-xs text-brand-700 hover:underline">
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
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="text-2xl">
                  {draft.category === "ac" ? "❄️" : draft.category === "fridge" ? "🧊" : draft.category === "washer" ? "🫧" : "📺"}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-stone-900">
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
            <p className="mt-2 text-xs leading-relaxed text-stone-400">
              照片仅用于本次故障诊断，不会用于广告投放或模型训练；请避免拍到人脸、证件等无关信息。详见
              <Link to="/privacy" className="text-brand-700 underline underline-offset-2 hover:text-brand-800">
                《隐私政策》
              </Link>
              。
            </p>
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
                  onClick={() => {
                    // 空调“不制冷/制冷效果变差”进入动态追问；其他设备与现象保持原流程
                    if (draft.category === "ac" && s.title.includes("制冷")) {
                      navigate("/interview/ac");
                    } else {
                      pickSymptom(s.title);
                    }
                  }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <span className={`font-medium text-stone-900 ${elder ? "text-lg" : "text-base"}`}>
                      {s.title}
                    </span>
                    <span className="ml-2 text-sm text-stone-400">({s.note})</span>
                    {draft.category === "ac" && s.title.includes("制冷") && (
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                        动态追问
                      </span>
                    )}
                  </span>
                  <span aria-hidden className="text-stone-300">›</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomSymptom(true)}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-stone-300 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
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
                {riskPreview.level === "high" && (
                  <p role="alert" className="rounded-lg border border-risk-high-border bg-risk-high-bg px-3 py-2 text-sm font-medium text-risk-high-deep">
                    △ 描述中包含高风险信息，开始问诊后将立即拦截并给出安全指引。
                  </p>
                )}
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
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              className="chat-scroll space-y-4 overflow-y-auto p-4"
            >
              {draft.chat.map((m) => (
                <AIMessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  time={m.time}
                  suggestions={
                    m.role === "ai" && m.id === lastAiId
                      ? m.suggestions
                      : undefined
                  }
                  onSuggestion={sendAnswer}
                  tone={elder ? "elder" : "standard"}
                  speakKey={
                    m.role === "ai" && m.id === lastAiId
                      ? `chat:${m.id}:${mode}`
                      : undefined
                  }
                />
              ))}
              {thinking && <AIMessageBubble role="ai" loading tone={elder ? "elder" : "standard"} />}

              {/* 真实等待状态：不显示虚构进度 */}
              {generating && (
                <div role="status" aria-live="polite" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" aria-hidden />
                    正在调用真实 AI 生成诊断…
                  </p>
                  <p className="mt-1 text-brand-800">
                    通常需要 10–60 秒，实际耗时取决于模型服务；这里不显示虚构进度。
                  </p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={cancelGeneration}>
                    取消本次等待
                  </Button>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 底部输入框 + 语音入口 */}
            <div className="flex items-center gap-2 border-t border-stone-100 p-3">
              <input
                type="text"
                value={input + (voice.listening ? voice.interimText : "")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // 输入法组合状态（如中文选字）下 Enter 不发送；keyCode 229 兼容部分安卓输入法
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    sendAnswer(input);
                  }
                }}
                enterKeyHint="send"
                autoComplete="off"
                disabled={generating}
                placeholder={
                  voice.listening
                    ? "正在聆听…说完点「停止」"
                    : elder
                      ? "也可以打字告诉我…"
                      : "请输入您的问题，比如：空调不制冷了…"
                }
                aria-label={voice.listening ? "语音输入中，内容实时转写" : "回答输入框"}
                className={[
                  "min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm focus:outline-none disabled:bg-stone-50",
                  voice.listening
                    ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-stone-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
                ].join(" ")}
              />
              <Button
                variant={voice.listening ? "danger" : "secondary"}
                onClick={toggleVoice}
                aria-label={voice.listening ? "停止语音输入" : "开始语音输入"}
                aria-pressed={voice.listening}
                disabled={generating}
              >
                <Mic className="h-4 w-4" />
                {voice.listening ? "停止" : ""}
              </Button>
              <Button onClick={() => sendAnswer(input)} disabled={generating || !input.trim()}>
                发送
              </Button>
            </div>
          </SectionCard>

          {/* 自动朗读失败：明确提示，不假装已播放；文字问答不受影响 */}
          {speechError && autoRead && (
            <p
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              自动朗读未播放：{speechError} 可点击问题下方的「朗读」手动播放。
            </p>
          )}

          {/* AI 失败：保留输入，明确来源，允许重试或主动选择模板 */}
          {draft.aiError && (
            <section
              role="alert"
              className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-amber-900">诊断未生成，未使用模板冒充 AI</h2>
                  <p className="mt-1 text-sm text-amber-900">{draft.aiError.message}</p>
                  <p className="mt-1 text-xs text-amber-800">
                    您的设备、描述和全部问答已保留。可以重试真实 AI，或主动选择模板演示。
                  </p>
                  {draft.aiError.code === "ai_not_configured" && (
                    <p className="mt-1 text-xs text-amber-800">
                      管理员需在后端 <code>backend/.env</code> 配置 FIXITAI_AI_API_KEY；本轮不展示密钥。
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => void generateResult(makeCtx(), "ai")}
                      disabled={generating || busyRef.current}
                    >
                      <RefreshCw className="h-4 w-4" /> 重试真实 AI
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void generateResult(makeCtx(), "template")}
                      disabled={generating || busyRef.current}
                      title="模板演示由本地固定模板生成，不是真实 AI"
                    >
                      <FlaskConical className="h-4 w-4" /> 查看模板演示（非 AI）
                    </Button>
                    <Button variant="ghost" onClick={backToDescribe}>
                      返回修改描述
                    </Button>
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                    模板演示来源标识：
                    <SourceBadge source="template" />
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* 问诊已答完但尚未生成（刷新 / 异常恢复） */}
          {!draft.aiError && !generating && allAnswered && draft.chat.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">问诊信息已齐全，但尚未生成诊断结果。</p>
              <p className="mt-1 text-xs text-slate-500">
                可重试真实 AI，或主动选择模板演示（非 AI）。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void generateResult(makeCtx(), "ai")}>
                  <RefreshCw className="h-4 w-4" /> 生成真实 AI 诊断
                </Button>
                <Button variant="secondary" onClick={() => void generateResult(makeCtx(), "template")}>
                  <FlaskConical className="h-4 w-4" /> 查看模板演示（非 AI）
                </Button>
              </div>
            </section>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={backToDescribe}>
              ← 返回重新描述
            </Button>
            {(draft.qa.length > 0 || draft.chat.length > 0) && (
              <Button variant="ghost" onClick={restart}>
                重新开始
              </Button>
            )}
          </div>
        </>
      )}

      {/* ---------- 步骤 3：已完成（返回诊断页时给出入口） ---------- */}
      {draft.step === 3 && (
        <SectionCard title="诊断已完成">
          <p className="text-sm text-slate-600">本次问诊结果已保存，可前往结果页或重新开始新的诊断。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const last = diagnosesForOwner(
                  useDiagnosisStore.getState().history,
                  useDiagnosisStore.getState().ownerKey
                )[0];
                if (last) navigate(`/diagnosis/${last.id}/result`);
                else restart();
              }}
            >
              查看最近结果
            </Button>
            <Button variant="secondary" onClick={restart}>
              重新开始诊断
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

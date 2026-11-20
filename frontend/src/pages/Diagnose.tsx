import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  FileText,
  Loader2,
  Mic,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";

import AIMessageBubble from "../components/AIMessageBubble";
import Button from "../components/Button";
import { useMediaPermission } from "../components/MediaPermission";
import SectionCard from "../components/SectionCard";
import SpeakButton from "../components/SpeakButton";
import { useToast } from "../components/Toast";
import { normalizeSpeechText, shouldAutoRead, speak, stopSpeech, useSpeech } from "../services/speech";
import { uploadDiagnosisPhoto } from "../services/api";
import type { DiagnoseCategory } from "../services/diagnosisService";
import {
  buildQAFromChat,
  chatWithAI,
  generateAIDiagnosis,
  type AskContext,
} from "../services/diagnosisService";
import type { ChatMessage, Diagnosis, QAPair } from "../types/diagnosis";
import { useDeviceStore } from "../stores/deviceStore";
import { useDiagnosisStore, diagnosesForOwner } from "../stores/diagnosisStore";
import { useNotificationStore } from "../stores/notifications";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { usePrefs } from "../stores/prefs";
import { compressImage, fileToDataUrl, validatePhoto } from "../utils/image";

/** 设备类别由用户描述自动推断；不再要求手动选择 */

/** 根据用户第一句话推断设备类别，用户已手动选择时以手动为准 */
function inferCategory(text: string, current: DiagnoseCategory | null): DiagnoseCategory {
  if (current && current !== "other") return current;
  if (/(空调|冷气|制冷|制热|外机|滤网)/.test(text)) return "ac";
  if (/(冰箱|冷藏|冷冻|门封)/.test(text)) return "fridge";
  if (/(洗衣机|洗衣|脱水|排水)/.test(text)) return "washer";
  return current ?? "other";
}

/** AI 诊断：像聊天应用一样直接输入问题，真实模型思考后回复 */
export default function Diagnose() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [params] = useSearchParams();
  const { mode, autoRead, voiceEnabled } = usePrefs();
  const speechError = useSpeech((s) => s.error);
  const elder = mode === "elder";

  const { devices, load } = useDeviceStore();
  const { draft, setDraft, appendMessage, saveDiagnosis, resetDraft } = useDiagnosisStore();
  const addNotification = useNotificationStore((s) => s.add);

  const [input, setInput] = useState("");
  /** 等待真实 AI 回复（不伪造进度） */
  const [thinking, setThinking] = useState(false);
  /** 最终诊断生成中 */
  const [generating, setGenerating] = useState(false);
  /** AI 认为信息已足够，可以生成完整报告 */
  const [aiReady, setAiReady] = useState(false);
  /** 最近一次失败发生在对话中，还是最终生成时 */
  const [errorPhase, setErrorPhase] = useState<"chat" | "generate">("chat");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  /** 用户是否在消息区向上翻阅（此时不强制拉回底部） */
  const userScrolledUp = useRef(false);

  /** 防止重复生成 / 重复保存 */
  const busyRef = useRef(false);
  /** 最终诊断请求令牌 */
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 对话请求令牌与中断控制器 */
  const chatSeqRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  /** 照片是否已随某一轮对话发给 AI（上传/重传后重置） */
  const photoSentRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      chatSeqRef.current += 1;
      abortRef.current?.abort();
      chatAbortRef.current?.abort();
      busyRef.current = false;
    };
  }, []);

  /* ---------- 故障照片 ---------- */
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- 语音听写输入 ---------- */
  const voice = useSpeechRecognition();
  /** 访问照片 / 麦克风前先弹窗征得用户同意 */
  const requestPermission = useMediaPermission();
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
    } else {
      // 先征求意见：允许后才真正开启麦克风
      requestPermission("microphone", () => {
        if (!voice.start()) notify("语音识别启动失败，请稍后再试", "error");
      });
    }
  }

  /** 校验 → 压缩 → 本地预览 → 优先后端入库；后端不可用时仅本地预览 */
  async function handlePhotoFile(file: File) {
    const err = validatePhoto(file);
    if (err) return notify(err, "error");

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const preview = await fileToDataUrl(compressed);
      try {
        const res = await uploadDiagnosisPhoto(compressed);
        photoSentRef.current = false;
        setDraft({ photoId: res.id, photoPreview: preview });
        notify("照片已上传，AI 会结合照片分析", "success");
      } catch {
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
    photoSentRef.current = false;
    setDraft({ photoId: null, photoPreview: null });
  }

  useEffect(() => {
    void load();
    // 聊天式诊断：直接进入对话态，兼容旧草稿
    setDraft({ step: 2 });

    /** URL 预选：?deviceId= 或 ?category=（首页快速入口 / 设备详情跳转） */
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
            step: 2,
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
        step: 2,
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

  function cancelGeneration() {
    generationRef.current += 1;
    chatSeqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    busyRef.current = false;
    setGenerating(false);
    setThinking(false);
  }

  function makeCtx(
    categoryOverride?: DiagnoseCategory | null,
    qaOverride?: QAPair[],
    chatOverride?: ChatMessage[],
    descriptionOverride?: string
  ): AskContext {
    return {
      category: categoryOverride ?? draft.category,
      symptom: draft.symptom,
      description: descriptionOverride ?? draft.description,
      qa: qaOverride ?? draft.qa,
      device: selectedDevice,
      photoId: draft.photoId,
      chat: chatOverride ?? draft.chat,
    };
  }

  /** 真实 AI 多轮对话：每轮携带完整历史，等待真实回复 */
  async function runChatTurn(history: ChatMessage[], ctx: AskContext) {
    const token = ++chatSeqRef.current;
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    setThinking(true);
    setDraft({ aiError: null });

    // 照片在“上传后的下一轮”发送一次；AI 看过之后保留在上下文里，不重复上传
    const callCtx: AskContext = {
      ...ctx,
      photoId: ctx.photoId != null && !photoSentRef.current ? ctx.photoId : null,
    };
    const tone = elder ? "elder" : "standard";
    const result = await chatWithAI(callCtx, history, tone, controller.signal);

    // 返回 / 重新开始后，旧响应不得覆盖新会话
    if (token !== chatSeqRef.current || !mountedRef.current) return;
    chatAbortRef.current = null;
    setThinking(false);

    if (!result.ok) {
      if (result.kind === "interception") {
        setDraft({ riskInterception: result.interception });
        addNotification({
          type: "risk",
          title: `高风险告警 · ${result.interception.title}`,
          body: result.interception.description,
        });
        return;
      }
      if (result.error.code === "aborted") return;
      setErrorPhase("chat");
      setDraft({ aiError: result.error });
      return;
    }

    if (callCtx.photoId != null) photoSentRef.current = true;
    appendMessage({
      role: "ai",
      content: result.reply,
      suggestions: result.suggestions,
    });
    setAiReady(result.ready);
  }

  /** 发送一条聊天消息：用户自己输入问题，AI 思考后回复 */
  function sendText(raw: string) {
    if (thinking || generating || busyRef.current) return;
    const text = raw.trim();
    if (!text) return;

    const category = inferCategory(text, draft.category);
    const isFirst = draft.chat.length === 0;
    const description = isFirst && !draft.description.trim()
      ? text.slice(0, 500)
      : draft.description;

    const message: ChatMessage = {
      id: "pending-user",
      role: "user",
      content: text,
      time: "",
    };
    const history = [...draft.chat, message];

    // 有待发送照片时，照片跟这条消息一起进入对话气泡，并从输入区移除
    const attachPhoto = draft.photoId != null && !photoSentRef.current;
    const photoPreview = attachPhoto ? draft.photoPreview ?? undefined : undefined;
    appendMessage({ role: "user", content: text, photoPreview });
    setInput("");
    setDraft({
      category,
      description,
      qa: buildQAFromChat(history),
      aiError: null,
      ...(attachPhoto ? { photoPreview: null } : {}),
    });

    const ctx = makeCtx(category, buildQAFromChat(history), history, description);
    void runChatTurn(history, ctx);
  }

  function handleSend() {
    sendText(input);
  }

  /** 对话失败后重试：保留已输入内容，重新请求同一轮回复 */
  function retryChat() {
    if (!draft.chat.length) return;
    const ctx = makeCtx(
      draft.category,
      buildQAFromChat(draft.chat),
      draft.chat,
      draft.description
    );
    void runChatTurn(draft.chat, ctx);
  }

  /** 用完整对话生成最终诊断报告的上下文 */
  function reportCtx(): AskContext {
    const qa = buildQAFromChat(draft.chat);
    return makeCtx(draft.category, qa, draft.chat, draft.description);
  }

  /** 用真实 AI 生成诊断结果；失败保留对话并提示重试，不静默回退模板 */
  async function generateResult(ctx: AskContext) {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ aiError: null, qa: ctx.qa });

    setGenerating(true);
    const tone = elder ? "elder" : "standard";
    const result = await generateAIDiagnosis(ctx, tone, controller.signal);

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
    setErrorPhase("generate");
    setDraft({ aiError: result.error });
  }

  /** 问诊完成：保存并跳转结果页 */
  function finishDiagnosis(diagnosis: Diagnosis) {
    appendMessage({
      role: "ai",
      content:
        diagnosis.source === "ai"
          ? "真实 AI 已生成诊断结果，正在为您打开结果页。"
          : "已生成模板演示结果（非 AI 生成），仅供演示参考。",
    });
    addNotification({
      type: "diagnosis",
      title: "诊断完成",
      body: `${diagnosis.symptom || "自定义故障"}：${diagnosis.conclusion.slice(0, 50)}`,
    });
    saveDiagnosis(diagnosis);
    setDraft({ step: 3, aiError: null });
    navigate(`/diagnosis/${diagnosis.id}/result`);
  }

  /** 关闭拦截，返回聊天（清空高风险描述，避免再次触发） */
  function dismissInterception() {
    cancelGeneration();
    setAiReady(false);
    setDraft({
      riskInterception: null,
      qa: [],
      chat: [],
      description: "",
      aiError: null,
      step: 2,
    });
    notify("已清空本轮描述，可以换个方式重新描述", "info");
  }

  /** 重新开始：清空对话与草稿，保留历史记录 */
  function restart() {
    cancelGeneration();
    setAiReady(false);
    setErrorPhase("chat");
    photoSentRef.current = false;
    resetDraft();
    setDraft({ step: 2 });
    setInput("");
  }

  // 对话区滚动：用户上翻阅读时不强制拉回底部，仅在贴近底部时跟随新消息
  useEffect(() => {
    if (userScrolledUp.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [draft.chat.length, thinking, generating]);

  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !nearBottom;
  }

  /** 仅最新一条 AI 消息展示可点选建议与朗读 */
  const lastAi = useMemo(
    () => [...draft.chat].reverse().find((m) => m.role === "ai") ?? null,
    [draft.chat]
  );
  const lastAiId = lastAi?.id;

  /** 自动朗读最新 AI 回复（进入页面时的旧消息只作基线，不重复播报） */
  const autoBaselineRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (autoBaselineRef.current === undefined) {
      autoBaselineRef.current = lastAiId ?? null;
      return;
    }
    if (!autoRead || !voiceEnabled || thinking || generating || interception) return;
    if (!lastAi?.content) return;
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

  // 离开页面时停止朗读
  useEffect(() => () => stopSpeech(), []);

  const hasUserTurn = draft.chat.some((m) => m.role === "user");

  /* ================= 高风险安全拦截 ================= */
  if (interception) {
    return (
      <div className="space-y-5">
        <div role="alert" className="rounded-2xl border-2 border-risk-high bg-risk-high-bg p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert aria-hidden className="h-8 w-8 shrink-0 text-risk-high" />
            <h1 className="text-xl font-bold text-risk-high-deep">△ 高风险 · {interception.title}</h1>
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
            <Undo2 className="h-4 w-4" /> 我已了解，换个描述
          </Button>
        </div>
      </div>
    );
  }

  /* ================= 聊天式 AI 问诊 ================= */
  return (
    <div className="space-y-4">
      <SectionCard padding="none">
        <div
          ref={chatScrollRef}
          onScroll={handleChatScroll}
          className="chat-scroll space-y-4 overflow-y-auto p-4"
        >
          {/* 欢迎语（仅界面展示，不进入模型历史） */}
          {draft.chat.length === 0 && (
            <AIMessageBubble
              role="ai"
              content={
                elder
                  ? "你好，我是修必达。哪个电器出问题了？您直接说就行，我帮您想想办法。"
                  : "你好，我是修必达 AI 维修助手。直接告诉我家电出了什么问题，比如：空调开了半小时还是不凉，出风口只有自然风。"
              }
              tone={elder ? "elder" : "standard"}
            />
          )}

          {draft.chat.map((m) => (
            <AIMessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              photoPreview={m.photoPreview}
              time={m.time}
              suggestions={m.role === "ai" && m.id === lastAiId ? m.suggestions : undefined}
              onSuggestion={sendText}
              tone={elder ? "elder" : "standard"}
              speakKey={m.role === "ai" && m.id === lastAiId ? `chat:${m.id}:${mode}` : undefined}
            />
          ))}

          {/* AI 思考中：真实等待状态 */}
          {thinking && (
            <>
              <AIMessageBubble role="ai" loading tone={elder ? "elder" : "standard"} />
              <p className="pl-10 text-xs text-stone-400" role="status" aria-live="polite">
                AI 正在思考…
              </p>
            </>
          )}

          {/* 最终报告生成中 */}
          {generating && (
            <div role="status" aria-live="polite" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <p className="flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" aria-hidden />
                正在基于完整对话生成诊断报告…
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

        {/* 照片预览 */}
        {draft.photoPreview && (
          <div className="flex items-center gap-3 border-t border-stone-100 px-3 py-2">
            <img src={draft.photoPreview} alt="故障照片预览" className="h-12 w-12 rounded-lg border border-stone-200 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-stone-700">
                {draft.photoId != null ? "照片已上传，将结合图片分析" : "照片仅本地预览"}
              </p>
              {draft.photoId == null && (
                <p className="text-xs text-stone-400">未连接 AI 服务，照片不参与本次诊断</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={removePhoto} aria-label="移除照片">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* 输入区：像聊天应用一样，输入问题 → 发送 → AI 回复 */}
        <div className="border-t border-stone-100 p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            aria-label="选择故障照片"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePhotoFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => requestPermission("photo", () => fileInputRef.current?.click())}
              disabled={uploading || generating}
              aria-label="上传故障照片"
              title="上传故障照片（可选）"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
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
            <textarea
              rows={1}
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter 发送，Shift+Enter 换行；输入法选字状态下不发送
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              enterKeyHint="send"
              autoComplete="off"
              disabled={generating}
              placeholder={
                elder
                  ? "想到什么就说什么，比如：空调不凉了…"
                  : "输入你的问题，比如：空调开了半小时还是不凉，出风口只有自然风…"
              }
              className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-stone-300 px-3 py-2.5 text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50"
            />
            <Button
              onClick={handleSend}
              disabled={thinking || generating || !input.trim()}
              title="Enter 发送，Shift+Enter 换行"
            >
              发送
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* 自动朗读失败：明确提示，不假装已播放 */}
      {speechError && autoRead && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          自动朗读未播放：{speechError} 可点击消息下方的「朗读」手动播放。
        </p>
      )}

      {/* 生成报告入口：对话中随时可用，AI 认为信息足够时给出提示 */}
      {hasUserTurn && !thinking && !generating && !draft.aiError && (
        <section className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-800">
              {aiReady ? "AI 认为信息已经足够" : "随时可以生成诊断报告"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void generateResult(reportCtx())}
              disabled={thinking || generating || busyRef.current}
            >
              <FileText className="h-4 w-4" /> 生成诊断报告
            </Button>
          </div>
        </section>
      )}

      {/* AI 失败：保留对话，明确来源 */}
      {draft.aiError && (
        <section role="alert" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-amber-900">
                {errorPhase === "chat" ? "AI 回复失败，未使用模板冒充 AI" : "诊断未生成，未使用模板冒充 AI"}
              </h2>
              <p className="mt-1 text-sm text-amber-900">{draft.aiError.message}</p>
              <p className="mt-1 text-xs text-amber-800">
                {errorPhase === "chat"
                  ? "您已输入的内容都保留在对话里，可以重试继续和 AI 聊天。"
                  : "您的对话已保留，可以重试真实 AI。"}
              </p>
              {draft.aiError.code === "ai_not_configured" && (
                <p className="mt-1 text-xs text-amber-800">
                  管理员需在后端 <code>backend/.env</code> 配置 FIXITAI_AI_API_KEY；本轮不展示密钥。
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {errorPhase === "chat" ? (
                  <Button onClick={retryChat} disabled={thinking || generating}>
                    <RefreshCw className="h-4 w-4" /> 重试 AI 对话
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => void generateResult(reportCtx())}
                      disabled={generating || busyRef.current}
                    >
                      <RefreshCw className="h-4 w-4" /> 重试真实 AI
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={restart}>
                  重新开始
                </Button>
              </div>

            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {hasUserTurn && (
          <Button variant="ghost" onClick={restart}>
            重新开始
          </Button>
        )}
      </div>
    </div>
  );
}

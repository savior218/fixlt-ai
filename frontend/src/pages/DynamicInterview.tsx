import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mic, MicOff, Send, Sparkles } from "lucide-react";

import Button from "../components/Button";
import { useMediaPermission } from "../components/MediaPermission";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import SpeakButton from "../components/SpeakButton";
import { useToast } from "../components/Toast";
import { useAuthStore } from "../stores/authStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { usePrefs } from "../stores/prefs";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
  ApiError,
  answerInterview,
  finishInterview,
  getInterview,
  startInterview,
  uploadDiagnosisPhoto,
  type InterviewOption,
  type InterviewState,
} from "../services/api";
import { compressImage, fileToDataUrl, validatePhoto } from "../utils/image";
import { isWeChatBrowser, WECHAT_SPEECH_HINT } from "../utils/platform";
import { generateAIDiagnosis } from "../services/diagnosisService";
import { speak, stopSpeech } from "../services/speech";
import type { QAPair } from "../types/diagnosis";

type Phase = "describe" | "active" | "done" | "generating" | "error";

/** 本机会话草稿：刷新后恢复同一会话，不丢已答问题；按账号隔离 */
type InterviewDraft = { sessionId?: string; description?: string };

function draftKeyFor(userId: number): string {
  return `fixitai-interview-draft:${userId}`;
}

function readInterviewDraft(key: string): InterviewDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InterviewDraft;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

const END_REASON_LABELS: Record<string, string> = {
  model_recommend: "大模型判断信息已足够，结束追问",
  model_cannot: "大模型认为目前无法继续判断",
  max_rounds: "已达到 6 轮上限",
  user_finish: "你选择基于现有信息生成建议",
  safety_interception: "高风险，已中止普通问诊",
};

export default function DynamicInterview() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const authStatus = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const elder = usePrefs((s) => s.mode === "elder");
  const autoRead = usePrefs((s) => s.autoRead);
  const speechEnabled = usePrefs((s) => s.voiceEnabled);
  const saveDiagnosis = useDiagnosisStore((s) => s.saveDiagnosis);

  const [phase, setPhase] = useState<Phase>("describe");
  const [description, setDescription] = useState("");
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [session, setSession] = useState<InterviewState | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [optionId, setOptionId] = useState<string | null>(null);
  const [answerSource, setAnswerSource] = useState<"text" | "voice" | "option">("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskText, setRiskText] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);

  const requestIdRef = useRef(`ans-${Date.now()}-${Math.random()}`);
  const autoSpokenRef = useRef<string | null>(null);
  const voice = useSpeechRecognition();
  /** 访问照片 / 麦克风前先弹窗征得用户同意 */
  const requestPermission = useMediaPermission();
  const restoreDoneRef = useRef(false);
  const persistReadyRef = useRef(false);
  const restoringRef = useRef(false);
  const latestSessionIdRef = useRef<string | null>(null);
  const draftKey = userId != null ? draftKeyFor(userId) : null;

  // 刷新后恢复同一会话：会话不因刷新而重置，已答问题与当前问题都来自后端
  useEffect(() => {
    if (authStatus !== "authenticated" || !draftKey || restoreDoneRef.current) return;
    restoreDoneRef.current = true;
    const draft = readInterviewDraft(draftKey);
    persistReadyRef.current = true;
    if (!draft) return;
    if (draft.description) setDescription(draft.description);
    if (!draft.sessionId) return;
    restoringRef.current = true;
    void (async () => {
      try {
        const s = await getInterview(draft.sessionId!);
        latestSessionIdRef.current = s.session_id;
        setSession(s);
        if (s.photo_id != null) setPhotoId(s.photo_id);
        if (s.status === "intercepted") {
          setRiskText("此前检测到高风险描述，普通问诊已中止");
          setPhase("error");
        } else {
          setPhase(s.status !== "active" || !s.current_question ? "done" : "active");
        }
      } catch (err) {
        // 会话过期或不属于当前账号：保留描述草稿，重新开始新会话
        if (err instanceof ApiError && [401, 403, 404, 410].includes(err.status)) {
          localStorage.setItem(draftKey, JSON.stringify({ description: draft.description ?? "" }));
        }
      } finally {
        restoringRef.current = false;
      }
    })();
  }, [authStatus, draftKey]);

  // 描述草稿随时保存；开始问诊后同时保存会话 ID；恢复完成前不覆盖已有会话草稿
  useEffect(() => {
    if (!draftKey || !persistReadyRef.current || restoringRef.current) return;
    if (phase === "active" || phase === "done") {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ sessionId: session?.session_id, description })
      );
    } else if (phase === "describe" && description) {
      localStorage.setItem(draftKey, JSON.stringify({ description }));
    }
  }, [draftKey, phase, description, session?.session_id]);

  // 语音转写只填入可编辑输入框，必须由用户确认后才提交
  const voiceConsumedSeqRef = useRef(0);
  useEffect(() => {
    // finalText 为增量文本，finalSeq 单调递增防止同一增量被消费两次
    if (!voice.finalText || voice.finalSeq === voiceConsumedSeqRef.current) return;
    voiceConsumedSeqRef.current = voice.finalSeq;
    if (phase === "describe") {
      setDescription((prev) => (prev ? `${prev}${voice.finalText}` : voice.finalText));
    } else if (phase === "active") {
      setAnswerText((prev) => (prev ? `${prev}${voice.finalText}` : voice.finalText));
      setAnswerSource("voice");
    }
  }, [voice.finalText, voice.finalSeq, phase]);

  useEffect(() => {
    if (voice.error) notify(voice.error, "error");
  }, [voice.error, notify]);

  // 当前问题自动朗读：每个问题只播一次；切换问题时不重复
  useEffect(() => {
    const q = session?.current_question;
    if (!q || phase !== "active" || !speechEnabled || !autoRead) return;
    if (autoSpokenRef.current === q.id) return;
    autoSpokenRef.current = q.id;
    speak({ key: `interview:${session?.session_id}:${q.id}`, text: q.text });
  }, [session?.current_question, session?.session_id, phase, speechEnabled, autoRead]);

  function toggleVoice() {
    if (voice.listening) {
      voice.stop();
      return;
    }
    if (!voice.supported) {
      notify(
        isWeChatBrowser()
          ? WECHAT_SPEECH_HINT
          : "当前浏览器不支持语音输入，建议使用 Chrome / Edge",
        "error"
      );
      return;
    }
    // 先征求意见：允许后才真正开启麦克风；启动失败由 hook 统一提示
    requestPermission("microphone", () => {
      stopSpeech(); // 录音期间暂停页面朗读，避免把系统声音识别成回答
      voice.start();
    });
  }

  /** 故障照片：沿用现有上传与看图能力；仅描述阶段可换图 */
  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    const invalid = validatePhoto(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const compressed = await compressImage(file);
      const preview = await fileToDataUrl(compressed);
      setPhotoPreview(preview);
      try {
        const res = await uploadDiagnosisPhoto(compressed);
        setPhotoId(res.id);
      } catch {
        setPhotoId(null);
        setPhotoError("照片上传失败：仅本地预览，不参与最终看图诊断");
      }
    } catch {
      setPhotoError("图片处理失败，请换一张试试");
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    setPhotoId(null);
    setPhotoPreview(null);
    setPhotoError(null);
  }

  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      const detail = err.detail as
        | { code?: string; message?: string; risk?: { matched?: string[]; level?: string } }
        | undefined;
      if (detail?.code === "high_risk_blocked") {
        stopSpeech();
        setRiskText(
          (detail.risk?.matched ?? []).join("、") ||
            "检测到高风险描述，已停止普通追问。请先断电并联系专业人员。"
        );
        setPhase("error");
        return;
      }
      setError(detail?.message || err.message);
      return;
    }
    setError("服务暂时不可用，请稍后重试");
  }

  async function start() {
    if (authStatus !== "authenticated") {
      setError("登录后才能使用动态追问；你输入的内容仍保留在本页");
      return;
    }
    if (!description.trim()) {
      setError("请先描述故障情况，例如模式、风量、过滤网状态");
      return;
    }
    setBusy(true);
    setError(null);
    setRiskText(null);
    stopSpeech();
    try {
      const s = await startInterview({
        category: "ac",
        symptom: "not_cooling",
        description: description.trim(),
        photo_id: photoId,
      });
      latestSessionIdRef.current = s.session_id;
      setSession(s);
      setPhase(s.status !== "active" || !s.current_question ? "done" : "active");
      setAnswerText("");
      setOptionId(null);
      setAnswerSource("text");
      requestIdRef.current = `ans-${Date.now()}-${Math.random()}`;
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  function chooseOption(option: InterviewOption) {
    setOptionId(option.id);
    setAnswerText(option.unknown ? "不知道／没试过" : option.label);
    setAnswerSource("option");
  }

  async function submitAnswer() {
    if (!session?.current_question) return;
    if (!answerText.trim()) {
      setError("回答不能为空；不知道也可以选择“不知道／没试过”");
      return;
    }
    setBusy(true);
    setError(null);
    stopSpeech();
    if (voice.listening) voice.stop();
    const answeredSessionId = session.session_id;
    try {
      const next = await answerInterview(session.session_id, {
        question_id: session.current_question.id,
        answer: answerText.trim(),
        option_id: optionId,
        input_source: answerSource,
        request_id: requestIdRef.current,
        session_version: session.version,
      });
      // 返回重开后，旧会话的迟到响应不能覆盖新会话
      if (latestSessionIdRef.current !== answeredSessionId) return;
      setSession(next);
      setPhase(next.current_question ? "active" : "done");
      setAnswerText("");
      setOptionId(null);
      setAnswerSource("text");
      requestIdRef.current = `ans-${Date.now()}-${Math.random()}`;
    } catch (err) {
      // 失败保留当前回答与轮次，允许用同一个 request_id 重试
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  async function finishEarly() {
    if (!session) return;
    setBusy(true);
    setError(null);
    stopSpeech();
    try {
      const done = await finishInterview(session.session_id, session.version);
      setSession(done);
      setPhase("done");
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  function buildQa(s: InterviewState): QAPair[] {
    return s.qa.map((a) => ({
      questionId: a.question_id,
      questionText: a.question_text,
      answer: a.answer,
      unknown: a.unknown,
      inputSource: a.input_source,
      selectionSource: a.selection_source ?? undefined,
    }));
  }

  async function generate() {
    if (!session) return;
    setPhase("generating");
    setError(null);
    stopSpeech();
    try {
      const result = await generateAIDiagnosis(
        {
          category: "ac",
          symptom: "制冷效果变差",
          description,
          qa: buildQa(session),
          device: null,
          photoId: session.photo_id ?? photoId,
        },
        elder ? "elder" : "standard"
      );
      if (result.ok) {
        if (draftKey) localStorage.removeItem(draftKey);
        saveDiagnosis(result.diagnosis);
        notify("已生成建议；报告会保留本次问答来源", "success");
        navigate(`/diagnosis/${result.diagnosis.id}/result`);
        return;
      }
      if (result.kind === "interception") {
        setRiskText(
          result.interception.matched?.join("、") ||
            "检测到高风险描述，请先按安全提示处理。"
        );
        setPhase("error");
        return;
      }
      setError(result.error.message || "AI 诊断未成功，未回退模板，请稍后重试");
      setPhase("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "生成建议失败，请重试");
      setPhase("done");
    }
  }

  function restart() {
    stopSpeech();
    if (draftKey) localStorage.removeItem(draftKey);
    latestSessionIdRef.current = null;
    setSession(null);
    setPhase("describe");
    setAnswerText("");
    setOptionId(null);
    setError(null);
    setRiskText(null);
    setDescription("");
    removePhoto();
  }

  if (authStatus !== "authenticated") {
    return (
      <SectionCard title="需要登录">
        <p className="text-sm text-stone-600">动态追问需要保存会话与问答归属，请先登录。</p>
        <div className="mt-2 flex gap-2">
          <Link to="/login"><Button>去登录</Button></Link>
          <Button variant="secondary" onClick={() => navigate("/diagnose")}>返回普通问诊</Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/diagnose" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> 返回问诊
      </Link>
      <PageHeader
        title="空调不制冷 · 动态追问"
        subtitle="由大模型根据完整对话决定下一问；最多 6 轮，未知不会当成正常"
      />

      {phase === "error" && riskText && (
        <div role="alert" className="rounded-xl border border-risk-high-border bg-risk-high-bg p-4 text-sm text-risk-high-deep">
          <p className="font-semibold">已中止普通追问</p>
          <p className="mt-1">检测到：{riskText}</p>
          <p className="mt-1">请先断电、远离烟雾或焦味，并联系专业人员；不要拆机或接触内部电路。</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={restart}>重新开始</Button>
        </div>
      )}

      {phase !== "error" && (
      <SectionCard title="1. 先描述你看到的情况">
        <p className="mb-2 text-xs text-stone-500">
          例如：开的是制冷模式、温度调到 22 度、过滤网刚洗过、风量正常。已经说清的内容不会再问。
        </p>
        <textarea
          value={description + (voice.listening ? voice.interimText : "")}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          disabled={phase !== "describe"}
          className={[
            "w-full rounded-xl border px-3 py-2 text-sm",
            voice.listening
              ? "border-red-300 bg-red-50/40"
              : "border-stone-300",
          ].join(" ")}
          placeholder={
            voice.listening
              ? "正在聆听…说完点「停止语音输入」"
              : "用一两句话描述空调的情况，也可以点麦克风说"
          }
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="dynamic-photo-input"
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            disabled={photoBusy || phase !== "describe"}
            onChange={(e) => {
              void handlePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {phase === "describe" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={photoBusy}
                onClick={() =>
                  requestPermission("photo", () =>
                    document.getElementById("dynamic-photo-input")?.click()
                  )
                }
              >
                {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {photoBusy ? "正在上传…" : "上传故障照片（可选）"}
              </Button>
              {(photoId != null || photoPreview) && (
                <Button variant="ghost" size="sm" onClick={removePhoto}>
                  移除照片
                </Button>
              )}
            </>
          )}
          {photoPreview && (
            <img
              src={photoPreview}
              alt="故障照片预览"
              className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
            />
          )}
          {photoId != null && (
            <span className="text-xs text-risk-low">照片已上传，将随最终诊断用于看图分析</span>
          )}
          {!photoPreview && photoId != null && (
            <span className="text-xs text-stone-500">已关联照片 #{photoId}</span>
          )}
          {photoError && <span className="text-xs text-risk-high">{photoError}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {phase === "describe" && (
            <>
              <Button variant={voice.listening ? "danger" : "secondary"} size="sm" onClick={toggleVoice}>
                {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voice.listening ? "停止语音输入" : "语音描述"}
              </Button>
              <Button onClick={() => void start()} disabled={busy || !description.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "开始中…" : "开始动态追问"}
              </Button>
            </>
          )}
          {phase !== "describe" && (
            <Button variant="secondary" size="sm" onClick={restart}>重新描述</Button>
          )}
        </div>
      </SectionCard>
      )}

      {session && phase !== "error" && (
        <SectionCard title={`2. 追问（${session.round}/${session.max_rounds} 轮）`}>
          {session.current_question && phase === "active" ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className={`font-semibold text-stone-900 ${elder ? "text-lg" : "text-base"}`}>
                    {session.current_question.text}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">用途：{session.current_question.purpose}</p>
                </div>
                <SpeakButton
                  text={session.current_question.text}
                  speechKey={`interview-manual:${session.session_id}:${session.current_question.id}`}
                  elder={elder}
                />
              </div>
              {session.selection_source === "model" && (
                <p className="mt-2 text-xs text-stone-400">
                  本题由大模型根据当前对话生成（第 {session.round + 1} 问）
                </p>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {session.current_question.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => chooseOption(o)}
                    className={[
                      "rounded-xl border px-3 py-2 text-left text-sm",
                      optionId === o.id
                        ? "border-brand-500 bg-brand-50 text-brand-800"
                        : "border-stone-200 hover:border-brand-300",
                    ].join(" ")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[240px] flex-1 text-sm">
                  <span className="mb-1 block text-stone-700">回答（可修改语音转写）</span>
                  <input
                    value={answerText + (voice.listening ? voice.interimText : "")}
                    onChange={(e) => {
                      setAnswerText(e.target.value);
                      // 修改语音转写仍算语音来源；从选项改为文字输入则记为文字
                      setAnswerSource((prev) => (prev === "voice" ? "voice" : "text"));
                    }}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-sm",
                      voice.listening
                        ? "border-red-300 bg-red-50/40"
                        : "border-stone-300",
                    ].join(" ")}
                    placeholder={voice.listening ? "正在聆听…说完点「停止录音」" : "点选项或直接输入；不知道也可以"}
                  />
                </label>
                <Button variant={voice.listening ? "danger" : "secondary"} onClick={toggleVoice}>
                  {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {voice.listening ? "停止录音" : "语音回答"}
                </Button>
                <Button onClick={() => void submitAnswer()} disabled={busy || !answerText.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  提交回答
                </Button>
              </div>
              <div className="mt-3">
                <Button variant="ghost" size="sm" onClick={() => void finishEarly()} disabled={busy || session.round === 0}>
                  基于现有信息生成建议（可能信息不足）
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-stone-800">
                {session.end_reason ? END_REASON_LABELS[session.end_reason] ?? session.end_reason : "追问已结束"}
              </p>
              <p className="text-xs text-stone-500">
                已问 {session.qa.length} 题；本会话实际调用大模型 {session.model_calls} 次，累计等待{" "}
                {Math.round(session.model_latency_ms / 100) / 10} 秒。未知信息会如实写入报告，不会当作正常。
              </p>

              {session.recommendation && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm">
                  <p className="font-medium text-brand-800">诊断方向（大模型生成，保留不确定性）</p>
                  <p className="mt-1 text-stone-700">{session.recommendation.summary}</p>
                  {session.recommendation.possible_causes.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-stone-600">
                      {session.recommendation.possible_causes.map((c) => (
                        <li key={c.title}>
                          <span className="font-medium">{c.title}</span>
                          {c.description ? `：${c.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {session.recommendation.next_steps.length > 0 && (
                    <>
                      <p className="mt-2 font-medium text-stone-700">下一步</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-stone-600">
                        {session.recommendation.next_steps.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {session.cannot && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">目前无法继续判断</p>
                  <p className="mt-1">{session.cannot.reason}</p>
                  <p className="mt-1">建议：{session.cannot.next_step}</p>
                </div>
              )}

              {session.conflicts.length > 0 && (
                <div className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
                  <p className="font-medium">前后描述中仍有矛盾（未强行合并）</p>
                  <ul className="mt-1 list-disc pl-4">
                    {session.conflicts.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}

              {session.unknown_information.length > 0 && (
                <div className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
                  <p className="font-medium">尚未确认</p>
                  <ul className="mt-1 list-disc pl-4">
                    {session.unknown_information.map((u) => <li key={u}>{u}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {session.end_reason !== "model_cannot" && (
                  <Button
                    onClick={() => void generate()}
                    disabled={session.recommendation == null && session.qa.length === 0}
                  >
                    <Sparkles className="h-4 w-4" /> 生成完整报告
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setShowFacts((v) => !v)}>
                  {showFacts ? "收起问答记录" : "查看问答与来源"}
                </Button>
                {session.end_reason === "model_cannot" && (
                  <Button variant="secondary" onClick={restart}>补充信息后重新开始</Button>
                )}
              </div>
              {session.known_information.length > 0 && (
                <p className="text-xs text-stone-400">
                  AI 整理已了解：{session.known_information.join("；")}（仅作对话摘要，最终依据仍来自原回答）
                </p>
              )}
              {showFacts && (
                <div className="space-y-2">
                  {session.qa.map((a) => (
                    <div key={a.question_id + a.asked_at} className="rounded-lg border border-stone-200 p-2 text-xs">
                      <p className="font-medium text-stone-800">{a.question_text}</p>
                      <p className="mt-1 text-stone-600">回答：{a.answer}{a.unknown ? "（不知道）" : ""}</p>
                      <p className="mt-0.5 text-stone-400">
                        来源：{a.input_source === "voice" ? "语音" : a.input_source === "option" ? "选项" : "文字"}
                        {a.selection_source === "model" ? " · 选题：大模型生成" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {phase === "generating" && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在使用追问信息生成建议…
        </p>
      )}

      {error && phase !== "error" && (
        <div role="alert" className="rounded-xl border border-risk-high-border bg-risk-high-bg p-3 text-sm text-risk-high-deep">
          {error}
          {session?.status === "active" && <Button size="sm" variant="secondary" className="ml-2" onClick={() => void submitAnswer()}>重试回答</Button>}
          {session && session.current_question == null && <Button size="sm" className="ml-2" onClick={() => void generate()}>重试生成</Button>}
        </div>
      )}
    </div>
  );
}

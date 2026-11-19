import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mic, MicOff, Send, Sparkles } from "lucide-react";

import Button from "../components/Button";
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
  startInterview,
  type InterviewOption,
  type InterviewState,
} from "../services/api";
import { generateAIDiagnosis } from "../services/diagnosisService";
import { speak, stopSpeech } from "../services/speech";
import type { QAPair } from "../types/diagnosis";

type Phase = "describe" | "active" | "done" | "generating" | "error";

const END_REASON_LABELS: Record<string, string> = {
  enough_info: "信息已足够，提前结束",
  max_rounds: "已达到 4 轮上限",
  user_finish: "你选择基于现有信息生成建议",
  filter_actionable: "滤网明显脏且风量正常，先建议清洗",
  safety_interception: "高风险，已中止普通问诊",
};

export default function DynamicInterview() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const authStatus = useAuthStore((s) => s.status);
  const elder = usePrefs((s) => s.mode === "elder");
  const autoRead = usePrefs((s) => s.autoRead);
  const speechEnabled = usePrefs((s) => s.voiceEnabled);
  const saveDiagnosis = useDiagnosisStore((s) => s.saveDiagnosis);

  const [phase, setPhase] = useState<Phase>("describe");
  const [description, setDescription] = useState("");
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
  const voiceConsumedRef = useRef("");

  // 语音转写只填入可编辑输入框，必须由用户确认后才提交
  useEffect(() => {
    if (!voice.finalText || voice.finalText === voiceConsumedRef.current) return;
    voiceConsumedRef.current = voice.finalText;
    if (phase === "describe") {
      setDescription((prev) => (prev ? `${prev}${voice.finalText}` : voice.finalText));
    } else if (phase === "active") {
      setAnswerText((prev) => (prev ? `${prev}${voice.finalText}` : voice.finalText));
      setAnswerSource("voice");
    }
    voice.clear();
  }, [voice.finalText, voice.clear, phase]);

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
      notify("当前浏览器不支持语音输入，建议使用 Chrome / Edge", "error");
      return;
    }
    stopSpeech(); // 录音期间暂停页面朗读，避免把系统声音识别成回答
    if (!voice.start()) notify("语音识别启动失败，请稍后再试", "error");
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
      });
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
    setAnswerText(option.value === "unknown" ? "不知道／没试过" : option.label);
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
    try {
      const next = await answerInterview(session.session_id, {
        question_id: session.current_question.id,
        answer: answerText.trim(),
        option_id: optionId,
        input_source: answerSource,
        request_id: requestIdRef.current,
        session_version: session.version,
      });
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
          photoId: null,
        },
        elder ? "elder" : "standard"
      );
      if (result.ok) {
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
    setSession(null);
    setPhase("describe");
    setAnswerText("");
    setOptionId(null);
    setError(null);
    setRiskText(null);
    setDescription("");
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
        subtitle="系统根据你已说清的信息决定下一问；最多 4 轮，未知不会当成正常"
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          disabled={phase !== "describe"}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
          placeholder="用一两句话描述空调的情况，也可以点麦克风说"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {phase === "describe" && (
            <>
              <Button variant="secondary" size="sm" onClick={toggleVoice}>
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
        {(voice.listening || voice.interimText) && (
          <p className="mt-2 text-xs text-stone-500">识别中：{voice.interimText || "请开始说话…"}</p>
        )}
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
              {session.selection_source === "rule_fallback" && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  模型不可用，本题由规则选择，不是模型生成；可继续回答或稍后重试。
                </p>
              )}
              {session.selection_source === "rule" && (
                <p className="mt-2 text-xs text-stone-400">本题由确定性规则选择</p>
              )}
              {session.selection_source === "model" && (
                <p className="mt-2 text-xs text-stone-400">
                  本题由模型在允许的问题中选择
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
                    value={answerText}
                    onChange={(e) => {
                      setAnswerText(e.target.value);
                      setAnswerSource("text");
                    }}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    placeholder="点选项或直接输入；不知道也可以"
                  />
                </label>
                <Button variant="secondary" onClick={toggleVoice}>
                  {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {voice.listening ? "停止录音" : "语音回答"}
                </Button>
                <Button onClick={() => void submitAnswer()} disabled={busy || !answerText.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  提交回答
                </Button>
              </div>
              {(voice.listening || voice.interimText) && (
                <p className="mt-2 text-xs text-stone-500">
                  识别中：{voice.interimText || "请开始说话…"}（识别结果需确认后再提交）
                </p>
              )}
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
                已问 {session.qa.length} 题；未知信息会如实写入报告，不会当作正常。
              </p>
              {session.unknown_information.length > 0 && (
                <div className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
                  <p className="font-medium">尚未确认</p>
                  <ul className="mt-1 list-disc pl-4">
                    {session.unknown_information.map((u) => <li key={u}>{u}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void generate()} disabled={session.qa.length === 0}>
                  <Sparkles className="h-4 w-4" /> 生成建议
                </Button>
                <Button variant="secondary" onClick={() => setShowFacts((v) => !v)}>
                  {showFacts ? "收起问答记录" : "查看问答与来源"}
                </Button>
              </div>
              {showFacts && (
                <div className="space-y-2">
                  {session.qa.map((a) => (
                    <div key={a.question_id + a.asked_at} className="rounded-lg border border-stone-200 p-2 text-xs">
                      <p className="font-medium text-stone-800">{a.question_text}</p>
                      <p className="mt-1 text-stone-600">回答：{a.answer}{a.unknown ? "（不知道）" : ""}</p>
                      <p className="mt-0.5 text-stone-400">
                        来源：{a.input_source === "voice" ? "语音" : a.input_source === "option" ? "选项" : "文字"}
                        {a.selection_source
                          ? ` · 选题：${a.selection_source === "model" ? "模型" : a.selection_source === "rule" ? "规则" : "规则回退"}`
                          : ""}
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

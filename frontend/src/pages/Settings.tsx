import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Camera, LogIn, Volume2 } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import AIMessageBubble from "../components/AIMessageBubble";
import ConfirmDialog from "../components/ConfirmDialog";
import InputField from "../components/InputField";
import { useMediaPermission } from "../components/MediaPermission";
import ModalDialog from "../components/ModalDialog";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import {
  RadioGroup,
  SegmentedControl,
  SettingsRow,
  SliderControl,
  SwitchControl,
} from "../components/SettingsControl";
import { useToast } from "../components/Toast";
import {
  usePrefs,
  type ContrastLevel,
  type FontScale,
} from "../stores/prefs";
import { useAuthStore } from "../stores/authStore";
import { useAvatarStore } from "../stores/avatarStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useNotificationStore } from "../stores/notifications";
import { useRepairStore } from "../stores/repairStore";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import { useTicketStore } from "../stores/ticketStore";
import { countLocalHistory, importLocalHistory } from "../services/cloudSync";
import {
  initSpeech,
  selectSpeechVoice,
  speak,
  stopSpeech,
  useSpeech,
} from "../services/speech";
import { compressAvatar, validatePhoto } from "../utils/image";
import { loginHref } from "../utils/redirect";

type SaveState = "idle" | "saving" | "saved";

/** 本机数据分类：key 与各 zustand persist 的存储名一一对应 */
const LOCAL_DATA_GROUPS = [
  {
    key: "fixitai-prefs",
    label: "界面偏好",
    desc: "字体缩放、对比度、长辈关怀模式、朗读与免打扰设置",
    clear: () => usePrefs.getState().reset(),
  },
  {
    key: "fixitai-diagnosis",
    label: "诊断草稿与报告副本",
    desc: "本机保存的诊断草稿、问诊对话与报告副本",
    clear: () => useDiagnosisStore.getState().clearAll(),
  },
  {
    key: "fixitai-repairs",
    label: "维修记录副本",
    desc: "本机保存的维修档案与费用记录",
    clear: () => useRepairStore.getState().clearAll(),
  },
  {
    key: "fixitai-avatars",
    label: "本机头像",
    desc: "按账号保存的头像图片，仅存于本机浏览器",
    clear: () => useAvatarStore.setState({ avatars: {} }),
  },
  {
    key: "fixitai-notifications",
    label: "站内消息",
    desc: "诊断完成、报修状态等站内提醒",
    clear: () => useNotificationStore.getState().clearAll(),
  },
  {
    key: "fixitai-tickets",
    label: "本机报修流程缓存",
    desc: "报修流程记录在本机的缓存副本",
    clear: () => useTicketStore.getState().clearAll(),
  },
  {
    key: "fixitai-maintenance",
    label: "保养提醒记录",
    desc: "本机保存的设备保养记录与到期提醒进度",
    clear: () => useMaintenanceStore.getState().clearAll(),
  },
] as const;

/** localStorage 占用估算（UTF-16 每字符约 2 字节） */
function localSizeText(key: string): string {
  const raw = localStorage.getItem(key);
  if (!raw) return "无数据";
  const bytes = raw.length * 2;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

/** P9 个人设置（对照「智修AI长辈关怀设置界面.png」） */
export default function Settings() {
  const prefs = usePrefs();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const updateNickname = useAuthStore((s) => s.updateNickname);
  const changePassword = useAuthStore((s) => s.changePassword);
  const setAvatar = useAvatarStore((s) => s.setAvatar);
  const avatarUrl = useAvatarStore((s) =>
    user ? (s.avatars[user.id] ?? null) : null,
  );
  /** 访问照片前先弹窗征得用户同意 */
  const requestPermission = useMediaPermission();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /** 选择头像图片 → 校验 → 方形压缩 128px → 按账号保存（本地） */
  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许再次选择同一文件
    if (!file || !user) return;
    const err = validatePhoto(file);
    if (err) {
      notify(err, "error");
      return;
    }
    try {
      setAvatar(user.id, await compressAvatar(file));
      notify("头像已更新", "success");
    } catch {
      notify("头像处理失败，请换一张试试", "error");
    }
  }

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<number | null>(null);
  const firstRun = useRef(true);

  const [clearOpen, setClearOpen] = useState(false);
  /** 开启消息免打扰后的说明弹窗 */
  const [dndNoticeOpen, setDndNoticeOpen] = useState(false);
  /** 开启自动朗读后的提醒弹窗 */
  const [autoReadNoticeOpen, setAutoReadNoticeOpen] = useState(false);
  /** 修改密码的二次确认弹窗 */
  const [pwdConfirmOpen, setPwdConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  /** 删除某类本机数据后触发重算占用 */
  const [dataVersion, setDataVersion] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  // 本机历史（未归属账号的旧记录），可主动导入当前账号
  const diagnosisHistory = useDiagnosisStore((s) => s.history);
  const repairRecords = useRepairStore((s) => s.records);
  const localCounts = countLocalHistory(diagnosisHistory, repairRecords);

  // 浏览器语音合成状态（异步加载音色，不在设置里假装已开启）
  const speechSupported = useSpeech((s) => s.supported);
  const speechReady = useSpeech((s) => s.ready);
  const speechStatus = useSpeech((s) => s.status);
  const speechActiveKey = useSpeech((s) => s.activeKey);
  const speechError = useSpeech((s) => s.error);
  const speechVoices = useSpeech((s) => s.voices);
  const speechNoZh = useSpeech((s) => s.noZhVoice);
  const audioSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined";
  const testKey = "settings:test";
  const testActive = speechStatus === "speaking" && speechActiveKey === testKey;

  useEffect(() => {
    initSpeech();
  }, []);

  const testText = `您好，这是修必达的语音朗读测试。当前语速为 ${prefs.speechRate.toFixed(1)} 倍。`;

  function handleVoiceToggle(next: boolean) {
    prefs.setVoiceEnabled(next);
    if (!next) {
      // 关闭语音时同步关闭自动朗读并立即停止当前朗读
      prefs.setAutoRead(false);
      stopSpeech();
    } else {
      initSpeech();
    }
  }

  function handleAutoToggle(next: boolean) {
    if (next && !prefs.voiceEnabled) prefs.setVoiceEnabled(true);
    prefs.setAutoRead(next);
    if (next) setAutoReadNoticeOpen(true);
  }

  function playTestVoice() {
    if (!audioSupported) {
      notify("当前浏览器不支持语音合成，文字内容仍可正常使用", "error");
      return;
    }
    if (!prefs.voiceEnabled) prefs.setVoiceEnabled(true);
    if (testActive) {
      stopSpeech();
      return;
    }
    const started = speak({ key: testKey, text: testText });
    if (!started) {
      window.setTimeout(() => {
        const state = useSpeech.getState();
        if (state.error) notify(state.error, "error");
      }, 100);
    }
  }

  // 账户资料 / 密码弹窗
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  // 顶栏菜单跳转打开对应弹窗
  useEffect(() => {
    const edit = params.get("edit");
    if (edit === "profile" && authStatus === "authenticated") {
      setNickname(user?.nickname ?? "");
      setAccountError(null);
      setProfileOpen(true);
    } else if (edit === "password" && authStatus === "authenticated") {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setAccountError(null);
      setPasswordOpen(true);
    }
  }, [params, authStatus, user?.nickname]);

  function closeEdit() {
    setProfileOpen(false);
    setPasswordOpen(false);
    setAccountError(null);
    if (params.get("edit")) {
      params.delete("edit");
      setParams(params, { replace: true });
    }
  }

  async function saveNickname() {
    const value = nickname.trim();
    if (!value) {
      setAccountError("昵称不能为空");
      return;
    }
    if (value.length > 32) {
      setAccountError("昵称最多 32 个字符");
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      await updateNickname(value);
      closeEdit();
      notify("昵称已更新", "success");
    } catch (e) {
      setAccountError((e as Error).message);
    } finally {
      setAccountBusy(false);
    }
  }

  /** 提交前先做前端校验；通过后弹出二次确认 */
  function validatePasswordForm(): boolean {
    if (currentPwd.length === 0) {
      setAccountError("请输入旧密码");
      return false;
    }
    if (newPwd.length < 8) {
      setAccountError("新密码至少 8 位");
      return false;
    }
    if (newPwd !== confirmPwd) {
      setAccountError("两次输入的新密码不一致");
      return false;
    }
    setAccountError(null);
    return true;
  }

  async function savePassword() {
    if (!validatePasswordForm()) return;
    setAccountBusy(true);
    try {
      const message = await changePassword(currentPwd, newPwd);
      setPasswordOpen(false);
      notify(message, "success");
      navigate("/login?reason=password_changed&returnTo=%2Fsettings", {
        replace: true,
      });
    } catch (e) {
      setAccountError((e as Error).message);
    } finally {
      setAccountBusy(false);
    }
  }

  async function runImport() {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const result = await importLocalHistory();
      setImportOpen(false);
      notify(
        `已导入 ${result.diagnoses} 份诊断报告、${result.repairs} 条维修记录`,
        "success"
      );
    } catch (e) {
      setImportOpen(false);
      notify(
        `导入失败：${(e as Error).message || "请稍后重试"}；本机数据未删除，可再次导入`,
        "error"
      );
    } finally {
      setImportBusy(false);
    }
  }

  /** 自动保存指示：任意偏好变化 → 保存中 → 已自动保存 */
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setSaveState("saved"), 600);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // 监听整份偏好对象变化
  }, [prefs]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="个人设置"
        actions={
          <span
            aria-live="polite"
            className={`text-xs ${saveState === "saved" ? "text-risk-low-deep" : "text-stone-400"}`}
          >
            {saveState === "saving" ? "保存中…" : saveState === "saved" ? "✓ 设置已自动保存" : ""}
          </span>
        }
      />

      {/* A. 用户资料（来自服务端会话；游客明确标注） */}
      <SectionCard title="用户资料">
        {authStatus === "authenticated" && user ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* 可点击更换的头像（方形压缩后按账号本地存储） */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    requestPermission("photo", () =>
                      avatarInputRef.current?.click()
                    )
                  }
                  className="group relative block h-12 w-12 cursor-pointer rounded-full"
                  title="点击更换头像"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="用户头像"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                      {user.nickname.slice(0, 1)}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera aria-hidden className="h-4 w-4" />
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {user.nickname}
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-normal text-brand-700">
                    已登录
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setNickname(user.nickname);
                  setAccountError(null);
                  setProfileOpen(true);
                }}
              >
                编辑昵称
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCurrentPwd("");
                  setNewPwd("");
                  setConfirmPwd("");
                  setAccountError(null);
                  setPasswordOpen(true);
                }}
              >
                修改密码
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                游客演示
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">
                  未登录
                </span>
              </p>
              <p className="mt-1 text-sm text-stone-600">
                当前可体验诊断和只读演示设备。登录后可保存自己的设备、昵称和账号数据。
              </p>
            </div>
            <Link to={loginHref("/settings")} className={buttonClass("primary", "md")}>
              <LogIn className="h-4 w-4" /> 登录 / 注册
            </Link>
          </div>
        )}
      </SectionCard>

      {/* B2. 消息通知：免打扰开关（长辈模式隐藏，通知铃铛在长辈模式下也不显示） */}
      <div data-elder="hide">
        <SectionCard title="消息通知">
          <SwitchControl
            label="消息免打扰"
            checked={prefs.doNotDisturb}
            onChange={(v) => {
              prefs.setDoNotDisturb(v);
              if (v) setDndNoticeOpen(true);
            }}
          />
        </SectionCard>
        <ModalDialog
          open={dndNoticeOpen}
          title="已开启消息免打扰"
          description="开启后诊断完成、高风险告警、工单进展等新消息不再弹窗、也不播放提示音，仅保留右上角铃铛的未读小红点，随时可在通知中心查看"
          onClose={() => setDndNoticeOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setDndNoticeOpen(false)}>
              知道了
            </Button>
          }
        />
      </div>

      {/* B. 使用模式 */}
      <SectionCard title="使用模式">
        <RadioGroup
          name="display-mode"
          value={prefs.mode}
          onChange={(v) => prefs.setMode(v === "elder" ? "elder" : "standard")}
          options={[
            { value: "standard", label: "标准模式" },
            { value: "elder", label: "长辈关怀模式" },
          ]}
        />
      </SectionCard>

      {/* C. 显示设置 */}
      <SectionCard title="显示设置">
        <SettingsRow label="字体大小">
          <SegmentedControl<FontScale>
            value={prefs.fontScale}
            onChange={prefs.setFontScale}
            options={[
              { value: "normal", label: "标准" },
              { value: "large", label: "大号" },
              { value: "xlarge", label: "超大" },
            ]}
          />
        </SettingsRow>
        <div className="divide-y divide-stone-100 border-y border-stone-100">
          <SettingsRow label="页面缩放">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => prefs.setZoom(prefs.zoom - 10)} aria-label="缩小">
                −
              </Button>
              <span className="w-12 text-center text-sm font-medium text-stone-700">{prefs.zoom}%</span>
              <Button variant="secondary" size="sm" onClick={() => prefs.setZoom(prefs.zoom + 10)} aria-label="放大">
                +
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label="对比度">
            <SegmentedControl<ContrastLevel>
              value={prefs.contrast}
              onChange={prefs.setContrast}
              options={[
                { value: "normal", label: "标准" },
                { value: "high", label: "高对比" },
                { value: "extra", label: "更高对比" },
              ]}
            />
          </SettingsRow>
        </div>
      </SectionCard>

      {/* D. 语音设置 */}
      <SectionCard title="语音设置">
        <div className="divide-y divide-stone-100">
          <SwitchControl
            label="语音朗读"
            checked={prefs.voiceEnabled}
            onChange={handleVoiceToggle}
          />
          <SwitchControl
            label="自动朗读"
            checked={prefs.autoRead}
            onChange={handleAutoToggle}
          />
        </div>
        <div className="pt-3">
          {speechReady && speechVoices.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="speech-voice" className="text-sm text-stone-700">
                朗读音色
              </label>
              <select
                id="speech-voice"
                value={prefs.speechVoiceURI ?? ""}
                onChange={(e) => selectSpeechVoice(e.target.value || null)}
                className="w-64 max-w-[62%] rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-400 focus:outline-none"
              >
                <option value="">默认</option>
                {speechVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <SliderControl
            label="语速"
            min={0.5}
            max={2}
            step={0.1}
            value={prefs.speechRate}
            onChange={prefs.setSpeechRate}
            minLabel="慢"
            maxLabel="快"
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={playTestVoice}
            disabled={!audioSupported}
          >
            <Volume2 className="h-4 w-4" />
            {testActive ? "停止测试语音" : "播放测试语音"}
          </Button>
          {audioSupported && speechStatus === "speaking" && (
            <span aria-live="polite" className="ml-2 text-xs text-stone-500">
              正在播放…
            </span>
          )}
        </div>

        {/* 明确支持情况，避免“开关看似开启却完全无反馈” */}
        {(!audioSupported || !speechSupported || speechNoZh || speechError) && (
          <div className="mt-3 space-y-1 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
            {!audioSupported || !speechSupported ? (
              <p role="status">
                当前浏览器不支持语音合成，可改用最新版 Chrome / Edge / Safari。
              </p>
            ) : speechNoZh ? (
              <p role="status">未检测到中文音色，将尝试浏览器默认音色朗读。</p>
            ) : null}
            {speechError && <p role="status" className="text-amber-700">{speechError}</p>}
          </div>
        )}
        <ModalDialog
          open={autoReadNoticeOpen}
          title="已开启自动朗读"
          description="有新回复时会自动读一遍；在公共场合使用时可能需要注意一下，避免打扰到身边的人。"
          onClose={() => setAutoReadNoticeOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setAutoReadNoticeOpen(false)}>
              知道了
            </Button>
          }
        />
      </SectionCard>

      {/* E. 本机历史导入（仅登录后、且存在未归属记录时显示；长辈模式隐藏此高级操作） */}
      {authStatus === "authenticated" &&
        localCounts.diagnoses + localCounts.repairs > 0 && (
          <div data-elder="hide">
          <SectionCard title="本机历史">
            <p className="text-sm leading-relaxed text-stone-600">
              检测到本机还有 <strong>{localCounts.diagnoses}</strong> 份诊断报告、{" "}
              <strong>{localCounts.repairs}</strong> 条维修记录未归属任何账号。
              导入后会归属当前账号（<strong>{user?.username}</strong>）并保存到云端，
              其他设备登录同一账号可查看；本机原记录仍会保留。
            </p>
            <p className="mt-2 text-xs text-stone-400">
              旧设备无法可靠对应时只保留设备名称，不会强行绑定到现有设备；重复导入不会产生重复记录。
            </p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                导入本机历史
              </Button>
            </div>
            <ConfirmDialog
              open={importOpen}
              title="确认导入本机历史？"
              message={`将把 ${localCounts.diagnoses} 份诊断报告、${localCounts.repairs} 条维修记录导入账号 ${user?.username ?? ""} 并保存到云端。导入不会删除本机原数据，重复导入不会产生重复记录。`}
              confirmLabel={importBusy ? "导入中…" : "确认导入"}
              danger={false}
              onConfirm={() => void runImport()}
              onCancel={() => setImportOpen(false)}
            />
          </SectionCard>
          </div>
        )}

      {/* F. 隐私与数据 */}
      <SectionCard title="隐私与数据">
        <div className="flex flex-wrap gap-2">
          <Link to="/privacy" className={buttonClass("secondary", "md")}>
            隐私政策
          </Link>
          <Link to="/terms" className={buttonClass("secondary", "md")}>
            用户协议
          </Link>
          <Link to="/copyright" className={buttonClass("secondary", "md")}>
            版权说明
          </Link>
          <Link to="/data" className={buttonClass("secondary", "md")}>
            账号数据管理
          </Link>
          <Button variant="secondary" onClick={() => setDataOpen(true)}>
            管理本机数据
          </Button>
          <Button variant="secondary" onClick={() => setClearOpen(true)}>
            清除本机数据
          </Button>
          <Button
            variant="danger"
            className="bg-[#c1503c]! hover:bg-[#a94432]!"
            onClick={() => setDeleteOpen(true)}
          >
            注销账号
          </Button>
        </div>
        <ConfirmDialog
          open={clearOpen}
          title="确认清除本机数据？"
          message="将清除本机的偏好设置、头像、所有本机诊断草稿与维修记录。已保存到服务端的设备不会受影响。"
          confirmLabel="确认清除"
          onConfirm={() => {
            prefs.reset();
            useDiagnosisStore.getState().clearAll();
            useRepairStore.getState().clearAll();
            useNotificationStore.getState().clearAll();
            useTicketStore.getState().clearAll();
            useMaintenanceStore.getState().clearAll();
            useAvatarStore.setState({ avatars: {} });
            localStorage.removeItem("fixitai-diagnosis");
            localStorage.removeItem("fixitai-repairs");
            localStorage.removeItem("fixitai-notifications");
            localStorage.removeItem("fixitai-tickets");
            localStorage.removeItem("fixitai-maintenance");
            localStorage.removeItem("fixitai-avatars");
            setClearOpen(false);
            notify("本机数据已清除", "success");
          }}
          onCancel={() => setClearOpen(false)}
        />
        <ConfirmDialog
          open={deleteOpen}
          title="账号注销暂未开放"
          message="当前版本不提供账号注销服务，也不会删除你的设备或历史记录。如需停用账号，请退出登录。"
          confirmLabel="知道了"
          onConfirm={() => setDeleteOpen(false)}
          onCancel={() => setDeleteOpen(false)}
        />
        {/* 本机数据管理：按类别查看占用并单独删除（对应隐私政策「你的权利」） */}
        <ModalDialog
          open={dataOpen}
          title="管理本机数据"
          description="以下数据仅保存在当前浏览器，按类别删除不会影响已保存到账号云端的记录。"
          onClose={() => setDataOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setDataOpen(false)}>
              完成
            </Button>
          }
        >
          <ul key={dataVersion} className="divide-y divide-stone-100">
            {LOCAL_DATA_GROUPS.map((group) => {
              const size = localSizeText(group.key);
              const empty = size === "无数据";
              return (
                <li key={group.key} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800">{group.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{group.desc}</p>
                    <p className="mt-1 text-xs text-stone-400">占用：{size}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={empty}
                    onClick={() => {
                      group.clear();
                      localStorage.removeItem(group.key);
                      setDataVersion((v) => v + 1);
                      notify(`已清除「${group.label}」`, "success");
                    }}
                  >
                    删除
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
            设备档案、诊断报告与维修记录保存在服务端，仅当前账号可见；如需删除云端数据，请在对应页面删除，
            或通过《隐私政策》末节的联系方式提出申请。
          </p>
        </ModalDialog>
        {/* 隐私政策、用户协议与版权说明已升级为独立页面（页脚与上方按钮均可跳转） */}
      </SectionCard>

      {/* F. 长辈关怀模式展示（AI 回复对比，文案为设计稿原文；长辈模式下面板本身即示例，隐藏此演示） */}
      <div data-elder="hide">
      <SectionCard title="长辈关怀模式 · AI 回复对比">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">标准模式</p>
            <AIMessageBubble
              role="ai"
              content="该故障可能是由于电路板接触不良，建议您先检查电源连接是否正常。"
              tone="standard"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">长辈关怀模式</p>
            <AIMessageBubble
              role="ai"
              content="可能是电源插头没插好，您先检查一下插头和插座，看看有没有松动哦~"
              tone="elder"
            />
          </div>
        </div>
        <ul className="mt-4 grid gap-2 border-t border-stone-100 pt-3 text-sm text-stone-600 sm:grid-cols-3">
          <li>· 使用更通俗的语言</li>
          <li>· 提供更清晰的操作指引</li>
          <li>· 界面更简洁</li>
        </ul>
      </SectionCard>
      </div>

      {/* 编辑昵称 */}
      <ModalDialog
        open={profileOpen}
        title="编辑昵称"
        onClose={closeEdit}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={accountBusy}>
              取消
            </Button>
            <Button onClick={() => void saveNickname()} disabled={accountBusy}>
              {accountBusy ? "保存中…" : "保存昵称"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <InputField
            label="昵称"
            required
            maxLength={32}
            value={nickname}
            onChange={setNickname}
            error={accountError ?? undefined}
          />
        </div>
      </ModalDialog>

      {/* 修改密码 */}
      <ModalDialog
        open={passwordOpen}
        title="修改密码"
        onClose={closeEdit}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={accountBusy}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (validatePasswordForm()) setPwdConfirmOpen(true);
              }}
              disabled={accountBusy}
            >
              {accountBusy ? "提交中…" : "确认修改"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <InputField
            label="旧密码"
            required
            type="password"
            maxLength={128}
            value={currentPwd}
            onChange={setCurrentPwd}
          />
          <InputField
            label="新密码"
            required
            type="password"
            maxLength={128}
            description="至少 8 位"
            value={newPwd}
            onChange={setNewPwd}
          />
          <InputField
            label="确认新密码"
            required
            type="password"
            maxLength={128}
            value={confirmPwd}
            onChange={setConfirmPwd}
          />
          {accountError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {accountError}
            </p>
          )}
        </div>
      </ModalDialog>

      {/* 修改密码二次确认：改完即退出其他设备，先让用户确认一下 */}
      <ConfirmDialog
        open={pwdConfirmOpen}
        title="确认修改密码？"
        message="修改后旧密码会立即失效，其他设备上的登录也会退出，需要用新密码重新登录。确定现在修改吗？"
        confirmLabel="确认修改"
        danger={false}
        onConfirm={() => {
          setPwdConfirmOpen(false);
          void savePassword();
        }}
        onCancel={() => setPwdConfirmOpen(false)}
      />
    </div>
  );
}

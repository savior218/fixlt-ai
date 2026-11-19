import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, ShieldCheck, Volume2 } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import AIMessageBubble from "../components/AIMessageBubble";
import ConfirmDialog from "../components/ConfirmDialog";
import InputField from "../components/InputField";
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
  ZOOM_MAX,
  ZOOM_MIN,
} from "../stores/prefs";
import { useAuthStore } from "../stores/authStore";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useRepairStore } from "../stores/repairStore";
import { loginHref } from "../utils/redirect";

type SaveState = "idle" | "saving" | "saved";

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

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<number | null>(null);
  const firstRun = useRef(true);

  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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

  async function savePassword() {
    if (currentPwd.length === 0) {
      setAccountError("请输入旧密码");
      return;
    }
    if (newPwd.length < 8) {
      setAccountError("新密码至少 8 位");
      return;
    }
    if (newPwd !== confirmPwd) {
      setAccountError("两次输入的新密码不一致");
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
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
        subtitle="管理您的账号信息与使用偏好，让修必达更符合您的使用习惯。"
        actions={
          <span
            aria-live="polite"
            className={`text-xs ${saveState === "saved" ? "text-risk-low-deep" : "text-slate-400"}`}
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
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                {user.nickname.slice(0, 1)}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {user.nickname}
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-normal text-brand-700">
                    已登录
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">账号标识：{user.username}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  当前模式：{prefs.mode === "elder" ? "长辈关怀模式" : "标准模式"}
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
              <p className="text-sm font-semibold text-slate-900">
                游客演示
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">
                  未登录
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                当前可体验诊断和只读演示设备。登录后可保存自己的设备、昵称和账号数据。
              </p>
            </div>
            <Link to={loginHref("/settings")} className={buttonClass("primary", "md")}>
              <LogIn className="h-4 w-4" /> 登录 / 注册
            </Link>
          </div>
        )}
      </SectionCard>

      {/* B. 使用模式 */}
      <SectionCard title="使用模式">
        <RadioGroup
          name="display-mode"
          value={prefs.mode}
          onChange={(v) => prefs.setMode(v === "elder" ? "elder" : "standard")}
          options={[
            { value: "standard", label: "标准模式", description: "完整信息与操作" },
            {
              value: "elder",
              label: "长辈关怀模式",
              description: "不只是「大字体」：更贴心的表达、更清晰的操作引导、更简洁的界面",
            },
          ]}
        />
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-risk-low" />
          <p>
            安全说明：关怀模式只改变字体大小与表达方式，<span className="font-medium">不改变</span>
            AI 风险判断、危险操作拦截、高风险告警、安全规则与诊断依据。系统不会根据年龄自动开启关怀模式。
          </p>
        </div>
      </SectionCard>

      {/* C. 显示设置 */}
      <SectionCard title="显示设置">
        <SettingsRow label="字体大小" description="标准 / 大号 / 超大">
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
        <div className="divide-y divide-slate-100 border-y border-slate-100">
          <SettingsRow label="页面缩放" description={`${prefs.zoom}%（${ZOOM_MIN}% ~ ${ZOOM_MAX}%）`}>
            <div className="flex w-56 items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => prefs.setZoom(prefs.zoom - 10)} aria-label="缩小">
                −
              </Button>
              <span className="w-12 text-center text-sm font-medium text-slate-700">{prefs.zoom}%</span>
              <Button variant="secondary" size="sm" onClick={() => prefs.setZoom(prefs.zoom + 10)} aria-label="放大">
                +
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label="对比度" description="标准 / 高对比 / 更高对比">
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
        <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
          实时预览：上方设置即刻生效，本页与全站文字、按钮会立即变化。
        </p>
      </SectionCard>

      {/* D. 语音设置 */}
      <SectionCard title="语音设置">
        <div className="divide-y divide-slate-100">
          <SwitchControl
            label="语音朗读"
            description="将 AI 回复转为语音播报"
            checked={prefs.voiceEnabled}
            onChange={prefs.setVoiceEnabled}
          />
          <SwitchControl
            label="自动朗读"
            description="新消息到达时自动播放"
            checked={prefs.autoRead}
            onChange={prefs.setAutoRead}
          />
        </div>
        <div className="pt-3">
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
          <Button variant="secondary" size="sm" onClick={() => notify("语音功能开发中", "info")}>
            <Volume2 className="h-4 w-4" /> 播放测试语音
          </Button>
        </div>
      </SectionCard>

      {/* E. 隐私与数据 */}
      <SectionCard title="隐私与数据">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPrivacyOpen(true)}>
            隐私说明
          </Button>
          <Button variant="secondary" onClick={() => notify("个人数据管理为演示状态", "info")}>
            个人数据管理
          </Button>
          <Button variant="secondary" onClick={() => setClearOpen(true)}>
            清除本机数据
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            注销账号
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          账号注销功能暂未开放；本机历史与维修记录不会因登录或注册自动归属到新账号。
        </p>
        <ConfirmDialog
          open={clearOpen}
          title="确认清除本机数据？"
          message="将清除本机的偏好设置、所有本机诊断草稿与维修记录。已保存到服务端的设备不会受影响。"
          confirmLabel="确认清除"
          onConfirm={() => {
            prefs.reset();
            useDiagnosisStore.getState().clearAll();
            useRepairStore.getState().clearAll();
            localStorage.removeItem("fixitai-diagnosis");
            localStorage.removeItem("fixitai-repairs");
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
        {/* 隐私说明弹窗（比赛合规：涉及用户数据须提供基本隐私说明） */}
        <ModalDialog
          open={privacyOpen}
          title="修必达 FixIt AI · 隐私说明"
          description="我们如何收集、使用和保护你的数据"
          onClose={() => setPrivacyOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setPrivacyOpen(false)}>
              我已阅读
            </Button>
          }
        >
          <div className="space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              <strong>1. 收集的数据。</strong>
              为提供家电故障诊断服务，本产品会收集你主动填写的内容：设备信息（名称、品牌、型号、位置）、故障描述与问诊对话、维修记录，以及界面偏好设置（字体、缩放、对比度、长辈关怀模式等）。
            </p>
            <p>
              <strong>2. 数据的存储。</strong>
              界面偏好、诊断草稿与维修记录保存在你的浏览器本地，并按登录账号隔离；设备保存在服务端数据库中，只归当前登录账号所有。未归属的旧本机记录会独立保留为本机历史，不会自动归属新注册账号。
            </p>
            <p>
              <strong>3. AI 诊断说明。</strong>
              当你发起 AI 诊断时，故障描述与问诊对话会经由本产品服务端发送至智谱 GLM 大模型接口用于生成诊断内容；本产品不向 AI 服务发送你的账号信息，AI 服务商按其隐私政策处理请求数据。未配置 AI 服务时，诊断由本地规则引擎完成，数据不出本机。
            </p>
            <p>
              <strong>4. 数据安全。</strong>
              密码由服务端使用成熟哈希算法保存；登录令牌存放在 HttpOnly Cookie 中，不写入 localStorage。AI 服务密钥与会话密钥仅保存在服务端环境变量中，不随前端代码分发；产品不包含广告跟踪或第三方统计脚本。
            </p>
            <p>
              <strong>5. 你的控制权。</strong>
              你可以在本页「清除本机数据」随时删除本地保存的偏好、草稿与维修记录，也可以退出登录使当前会话失效。账号注销功能暂未开放。本版本不使用邮箱验证或手机号验证，也不会把未验证的信息标注为已验证。
            </p>
            <p className="text-xs text-slate-400">
              本说明与产品当前实际功能一致。功能更新导致数据处理方式变化时，我们将同步更新本说明。
            </p>
          </div>
        </ModalDialog>
      </SectionCard>

      {/* F. 长辈关怀模式展示（AI 回复对比，文案为设计稿原文） */}
      <SectionCard title="长辈关怀模式 · AI 回复对比">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">标准模式</p>
            <AIMessageBubble
              role="ai"
              content="该故障可能是由于电路板接触不良，建议您先检查电源连接是否正常。"
              tone="standard"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">长辈关怀模式</p>
            <AIMessageBubble
              role="ai"
              content="可能是电源插头没插好，您先检查一下插头和插座，看看有没有松动哦~"
              tone="elder"
            />
          </div>
        </div>
        <ul className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-3">
          <li>· 使用更通俗的语言</li>
          <li>· 提供更清晰的操作指引</li>
          <li>· 界面更简洁</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          注意：两种模式下风险判断与安全拦截完全一致，仅表达方式不同。
        </p>
      </SectionCard>

      {/* 编辑昵称 */}
      <ModalDialog
        open={profileOpen}
        title="编辑昵称"
        description="昵称仅用于展示，账号标识仍为用户名。"
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
            description="修改成功后刷新页面仍会保留。"
          />
          {user && (
            <p className="text-xs text-slate-500">账号标识：{user.username}</p>
          )}
        </div>
      </ModalDialog>

      {/* 修改密码 */}
      <ModalDialog
        open={passwordOpen}
        title="修改密码"
        description="修改成功后，旧密码和全部旧登录会话都会失效。"
        onClose={closeEdit}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={accountBusy}>
              取消
            </Button>
            <Button onClick={() => void savePassword()} disabled={accountBusy}>
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
    </div>
  );
}

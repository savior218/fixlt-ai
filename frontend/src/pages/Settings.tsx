import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Volume2 } from "lucide-react";

import Button from "../components/Button";
import AIMessageBubble from "../components/AIMessageBubble";
import ConfirmDialog from "../components/ConfirmDialog";
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
import { DEMO_USER } from "../types/user";
import { maskPhone } from "../utils/format";

type SaveState = "idle" | "saving" | "saved";

/** P9 个人设置（对照「智修AI长辈关怀设置界面.png」） */
export default function Settings() {
  const prefs = usePrefs();
  const { notify } = useToast();

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<number | null>(null);
  const firstRun = useRef(true);

  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        subtitle="管理您的账号信息与使用偏好，让智修AI更符合您的使用习惯。"
        actions={
          <span
            aria-live="polite"
            className={`text-xs ${saveState === "saved" ? "text-risk-low-deep" : "text-slate-400"}`}
          >
            {saveState === "saving" ? "保存中…" : saveState === "saved" ? "✓ 设置已自动保存" : ""}
          </span>
        }
      />

      {/* A. 用户资料（演示数据） */}
      <SectionCard title="用户资料">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
              {DEMO_USER.nickname.slice(0, 1)}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {DEMO_USER.nickname}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                  演示账号
                </span>
              </p>
              <p className="mt-0.5 text-sm text-slate-500">{maskPhone(DEMO_USER.phone)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                当前模式：{prefs.mode === "elder" ? "长辈关怀模式" : "标准模式"}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => notify("演示账号，编辑资料暂未开放", "info")}>
            编辑资料
          </Button>
        </div>
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
          用户体系（USER-001）接入前以演示账号运行，注销操作不会删除任何真实数据。
        </p>
        <ConfirmDialog
          open={clearOpen}
          title="确认清除本机数据？"
          message="将清除本机的偏好设置、诊断草稿与维修记录（演示数据），不影响后端已保存的设备信息。"
          confirmLabel="确认清除"
          onConfirm={() => {
            prefs.reset();
            localStorage.removeItem("fixitai-diagnosis");
            localStorage.removeItem("fixitai-repairs");
            setClearOpen(false);
            notify("本机数据已清除", "success");
          }}
          onCancel={() => setClearOpen(false)}
        />
        <ConfirmDialog
          open={deleteOpen}
          title="确认注销账号？"
          message="注销后无法恢复。当前为演示账号，此操作仅作流程演示。"
          confirmLabel="确认注销"
          onConfirm={() => {
            setDeleteOpen(false);
            notify("演示账号，注销流程暂未开放", "info");
          }}
          onCancel={() => setDeleteOpen(false)}
        />
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
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { Wrench } from "lucide-react";

import AIMessageBubble from "../components/AIMessageBubble";
import Button, { buttonClass } from "../components/Button";
import Chip from "../components/Chip";
import ConfirmDialog from "../components/ConfirmDialog";
import DeviceCard from "../components/DeviceCard";
import DiagnosisStepper from "../components/DiagnosisStepper";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import FilterBar from "../components/FilterBar";
import InputField from "../components/InputField";
import Loading from "../components/Loading";
import ModalDialog from "../components/ModalDialog";
import PageHeader from "../components/PageHeader";
import RiskAlert from "../components/RiskAlert";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import {
  RadioGroup,
  SegmentedControl,
  SettingsRow,
  SliderControl,
  SwitchControl,
  ZoomControl,
} from "../components/SettingsControl";
import StatusBadge, { STATUS_LABELS, type Status } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import Toggle from "../components/Toggle";
import { usePrefs } from "../stores/prefs";
import type { Device } from "../types/device";

const MOCK_DEVICE: Device = {
  id: 1,
  name: "客厅空调",
  category: "ac",
  brand: "格力",
  model: "KFR-35GW",
  purchaseDate: "2022-06-01",
  location: "客厅",
  imageUrl: null,
  note: null,
  createdAt: "2026-01-01T00:00:00",
};

export default function UiKit() {
  const { notify } = useToast();
  const { fontScale, setFontScale, mode } = usePrefs();

  const [chip, setChip] = useState<string>("不制冷");
  const [toggle, setToggle] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // InputField 演示
  const [text, setText] = useState("");
  const [textarea, setTextarea] = useState("");
  const [search, setSearch] = useState("");

  // DiagnosisStepper 演示
  const [step, setStep] = useState(1);

  // FilterBar 演示
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // SettingsControl 演示
  const [radio, setRadio] = useState("standard");
  const [segment, setSegment] = useState<"standard" | "elder">("standard");
  const [slider, setSlider] = useState(1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="UI 组件预览"
        subtitle="DEV-02 公共组件库 · TASK-04~15 全量状态参考"
        icon={<Wrench className="h-5 w-5" />}
        actions={
          <Link to="/" className={buttonClass("ghost", "sm")}>
            返回首页
          </Link>
        }
      />

      <SectionCard title="Button 按钮（TASK-07：primary/secondary 即可覆盖）">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">主要按钮</Button>
          <Button variant="secondary">次要按钮</Button>
          <Button variant="danger">危险按钮</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="primary" size="sm">小尺寸</Button>
          <Button variant="primary" size="lg">大尺寸</Button>
          <Button variant="primary" disabled>禁用</Button>
        </div>
      </SectionCard>

      <SectionCard title="StatusBadge 状态徽章（TASK-06：十种状态）">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="mt-3 border-t border-stone-100 pt-3">
          <p className="mb-2 text-xs text-stone-400">RiskBadge（旧组件，P3 前页面继续使用）：</p>
          <div className="flex flex-wrap gap-2">
            <RiskBadge level="low" />
            <RiskBadge level="medium" />
            <RiskBadge level="high" />
            <RiskBadge level="unknown" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="InputField 输入框（TASK-08：text / textarea / search）">
        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="设备名称"
            required
            placeholder="如：客厅空调"
            value={text}
            onChange={setText}
          />
          <InputField
            label="错误状态"
            error="名称不能为空"
            placeholder="必填校验示例"
            value=""
            onChange={() => {}}
          />
          <InputField
            label="备注"
            mode="textarea"
            rows={3}
            maxLength={200}
            placeholder="选填"
            value={textarea}
            onChange={setTextarea}
          />
          <div>
            <InputField
              label="搜索"
              mode="search"
              placeholder="搜索设备…"
              value={search}
              onChange={setSearch}
            />
            <div className="mt-3">
              <InputField label="禁用状态" disabled placeholder="不可编辑" value="" onChange={() => {}} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="DiagnosisStepper 诊断步骤条（TASK-13）">
        <DiagnosisStepper current={step} />
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setStep(Math.max(0, step - 1))}>
            上一步
          </Button>
          <Button size="sm" onClick={() => setStep(Math.min(3, step + 1))}>
            下一步
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={`RiskAlert 风险告警（TASK-12：当前全局模式 = ${mode}）`}>
        <div className="space-y-3">
          <RiskAlert level="high" description="涉及电路与制冷剂，自行拆机有触电与泄漏风险。" />
          <RiskAlert level="medium" description="操作前请务必断电，避免触电。" />
          <RiskAlert level="low" description="按引导步骤操作即可，注意工具安全。" />
        </div>
        <p className="mt-2 text-xs text-stone-400">
          长辈模式下标题自动替换为通俗文案（等级与拦截规则不变）。
        </p>
      </SectionCard>

      <SectionCard title="AIMessageBubble 对话气泡（TASK-11）">
        <div className="space-y-4 rounded-xl bg-stone-50 p-4">
          <AIMessageBubble
            role="ai"
            content="您好，请问是哪台设备出了问题？可以点击下方卡片快速选择。"
            time="14:30"
          />
          <AIMessageBubble
            role="ai"
            content=""
            loading
          />
          <AIMessageBubble
            role="user"
            content="客厅空调开了半小时还是不凉"
            time="14:31"
          />
          <AIMessageBubble
            role="ai"
            content="收到。请问最近有清洗过滤网吗？"
            time="14:31"
            suggestions={["没洗过", "上个月洗过", "不清楚怎么洗"]}
            onSuggestion={(s) => notify(`已选择：${s}`, "info")}
          />
        </div>
      </SectionCard>

      <SectionCard title="DeviceCard 设备卡片（TASK-10，点击跳转 P7）">
        <div className="grid gap-3 sm:grid-cols-2">
          <DeviceCard device={MOCK_DEVICE} status="normal" repairCount={2} onClick={() => notify("跳转设备详情（P4 阶段接入）", "info")} />
          <DeviceCard
            device={{ ...MOCK_DEVICE, id: 2, name: "宿舍冰箱", category: "fridge", brand: "海尔", location: "厨房", model: null }}
            status="pending"
            repairCount={0}
            onClick={() => notify("跳转设备详情（P4 阶段接入）", "info")}
          />
        </div>
      </SectionCard>

      <SectionCard title="FilterBar 筛选栏（TASK-14）">
        <FilterBar
          keyword={keyword}
          onKeywordChange={setKeyword}
          filters={[
            {
              label: "设备类型",
              value: category,
              onChange: setCategory,
              options: [
                { value: "all", label: "全部" },
                { value: "ac", label: "空调" },
                { value: "fridge", label: "冰箱" },
                { value: "washer", label: "洗衣机" },
              ],
            },
            {
              label: "状态",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "全部" },
                { value: "normal", label: "运行正常" },
                { value: "pending", label: "待处理" },
              ],
            },
          ]}
          onReset={() => {
            setKeyword("");
            setCategory("all");
            setStatusFilter("all");
          }}
        />
        <p className="mt-2 text-xs text-stone-400">
          当前筛选：{keyword || "（无关键词）"} · {category} · {statusFilter}
        </p>
      </SectionCard>

      <SectionCard title="SettingsControl 设置控件（TASK-15：switch / radio / segmented / slider / zoom）">
        <div className="divide-y divide-stone-100">
          <SwitchControl
            label="语音朗读"
            description="诊断结果自动朗读（switch）"
            checked={toggle}
            onChange={setToggle}
          />
          <div className="py-3">
            <p className="mb-1 text-sm font-medium text-stone-800">交互模式（radio）</p>
            <RadioGroup
              name="mode-demo"
              value={radio}
              onChange={setRadio}
              options={[
                { value: "standard", label: "标准模式", description: "完整信息与操作" },
                { value: "elder", label: "长辈关怀模式", description: "大字体、简信息、通俗文案" },
              ]}
            />
          </div>
          <div className="py-3">
            <p className="mb-2 text-sm font-medium text-stone-800">界面模式（segmented）</p>
            <SegmentedControl
              value={segment}
              onChange={setSegment}
              options={[
                { value: "standard", label: "标准" },
                { value: "elder", label: "长辈关怀" },
              ]}
            />
          </div>
          <SliderControl
            label="语音语速（slider）"
            min={0.5}
            max={2}
            step={0.1}
            value={slider}
            onChange={setSlider}
            minLabel="慢"
            maxLabel="快"
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
          <SettingsRow
            label="字号大小（zoom）"
            description={`当前：${fontScale}（联动全局偏好）`}
          >
            <ZoomControl value={fontScale} onChange={setFontScale} />
          </SettingsRow>
        </div>
      </SectionCard>

      <SectionCard title="弹窗（TASK-09：ModalDialog / ConfirmDialog）">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            通用弹窗
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            危险确认弹窗
          </Button>
        </div>
        <ModalDialog
          open={modalOpen}
          title="添加设备"
          description="信息将用于更精准的诊断建议"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>取消</Button>
              <Button onClick={() => { setModalOpen(false); notify("已保存", "success"); }}>保存</Button>
            </>
          }
        >
          <InputField label="设备名称" required placeholder="如：客厅空调" value={text} onChange={setText} />
        </ModalDialog>
        <ConfirmDialog
          open={confirmOpen}
          title="确认删除设备？"
          message="删除后无法恢复，该设备的诊断与维修记录仍会保留。"
          confirmLabel="确认删除"
          onConfirm={() => {
            setConfirmOpen(false);
            notify("设备已删除", "success");
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </SectionCard>

      <SectionCard title="Toast / Chip / Toggle / 状态组件">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => notify("操作成功", "success")}>成功提示</Button>
            <Button variant="secondary" onClick={() => notify("发生错误", "error")}>错误提示</Button>
            <Button variant="ghost" onClick={() => notify("普通信息", "info")}>普通提示</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {["不制冷", "噪音大", "漏水", "异味"].map((c) => (
              <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="divide-y divide-stone-100">
            <Toggle label="高对比度" description="开关控件示例" checked={toggle} onChange={setToggle} />
          </div>
          <div className="space-y-3">
            <Loading label="AI 分析中…" />
            <ErrorBanner message="图片上传失败，请检查网络后重试" onRetry={() => notify("已重试", "info")} />
            <EmptyState title="暂无记录" description="完成首次诊断后会自动展示" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

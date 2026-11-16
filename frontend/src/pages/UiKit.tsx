import { useState } from "react";
import { Link } from "react-router-dom";

import Button, { buttonClass } from "../components/Button";
import Chip from "../components/Chip";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import Loading from "../components/Loading";
import PageHeader from "../components/PageHeader";
import RiskBadge from "../components/RiskBadge";
import { useToast } from "../components/Toast";
import Toggle from "../components/Toggle";

export default function UiKit() {
  const { notify } = useToast();
  const [chip, setChip] = useState<string>("不制冷");
  const [toggle, setToggle] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div>
      <PageHeader title="UI 组件预览" subtitle="DEV-02 公共组件库 · 设计规范参考" />

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Button 按钮</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">主要按钮</Button>
          <Button variant="secondary">次要按钮</Button>
          <Button variant="danger">危险按钮</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="primary" size="sm">小尺寸</Button>
          <Button variant="primary" size="lg">大尺寸</Button>
          <Button variant="primary" disabled>禁用</Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Link 样式：<Link to="/" className={buttonClass("ghost", "sm")}>返回首页</Link></p>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">RiskBadge 风险等级</h2>
        <div className="flex flex-wrap gap-2">
          <RiskBadge level="low" />
          <RiskBadge level="medium" />
          <RiskBadge level="high" />
          <RiskBadge level="unknown" />
        </div>
        <p className="mt-2 text-xs text-slate-400">对应 PRD SAFE-001：低/中/高/待评估</p>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Chip 快速选择项</h2>
        <div className="flex flex-wrap gap-2">
          {["不制冷", "噪音大", "漏水", "异味"].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
              {c}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">已选：{chip}</p>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Toggle 开关</h2>
        <div className="divide-y divide-slate-100">
          <Toggle label="语音朗读" description="开关控件示例" checked={toggle} onChange={setToggle} />
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Toast 提示</h2>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => notify("操作成功", "success")}>成功提示</Button>
          <Button variant="secondary" onClick={() => notify("发生错误", "error")}>错误提示</Button>
          <Button variant="ghost" onClick={() => notify("普通信息", "info")}>普通提示</Button>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">ConfirmDialog 确认弹窗</h2>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>删除设备（演示）</Button>
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
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">状态组件</h2>
        <div className="space-y-3">
          <Loading label="AI 分析中…" />
          <ErrorBanner message="图片上传失败，请检查网络后重试" onRetry={() => notify("已重试", "info")} />
          <EmptyState title="暂无记录" description="完成首次诊断后会自动展示" />
        </div>
      </section>
    </div>
  );
}

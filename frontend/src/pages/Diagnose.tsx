import { useSearchParams } from "react-router-dom";

const PIPELINE_STEPS = [
  "识别设备（类别 / 品牌型号 / 铭牌）",
  "提取故障信息，检查完整性",
  "动态追问关键问题（每次一个问题）",
  "检索设备知识库",
  "分析可能原因（区分事实与推测）",
  "独立安全规则校验（高风险拦截）",
  "生成结构化诊断报告",
];

export default function Diagnose() {
  const [params] = useSearchParams();
  const preset = params.get("q") ?? "";
  const input = params.get("input"); // image | voice 预留入口

  return (
    <div>
      <h1 className="mb-2 text-lg font-bold">AI 智能诊断</h1>
      <p className="mb-5 text-sm text-slate-500">
        多轮诊断交互将在 DEV-04 / DEV-07 阶段接入。以下是本页将实现的诊断流水线（PRD 6.4）。
      </p>

      {preset && (
        <div className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          已带入问题描述：<span className="font-medium">{preset}</span>
        </div>
      )}
      {input && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600">
          {input === "image" ? "📷 图片输入" : "🎙️ 语音输入"}方式将在 DEV-06（AI 模型接入）后开放。
        </div>
      )}

      <ol className="space-y-2">
        {PIPELINE_STEPS.map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-800">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
        安全承诺：涉及冒烟起火、漏电触电、燃气泄漏、制冷剂系统、带电拆卸等高风险场景时，系统将立即停止常规维修指导并给出安全处置建议（SAFE-001，独立规则引擎校验，不依赖对话模型）。
      </p>
    </div>
  );
}

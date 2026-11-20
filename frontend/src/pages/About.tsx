import { Link } from "react-router-dom";
import {
  ClipboardList,
  MessageCircleQuestion,
  Refrigerator,
  ShieldCheck,
  Stethoscope,
  Wrench,
} from "lucide-react";

import SectionCard from "../components/SectionCard";

/** 产品核心能力（与首页、导航保持一致的业务口径） */
const FEATURES = [
  {
    icon: Stethoscope,
    title: "AI 智能诊断",
    desc: "通过对话式问诊与故障照片，一步步定位空调、冰箱、洗衣机等家电的故障原因，并给出风险等级与处理建议。",
  },
  {
    icon: Refrigerator,
    title: "设备档案管理",
    desc: "集中管理家中家电的品牌、型号与购买信息，诊断与报修自动带入，减少重复输入。",
  },
  {
    icon: Wrench,
    title: "智能报修引导",
    desc: "根据诊断结论生成报修单，跟随引导完成报修流程，重要安全风险会提示立即停机。",
  },
  {
    icon: ClipboardList,
    title: "维修档案沉淀",
    desc: "完整记录每次故障、维修方案与费用，形成设备维修历史，为后续诊断提供参考。",
  },
];

/** 关于修必达 */
export default function About() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* 产品简介 */}
      <SectionCard title="关于修必达 FixIt AI">
        <div className="space-y-3 text-sm leading-relaxed text-stone-700">
          <p>
            修必达 FixIt AI 是一款面向家庭用户的家电故障智能诊断与维修辅助产品。当家里的空调、冰箱、
            洗衣机出现异常时，你不需要专业知识，只需回答几个问题、拍一张故障照片，
            修必达就能帮你判断问题出在哪里、是否需要立即停机，并给出下一步的处理建议。
          </p>
          <p>
            我们希望把"找维修师傅之前的那一步"交给 AI：先弄清楚发生了什么，
            再决定是自己动手、联系售后，还是直接报修，避免多花冤枉钱，也避免小问题拖成大隐患。
          </p>
          <p className="text-xs text-stone-500">
            提示：AI 诊断结论仅供维修决策参考，涉及用电、燃气、高空作业等安全风险时，请务必联系专业人员处理。
          </p>
        </div>
      </SectionCard>

      {/* 核心能力 */}
      <SectionCard title="我们能做什么">
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="rounded-xl border border-stone-100 bg-stone-50/60 p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <f.icon className="h-4 w-4 text-brand-600" aria-hidden />
                {f.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{f.desc}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* 安全承诺 */}
      <SectionCard title="安全承诺">
        <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-sm leading-relaxed text-brand-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            修必达的账号与业务数据仅保存于本产品服务端数据库，不含广告跟踪与第三方统计脚本；
            诊断建议遵循"安全第一"原则，识别到高危故障时优先提示停机避险。
            详情见
            <Link to="/privacy" className="mx-1 font-medium underline">
              《隐私保护指引》
            </Link>
            与
            <Link to="/terms" className="mx-1 font-medium underline">
              《服务协议》
            </Link>
            。
          </p>
        </div>
      </SectionCard>

      {/* 联系我们 */}
      <SectionCard title="联系我们">
        <dl className="space-y-2 text-sm text-stone-700">
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">客服邮箱</dt>
            <dd>
              <a
                href="mailto:savior200618@qq.com"
                className="text-brand-700 underline-offset-2 hover:underline"
              >
                savior200618@qq.com
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">服务时间</dt>
            <dd>工作日 9:00 - 18:00（AI 诊断功能 7×24 小时可用）</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-stone-500">运营团队</dt>
            <dd>修必达 FixIt AI 运营团队</dd>
          </div>
        </dl>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-stone-500">
          <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
          使用问题可先查阅
          <Link to="/terms" className="mx-0.5 underline">
            服务协议
          </Link>
          与
          <Link to="/privacy" className="mx-0.5 underline">
            隐私保护指引
          </Link>
          ，或直接邮件联系我们。
        </p>
      </SectionCard>
    </div>
  );
}

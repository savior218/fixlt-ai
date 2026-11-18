/* ============================================================
   安全规则引擎（任务书 SAFE-001 / 阶段五提示词）
   ------------------------------------------------------------
   独立性约束（不可违反）：
   - 本模块不 import prefs / AI 服务 / 任何 React 代码
   - 任何交互模式下 detectRisk() 返回值完全一致
   - elder 模式只改变"说法"（buildInterception 的 tone 参数），
     不改变等级、拦截逻辑、安全项数量
   ============================================================ */

import type { RiskLevel, Tone } from "../types/diagnosis";

/** 高风险关键词（命中即拦截，任何模式下等级不变） */
const HIGH_RISK_KEYWORDS = [
  "漏电",
  "触电",
  "冒烟",
  "起火",
  "焦糊味",
  "焦味",
  "烧焦",
  "燃气泄漏",
  "燃气",
  "煤气",
  "火花",
  "异味",
  "异常发热",
  "烫手",
] as const;

/** 中风险关键词（涉及用户自行拆机 / 电路水路受损） */
const MEDIUM_RISK_KEYWORDS = [
  "自行拆机",
  "拆机",
  "拆卸",
  "拆开",
  "打开外壳",
  "更换零件",
  "电源线破损",
  "电线破损",
  "电线裸露",
  "外壳破损",
  "进水",
  "机箱进水",
] as const;

export interface DetectResult {
  level: RiskLevel;
  /** 命中的关键词 */
  matched: string[];
}

/** 扫描用户输入文本，返回风险等级（纯函数，无副作用） */
export function detectRisk(text: string): DetectResult {
  const high = HIGH_RISK_KEYWORDS.filter((k) => text.includes(k));
  if (high.length > 0) return { level: "high", matched: high };
  const medium = MEDIUM_RISK_KEYWORDS.filter((k) => text.includes(k));
  if (medium.length > 0) return { level: "medium", matched: medium };
  return { level: "low", matched: [] };
}

/* ============ 高风险拦截内容（对齐 UI 设计稿 4.4 节结构） ============ */

export interface InterceptAction {
  title: string;
  description: string;
}

export interface RiskInterception {
  /** "high"（当前仅高风险触发拦截） */
  level: "high";
  /** 如"存在触电风险！" */
  title: string;
  description: string;
  /** 立即采取的行动（固定 3 项，不可减少） */
  immediateActions: InterceptAction[];
  /** 禁止操作（固定 3 项，不可减少） */
  forbiddenActions: string[];
  /** 命中的关键词 */
  matched: string[];
}

/** 拦截标题按命中关键词归类（电气 / 明火 / 燃气），缺省为通用 */
function interceptTitle(matched: string[]): string {
  const text = matched.join(" ");
  if (text.includes("燃气") || text.includes("煤气")) return "存在燃气泄漏风险！";
  if (
    text.includes("冒烟") ||
    text.includes("起火") ||
    text.includes("烧焦") ||
    text.includes("焦糊味") ||
    text.includes("焦味")
  ) {
    return "存在起火风险！";
  }
  if (text.includes("异常发热") || text.includes("烫手") || text.includes("异味")) {
    return "存在异常风险！";
  }
  return "存在触电风险！";
}

/**
 * 构建高风险拦截内容。tone 只切换文案表达：
 * 等级、行动项与禁止项数量在任何模式下完全一致。
 */
export function buildInterception(
  matched: string[],
  tone: Tone = "standard"
): RiskInterception {
  const title = interceptTitle(matched);

  if (tone === "elder") {
    return {
      level: "high",
      title,
      description:
        "这个情况比较危险，可能触电或起火。请先拔掉电源，人离远一点，马上找专业人员来处理。",
      immediateActions: [
        { title: "立即断电", description: "把电源插头拔掉，别用手碰电线" },
        { title: "停止自行维修", description: "先不要自己修，避免发生危险" },
        { title: "联系专业维修", description: "马上找专业人员来帮忙" },
      ],
      forbiddenActions: [
        "不要用水去擦或冲洗设备",
        "不要自己拆机器、换零件",
        "电源线坏了就不要再用了",
      ],
      matched,
    };
  }

  return {
    level: "high",
    title,
    description: "该设备可能存在电路异常，建议立即停止使用，并联系专业维修人员。",
    immediateActions: [
      { title: "立即断电", description: "拔掉电源插头" },
      { title: "停止自行维修", description: "避免二次风险" },
      { title: "联系专业维修", description: "获取专业帮助" },
    ],
    forbiddenActions: [
      "请勿用水清洁",
      "请勿自行拆机或更换零件",
      "请勿继续使用损坏的电源线",
    ],
    matched,
  };
}

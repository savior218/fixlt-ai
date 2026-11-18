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

/**
 * 安全规则版本：必须与后端 `app/safety/rules.py` 的 SAFETY_RULES_VERSION 一致。
 * tests/test_safety_parity.py 会逐项比对关键词、版本与症状基础风险。
 */
export const SAFETY_RULES_VERSION = "SAFETY-2026-11-18-A";

/** 高风险关键词（命中即拦截，任何模式下等级不变） */
export const HIGH_RISK_KEYWORDS = [
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
export const MEDIUM_RISK_KEYWORDS = [
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

/** 未知 / 未确认回答标记（与后端 UNKNOWN_ANSWER_MARKERS 一致） */
export const UNKNOWN_ANSWER_MARKERS = [
  "不知道",
  "不清楚",
  "没注意",
  "没试过",
  "不确定",
  "记不清",
  "说不准",
] as const;

/** 症状基础风险（与后端 SYMPTOM_BASE_RISK 一致） */
export const SYMPTOM_BASE_RISK: Record<string, RiskLevel> = {
  "完全不制冷": "medium",
  "漏水": "medium",
  "无法启动": "medium",
  "不进水": "medium",
  "结冰严重": "medium",
  "不制冷": "medium",
  "无法开机": "medium",
};

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];

export function higherRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

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

/** 回答是否属于“不知道 / 没试过”等未知信息 */
export function isUnknownAnswer(answer: string): boolean {
  const text = answer.trim();
  return UNKNOWN_ANSWER_MARKERS.some((marker) => text.includes(marker));
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

/** 危险类型：燃气 / 明火 / 电气（含异常发热、异味等缺省场景） */
type DangerKind = "gas" | "fire" | "electric";

function dangerKind(matched: string[]): DangerKind {
  const text = matched.join(" ");
  if (text.includes("燃气") || text.includes("煤气")) return "gas";
  if (
    text.includes("冒烟") ||
    text.includes("起火") ||
    text.includes("烧焦") ||
    text.includes("焦糊味") ||
    text.includes("焦味")
  ) {
    return "fire";
  }
  return "electric";
}

/**
 * 各危险类型的拦截内容。
 * 安全约束（不可违反）：
 * - 等级恒为 "high"，行动项与禁止项固定 3 项，任何模式下数量不变
 * - tone 只切换文案表达，不改变等级、类型判断与拦截条件
 * - 燃气场景禁止给出「断电 / 拔插头 / 操作电器开关」类建议：
 *   开关电器产生的电火花可能点燃泄漏的燃气
 */
const INTERCEPT_CONTENT: Record<
  DangerKind,
  {
    description: string;
    descriptionElder: string;
    immediateActions: InterceptAction[];
    immediateActionsElder: InterceptAction[];
    forbiddenActions: string[];
    forbiddenActionsElder: string[];
  }
> = {
  electric: {
    description: "该设备可能存在电路异常，建议立即停止使用，并联系专业维修人员。",
    descriptionElder:
      "这个情况比较危险，可能触电或起火。请先拔掉电源，人离远一点，马上找专业人员来处理。",
    immediateActions: [
      { title: "立即断电", description: "拔掉电源插头" },
      { title: "停止自行维修", description: "避免二次风险" },
      { title: "联系专业维修", description: "获取专业帮助" },
    ],
    immediateActionsElder: [
      { title: "立即断电", description: "把电源插头拔掉，别用手碰电线" },
      { title: "停止自行维修", description: "先不要自己修，避免发生危险" },
      { title: "联系专业维修", description: "马上找专业人员来帮忙" },
    ],
    forbiddenActions: [
      "请勿用水清洁",
      "请勿自行拆机或更换零件",
      "请勿继续使用损坏的电源线",
    ],
    forbiddenActionsElder: [
      "不要用水去擦或冲洗设备",
      "不要自己拆机器、换零件",
      "电源线坏了就不要再用了",
    ],
  },
  fire: {
    description:
      "设备可能已出现起火或过热损毁，请立即断电；火势不可控时先撤离并拨打火警电话。",
    descriptionElder:
      "设备冒烟或有烧焦味很危险。先把电源拔掉，人离开远一点；火烧大了就赶紧撤到安全的地方打电话求助。",
    immediateActions: [
      { title: "立即断电", description: "拔掉电源插头或断开空开" },
      { title: "火势可控时用干粉灭火器", description: "勿用水浇带电设备" },
      { title: "火势不可控立即撤离报警", description: "人身安全优先，不要恋战" },
    ],
    immediateActionsElder: [
      { title: "立即断电", description: "把电源插头拔掉，别用手碰烧坏的地方" },
      { title: "火小可用干粉灭火器", description: "千万不要用水浇，会触电" },
      { title: "火大就赶紧撤离报警", description: "先保住自己安全，别管东西" },
    ],
    forbiddenActions: [
      "请勿用水扑救带电设备",
      "请勿自行拆机检查起火原因",
      "请勿在火情处理前继续使用",
    ],
    forbiddenActionsElder: [
      "不要用水浇电器，会触电",
      "不要自己拆开看烧在哪里",
      "处理好之前不要再开机了",
    ],
  },
  gas: {
    description:
      "疑似燃气泄漏。禁止操作任何电器开关（含拔插头），请关闭气源、开窗通风并撤离，再联系燃气公司或专业维修。",
    descriptionElder:
      "可能是燃气漏了，很危险。不要去碰任何电器开关（开灯、关灯、拔插头都不行）。先关掉燃气阀门，打开窗户，人离开屋子，再给燃气公司打电话。",
    immediateActions: [
      { title: "关闭气源阀门", description: "只动燃气阀门，不要碰电器开关" },
      { title: "开窗通风并撤离", description: "转移到户外或远离泄漏点" },
      { title: "撤离后报警求助", description: "联系燃气公司抢修或拨打应急电话" },
    ],
    immediateActionsElder: [
      { title: "关闭燃气阀门", description: "只关气罐/管道的阀门" },
      { title: "打开窗户，人离开屋子", description: "让气味散掉，离远一点" },
      { title: "到屋外打电话求助", description: "给燃气公司或物业打电话，别在屋里打" },
    ],
    forbiddenActions: [
      "请勿开关任何电器（包括灯、插头、排风扇）",
      "请勿使用明火或点火",
      "请勿在泄漏区域内使用手机",
    ],
    forbiddenActionsElder: [
      "不要开灯、关灯、拔插头，任何电器都别碰",
      "不要点火、不要抽烟",
      "不要在漏气的屋子里打电话",
    ],
  },
};

/**
 * 构建高风险拦截内容。按危险类型（电气 / 明火 / 燃气）提供对应行动建议；
 * tone 只切换文案表达，等级与拦截条件在任何模式下完全一致。
 */
export function buildInterception(
  matched: string[],
  tone: Tone = "standard"
): RiskInterception {
  const kind = dangerKind(matched);
  const content = INTERCEPT_CONTENT[kind];
  const elder = tone === "elder";

  return {
    level: "high",
    title: interceptTitle(matched),
    description: elder ? content.descriptionElder : content.description,
    immediateActions: elder
      ? content.immediateActionsElder
      : content.immediateActions,
    forbiddenActions: elder
      ? content.forbiddenActionsElder
      : content.forbiddenActions,
    matched,
  };
}

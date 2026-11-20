/* ============================================================
   官方售后辅助服务：
   1. 品牌官方售后电话簿（仅展示，平台不代用户报修）
   2. 报修话术生成（用户自行拨打官方售后时参考）
   3. 品类保养目录 + 到期计算（维修档案「保养提醒」）
   ============================================================ */

/** 品牌官方售后电话（号码以品牌官方公布为准，仅供参考） */
export interface BrandHotline {
  /** 品牌（匹配关键词，支持包含匹配） */
  brand: string;
  /** 官方售后电话 */
  phone: string;
  /** 服务时间等备注 */
  note?: string;
}

export const BRAND_HOTLINES: BrandHotline[] = [
  { brand: "格力", phone: "400-836-5315", note: "格力电器官方服务热线" },
  { brand: "美的", phone: "400-889-9315", note: "美的集团官方服务热线" },
  { brand: "海尔", phone: "400-699-9999", note: "海尔智家官方服务热线" },
  { brand: "海信", phone: "400-611-1111", note: "海信官方服务热线" },
  { brand: "容声", phone: "400-809-9999", note: "容声冰箱官方服务热线" },
  { brand: "西门子", phone: "400-889-9999", note: "西门子家电官方服务热线" },
  { brand: "松下", phone: "400-810-0781", note: "松下电器官方服务热线" },
  { brand: "TCL", phone: "400-812-3456", note: "TCL 官方服务热线" },
  { brand: "创维", phone: "95105555", note: "创维官方服务热线" },
  { brand: "奥克斯", phone: "400-826-9315", note: "奥克斯空调官方服务热线" },
];

/** 按品牌名模糊查找官方售后电话（未填写或未收录时返回 null） */
export function lookupHotline(brand?: string | null): BrandHotline | null {
  if (!brand) return null;
  const kw = brand.trim().toLowerCase();
  if (!kw) return null;
  return (
    BRAND_HOTLINES.find(
      (h) => kw.includes(h.brand.toLowerCase()) || h.brand.toLowerCase().includes(kw)
    ) ?? null
  );
}

/** 品类标签（与智能报修的 REPAIR_CATEGORIES 保持一致） */
export const CATEGORY_LABELS: Record<string, string> = {
  ac: "空调",
  fridge: "冰箱",
  washer: "洗衣机",
  tv: "电视",
  other: "其他家电",
};

/* ---------------- 报修话术生成 ---------------- */

export interface ScriptInput {
  category: string;
  brand?: string | null;
  model?: string | null;
  location?: string | null;
  symptom: string;
  description?: string | null;
  foundAt?: string | null;
  checks?: string[];
  /** 关联诊断结论（AI / 模板） */
  diagnosisConclusion?: string | null;
}

/**
 * 生成报修话术：用户拨打官方售后电话时，照着说明
 * 「出现了什么问题 + 已经做过什么 + 希望怎么解决」。
 * 只使用表单中用户提供的真实信息，不凭空增加故障事实。
 */
export function generateCallScript(input: ScriptInput): string {
  const catLabel = CATEGORY_LABELS[input.category] ?? "家电";
  const devicePart = [
    input.brand ? `${input.brand}牌` : "",
    catLabel,
    input.model ? `（型号 ${input.model}）` : "",
    input.location ? `，安装在${input.location}` : "",
  ].join("");

  const sentences: string[] = [];
  sentences.push(
    `您好，我家有一台${devicePart}，最近出现了「${input.symptom}」的问题。`
  );
  if (input.description?.trim()) {
    sentences.push(`具体情况是：${input.description.trim()}`);
  }
  if (input.foundAt) {
    sentences.push(`这个问题是从 ${input.foundAt} 前后开始的。`);
  }
  const checks = (input.checks ?? []).filter(Boolean);
  if (checks.length > 0) {
    sentences.push(`我自己已经检查过：${checks.join("；")}，但问题还是没有解决。`);
  }
  if (input.diagnosisConclusion) {
    sentences.push(`我在网上做过初步判断，结论是：${input.diagnosisConclusion}`);
  }
  sentences.push(
    "希望贵司能安排专业维修师傅尽快上门检测维修，麻烦帮我登记一下，谢谢。"
  );

  return [
    "【报修话术】拨打品牌官方售后电话时，可以参考下面的话说明情况：",
    "",
    sentences.join(""),
    "",
    "通话小贴士：说明故障现象后，售后一般会核对型号、购买凭证和保修期；",
    "如有拍照记录可一并告知，方便师傅提前准备配件。",
  ].join("\n");
}

/* ---------------- 品类保养目录（维修档案 · 保养提醒） ---------------- */

export interface MaintenanceCatalogItem {
  /** 保养项目名，如「清洗滤网」 */
  item: string;
  /** 建议间隔（天），如空调滤网建议每月清洗 */
  intervalDays: number;
}

/** 各品类默认保养项目（记录间隔，到期后应用内提醒） */
export const MAINTENANCE_CATALOG: Record<string, MaintenanceCatalogItem[]> = {
  ac: [
    { item: "清洗滤网", intervalDays: 30 },
    { item: "深度清洗（蒸发器 / 室外机）", intervalDays: 365 },
  ],
  fridge: [{ item: "除霜与清洁门封条", intervalDays: 90 }],
  washer: [{ item: "筒自洁 / 清洁滤网", intervalDays: 60 }],
  tv: [{ item: "屏幕与散热口除尘", intervalDays: 90 }],
  other: [],
};

/** 保养到期信息：到期时间 + 是否已到期 */
export interface MaintenanceDueInfo {
  /** 下次应保养时间（ISO） */
  dueAt: string;
  /** true = 已到期需要提醒 */
  overdue: boolean;
  /** 距到期天数（负数 = 已过期天数） */
  daysLeft: number;
}

/** 根据上次保养时间与间隔计算到期信息 */
export function computeDue(
  lastDoneAt: string,
  intervalDays: number,
  now = Date.now()
): MaintenanceDueInfo {
  const dueAtMs = new Date(lastDoneAt).getTime() + intervalDays * 86_400_000;
  const daysLeft = Math.ceil((dueAtMs - now) / 86_400_000);
  return {
    dueAt: new Date(dueAtMs).toISOString(),
    overdue: daysLeft <= 0,
    daysLeft,
  };
}

/** 间隔展示：「每 30 天」/「每 12 个月」 */
export function intervalLabel(intervalDays: number): string {
  if (intervalDays % 30 === 0) {
    const months = intervalDays / 30;
    return months >= 12 ? `每 ${months / 12} 个月` : `每 ${months} 个月`;
  }
  return `每 ${intervalDays} 天`;
}

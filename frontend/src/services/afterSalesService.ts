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
  /** 品牌英文名 / 别名，用于用户填写英文或简称时匹配 */
  aliases?: string[];
  /** 品牌覆盖的品类（用于同品牌多服务体系时按设备类型消歧） */
  categories?: string[];
  /** 服务时间等备注 */
  note?: string;
}

/** 常见品牌官方售后电话簿（数据与后端官方电话目录保持一致，仅含可展示记录） */
export const BRAND_HOTLINES: BrandHotline[] = [
  { brand: "格力", phone: "95082", aliases: ["GREE"], categories: ["空调", "生活小电"], note: "格力官网当前专线；不再默认推荐历史 400 号码" },
  { brand: "美的", phone: "4008899315", aliases: ["Midea"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "热水采暖", "厨房电器", "净水饮水", "生活小电"], note: "美的集团官方服务热线" },
  { brand: "海尔", phone: "95179", aliases: ["Haier"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "电视影音", "热水采暖", "厨房电器", "净水饮水", "生活小电"], note: "海尔官网当前推荐；4006999999 为过渡并行号码，不作为首选" },
  { brand: "卡萨帝", phone: "95179", aliases: ["Casarte"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "电视影音", "热水采暖", "厨房电器"], note: "海尔官方 FAQ 明确覆盖卡萨帝；与海尔共用服务热线" },
  { brand: "Leader统帅", phone: "95179", aliases: ["统帅", "Leader"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "热水采暖", "厨房电器"] },
  { brand: "海信", phone: "4006111111", aliases: ["Hisense"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "电视影音", "厨房电器"], note: "海信官方服务热线" },
  { brand: "容声", phone: "4008099999", aliases: ["Ronshen"], categories: ["冰箱冷柜", "洗衣干衣"], note: "容声冰箱官方服务热线" },
  { brand: "科龙", phone: "4008099999", aliases: ["Kelon"], categories: ["中央空调"] },
  { brand: "TCL", phone: "4008123456", aliases: ["TCL"], categories: ["电视影音", "空调", "冰箱冷柜", "洗衣干衣"], note: "TCL 官方服务热线" },
  { brand: "松下", phone: "4008811315", aliases: ["Panasonic"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "电视影音", "厨房电器", "个护电器"], note: "松下电器官方服务热线" },
  { brand: "三星", phone: "4008105858", aliases: ["Samsung"], categories: ["电视影音", "冰箱冷柜", "洗衣干衣"] },
  { brand: "LG", phone: "4008199999", aliases: ["乐金"], categories: ["电视影音", "冰箱冷柜", "洗衣干衣", "空调"] },
  { brand: "索尼", phone: "4008109000", aliases: ["Sony", "BRAVIA"], categories: ["电视影音"] },
  { brand: "方太", phone: "952315", aliases: ["FOTILE"], categories: ["厨房电器", "热水采暖", "净水饮水"] },
  { brand: "老板", phone: "95105855", aliases: ["老板电器", "ROBAM"], categories: ["厨房电器", "热水采暖", "净水饮水", "冰箱冷柜"] },
  { brand: "华帝", phone: "4008886288", aliases: ["Vatti"], categories: ["厨房电器", "热水采暖"] },
  { brand: "万和", phone: "4008308383", aliases: ["Vanward"], categories: ["热水采暖", "厨房电器", "净水饮水"] },
  { brand: "林内", phone: "4006990606", aliases: ["Rinnai"], categories: ["热水采暖", "厨房电器", "净水饮水"] },
  { brand: "能率", phone: "4009881998", aliases: ["NORITZ"], categories: ["热水采暖", "厨房电器", "净水饮水"] },
  { brand: "A.O.史密斯", phone: "4008288988", aliases: ["艾欧史密斯", "AOSmith"], categories: ["热水采暖", "净水饮水", "厨房电器", "空气处理"] },
  { brand: "苏泊尔", phone: "4008899717", aliases: ["SUPOR"], categories: ["厨房电器", "生活小电"] },
  { brand: "九阳", phone: "4006186999", aliases: ["Joyoung"], categories: ["厨房电器", "净水饮水", "生活小电"] },
  { brand: "小熊", phone: "4006622580", aliases: ["Bear"], categories: ["厨房电器", "生活小电"] },
  { brand: "格兰仕", phone: "4008300333", aliases: ["Galanz"], categories: ["厨房电器", "冰箱冷柜", "洗衣干衣", "空调"] },
  { brand: "长虹", phone: "4008111666", aliases: ["CHANGHONG"], categories: ["电视影音", "空调", "冰箱冷柜", "洗衣干衣", "生活小电", "厨房电器"] },
  { brand: "美菱", phone: "4008111666", aliases: ["Meiling"], categories: ["冰箱冷柜", "洗衣干衣", "空调", "厨房电器", "生活小电"] },
  { brand: "奥克斯", phone: "4008268268", aliases: ["AUX"], categories: ["空调"], note: "奥克斯空调官方服务热线" },
  { brand: "康佳", phone: "4008800016", aliases: ["KONKA"], categories: ["电视影音", "冰箱冷柜", "洗衣干衣", "空调", "厨房电器"] },
  { brand: "创维", phone: "95105555", aliases: ["Skyworth"], categories: ["电视影音", "冰箱冷柜", "洗衣干衣", "空调"], note: "创维官方服务热线" },
  { brand: "戴森", phone: "4009202808", aliases: ["Dyson"], categories: ["清洁电器", "个护电器", "空气处理"] },
  { brand: "科沃斯", phone: "4008868888", aliases: ["ECOVACS", "地宝", "窗宝"], categories: ["清洁电器", "空气处理"] },
  { brand: "石头", phone: "4009001755", aliases: ["石头科技", "Roborock", "小瓦"], categories: ["清洁电器"] },
  { brand: "追觅", phone: "4001181111", aliases: ["Dreame"], categories: ["清洁电器", "个护电器"] },
  { brand: "添可", phone: "4007794666", aliases: ["Tineco"], categories: ["清洁电器", "个护电器", "厨房电器"] },
  { brand: "云鲸", phone: "4000800630", aliases: ["Narwal"], categories: ["清洁电器"] },
  { brand: "美大", phone: "4008879882", aliases: ["MEIDA"], categories: ["厨房电器"] },
  { brand: "火星人", phone: "4008888490", aliases: ["MARSSENGER"], categories: ["厨房电器"] },
  { brand: "帅康", phone: "4007001111", aliases: ["Sacon"], categories: ["厨房电器", "热水采暖", "净水饮水"] },
  { brand: "大金", phone: "4008201081", aliases: ["DAIKIN"], categories: ["空调", "中央空调"] },
  { brand: "三菱重工空调", phone: "4006993030", aliases: ["Mitsubishi Heavy Industries"], categories: ["空调", "中央空调"] },
  { brand: "日立中央空调", phone: "4008601111", aliases: ["Hitachi", "海信日立"], categories: ["中央空调"] },
  { brand: "约克VRF", phone: "4006206607", aliases: ["YORK"], categories: ["中央空调"] },
  { brand: "伊莱克斯", phone: "95105801", aliases: ["Electrolux"], categories: ["冰箱冷柜", "洗衣干衣", "厨房电器", "清洁电器"] },
  { brand: "倍科", phone: "4008285353", aliases: ["Beko"], categories: ["冰箱冷柜", "洗衣干衣", "厨房电器"] },
  { brand: "澳柯玛", phone: "4006187777", aliases: ["AUCMA"], categories: ["冰箱冷柜", "空调", "洗衣干衣", "厨房电器", "净水饮水", "生活小电"] },
  { brand: "扬子空调", phone: "4008877000", aliases: ["YAIR"], categories: ["空调", "中央空调"] },
  { brand: "安吉尔", phone: "4007003339", aliases: ["Angel"], categories: ["净水饮水"] },
  { brand: "沁园", phone: "4001111222", aliases: ["Qinyuan"], categories: ["净水饮水"] },
  { brand: "碧然德", phone: "4009218318", aliases: ["BRITA"], categories: ["净水饮水"] },
  { brand: "德龙", phone: "4008271668", aliases: ["DeLonghi", "De’Longhi"], categories: ["咖啡电器", "厨房电器", "空气处理"] },
  { brand: "博朗厨房小家电", phone: "4008271668", aliases: ["Braun Household", "博朗"], categories: ["厨房电器", "咖啡电器", "衣物护理"] },
  { brand: "摩飞", phone: "4008820686", aliases: ["Morphy Richards"], categories: ["厨房电器", "生活小电"] },
  { brand: "荣事达电子电器", phone: "4001100315", aliases: ["荣事达", "Royalstar"], categories: ["生活小电", "热水采暖", "厨房电器"] },
  { brand: "小天鹅", phone: "4008228228", aliases: ["Little Swan"], categories: ["洗衣干衣", "冰箱冷柜", "空调"] },
  { brand: "飞利浦家居电器", phone: "4008800008", aliases: ["Philips", "范颂尼", "Versuni"], categories: ["厨房电器", "清洁电器", "衣物护理", "空气处理"] },
  { brand: "COLMO", phone: "4009699999", aliases: ["COLMO"], categories: ["空调", "冰箱冷柜", "洗衣干衣", "厨房电器", "净水饮水"] },
  { brand: "东芝生活电器", phone: "4008229088", aliases: ["Toshiba", "东芝"], categories: ["冰箱冷柜", "洗衣干衣", "热水采暖", "厨房电器", "净水饮水", "清洁电器"] },
  { brand: "东芝电视", phone: "4008567888", aliases: ["Toshiba", "东芝"], categories: ["电视影音"] },
];

/**
 * 仅作智能报修页的快捷拨号提示；完整品牌 / 品类目录与官方来源请到 `/hotlines`。
 * 号码来自 2026-11-20 官方页面核验资料，未实际拨测。
 */

/** 报修页设备类型 → 售后电话簿品类，用于同品牌多服务体系消歧 */
const CATEGORY_TAGS: Record<string, string[]> = {
  ac: ["空调", "中央空调"],
  fridge: ["冰箱冷柜"],
  washer: ["洗衣干衣"],
  tv: ["电视影音"],
};

function normalizeBrand(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** 按品牌名（含英文名 / 别名）查找官方售后电话（未填写或未收录时返回 null） */
export function lookupHotline(
  brand?: string | null,
  category?: string | null
): BrandHotline | null {
  if (!brand) return null;
  const kw = normalizeBrand(brand.trim());
  if (!kw) return null;

  const namesOf = (h: BrandHotline) =>
    [h.brand, ...(h.aliases ?? [])].map(normalizeBrand);

  // 先精确匹配品牌名 / 别名；没有精确结果时再做包含匹配（如「格力空调」）
  const exact = BRAND_HOTLINES.filter((h) => namesOf(h).includes(kw));
  const candidates =
    exact.length > 0
      ? exact
      : BRAND_HOTLINES.filter((h) =>
          namesOf(h).some((name) => name.includes(kw) || kw.includes(name))
        );
  if (candidates.length === 0) return null;

  // 同品牌有多个服务体系（如东芝电视 / 东芝生活电器）时，按设备类型选对应号码
  const tags = category ? CATEGORY_TAGS[category] : undefined;
  if (tags && tags.length > 0) {
    const byCategory = candidates.find((h) =>
      h.categories?.some((c) => tags.includes(c))
    );
    if (byCategory) return byCategory;
  }
  return candidates[0];
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
    "拨打品牌官方售后电话时，可以参考下面的话说明情况：",
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

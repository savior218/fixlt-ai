/** 问诊问题脚本（每类 2 问）：问题 ID 固定，供前后端追溯与旧草稿迁移。 */
import type { DiagnoseCategory } from "../types/diagnosis";

export interface QuestionDef {
  id: string;
  text: string;
  suggestions: string[];
}

export const QUESTION_SETS: Record<DiagnoseCategory, QuestionDef[]> = {
  ac: [
    {
      id: "ac_filter_clean",
      text: "最近有清洗过空调过滤网吗？",
      suggestions: ["没洗过", "上个月洗过", "不清楚怎么洗"],
    },
    {
      id: "ac_cold_wind",
      text: "开机运行时，出风口有冷风吹出吗？",
      suggestions: ["有一点，但不凉", "完全没有冷风", "吹出来是热风"],
    },
  ],
  fridge: [
    {
      id: "fridge_light",
      text: "冰箱内部的照明灯还亮着吗？",
      suggestions: ["亮", "不亮", "没注意"],
    },
    {
      id: "fridge_temp",
      text: "冷藏室的温度感觉怎么样？",
      suggestions: ["不够凉", "和平时一样", "都结冰了"],
    },
  ],
  washer: [
    {
      id: "washer_panel_light",
      text: "通电后，面板指示灯亮吗？",
      suggestions: ["亮", "不亮", "没注意"],
    },
    {
      id: "washer_stage",
      text: "故障出现在哪个环节？",
      suggestions: ["进水时", "脱水时", "整个运行过程"],
    },
  ],
  other: [
    {
      id: "other_power_on",
      text: "设备还能通电开机吗？",
      suggestions: ["能开机", "不能", "没试过"],
    },
    {
      id: "other_duration",
      text: "这个问题出现多久了？",
      suggestions: ["今天刚出现", "几天了", "一周以上"],
    },
  ],
};

export function questionsFor(category: DiagnoseCategory | null): QuestionDef[] {
  return QUESTION_SETS[category ?? "other"];
}

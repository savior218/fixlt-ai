import type { InteractionMode, FontScale } from "../stores/prefs";

/** 对比度三档（P9 显示设置，对齐 UI 设计稿） */
export type ContrastLevel = "normal" | "high" | "extra";

/** 用户资料（USER-001 接入前为演示数据，页面需标注演示） */
export interface UserProfile {
  id: number;
  nickname: string;
  /** 原始手机号，展示时经 maskPhone 脱敏 */
  phone: string;
}

/** 用户偏好快照（对齐 prefs store；P9 设置页数据结构） */
export interface UserSettings {
  displayMode: InteractionMode;
  fontSize: FontScale;
  /** 页面缩放百分比（100 = 100%） */
  zoom: number;
  contrast: ContrastLevel;
  voiceEnabled: boolean;
  autoRead: boolean;
  /** 语速 0.5 ~ 2.0 */
  speechRate: number;
}

/** 演示用户（标注"演示状态"，不伪装真实账号） */
export const DEMO_USER: UserProfile = {
  id: 1,
  nickname: "演示用户",
  phone: "13812345678",
};

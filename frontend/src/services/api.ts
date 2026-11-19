/** 后端 API 客户端。开发期通过 Vite 代理访问 127.0.0.1:8000。
 *  请求头 X-User-Id 来自登录会话（authStore）；未登录时降级为演示账号。 */

import { useAuthStore } from "../stores/authStore";

const BASE = "/api";

function buildHeaders(): Record<string, string> {
  const userId = useAuthStore.getState().user?.id;
  return {
    "Content-Type": "application/json",
    "X-User-Id": String(userId ?? 1),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(BASE + path, { headers: buildHeaders(), ...init });
  if (!resp.ok) {
    let detail = `请求失败（HTTP ${resp.status}）`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* 保留默认错误信息 */
    }
    throw new Error(detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/* ================= 账号认证（登录 / 注册） ================= */

export interface AuthUserOut {
  id: number;
  username: string;
  email: string | null;
}

/** 登录；失败抛错（信息已含后端 detail） */
export async function loginRequest(
  username: string,
  password: string,
): Promise<AuthUserOut> {
  return request<AuthUserOut>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/** 注册新账号并直接返回用户信息 */
export async function registerRequest(
  username: string,
  password: string,
): Promise<AuthUserOut> {
  return request<AuthUserOut>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export interface HealthInfo {
  status: string;
  app: string;
  version: string;
  time: string;
}

export type DeviceCategory = "ac" | "fridge" | "washer";

export interface Device {
  id: number;
  name: string;
  category: DeviceCategory;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  location: string | null;
  image_url: string | null;
  note: string | null;
  created_at: string;
}

export type DeviceInput = Omit<Device, "id" | "created_at">;

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  ac: "空调",
  fridge: "冰箱",
  washer: "洗衣机",
};

export const getHealth = () => request<HealthInfo>("/health");
export const listDevices = () => request<Device[]>("/devices");
export const createDevice = (d: DeviceInput) =>
  request<Device>("/devices", { method: "POST", body: JSON.stringify(d) });
export const updateDevice = (id: number, d: Partial<DeviceInput>) =>
  request<Device>(`/devices/${id}`, {
    method: "PUT",
    body: JSON.stringify(d),
  });
export const deleteDevice = (id: number) =>
  request<void>(`/devices/${id}`, { method: "DELETE" });

/* ---------- AI 诊断（阶段九：后端转发智谱 GLM，key 不进前端） ---------- */

/** AI 诊断内容（standard / elder 双文案，单次调用产出） */
export interface AIDiagnoseContent {
  conclusion: string;
  conclusion_elder: string;
  possible_causes: { title: string; description: string }[];
  evidence: string[];
  suggestions: { title: string; description: string }[];
  suggestions_elder: { title: string; description: string }[];
  tips: string;
  tips_elder: string;
  risk_note: string;
  risk_note_elder: string;
}

export interface AIDiagnoseResponse {
  source: string;
  model: string;
  content: AIDiagnoseContent;
}

export interface AIDiagnosePayload {
  category: string;
  symptom: string | null;
  description: string;
  answers: string[];
  device_name?: string | null;
  device_brand?: string | null;
  device_model?: string | null;
  photo_id?: number | null;
}

/** 真实 AI 诊断：失败抛错，由调用方回退本地 Mock */
export const requestAIDiagnosis = (p: AIDiagnosePayload) =>
  request<AIDiagnoseResponse>("/diagnose/complete", {
    method: "POST",
    body: JSON.stringify(p),
  });

/* ---------- 模块③：故障照片上传（multipart，base64 存库） ---------- */

export interface PhotoUploadResult {
  id: number;
  mime: string;
  image_base64: string;
}

/** 上传故障照片：不走 request()（multipart 不能带 JSON Content-Type） */
export async function uploadDiagnosisPhoto(file: File): Promise<PhotoUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${BASE}/diagnose/photo`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    let detail = `上传失败（HTTP ${resp.status}）`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* 保留默认错误信息 */
    }
    throw new Error(detail);
  }
  return (await resp.json()) as PhotoUploadResult;
}

/* ---------- 模块②：报修工单闭环 ---------- */

export type TicketStatus = "pending" | "accepted" | "in_progress" | "completed";

/** 状态机顺序：待受理 → 已受理 → 维修中 → 已完成 */
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: "待受理",
  accepted: "已受理",
  in_progress: "维修中",
  completed: "已完成",
};

export interface TicketStatusPoint {
  status: TicketStatus;
  at: string;
}

export interface RepairTicket {
  id: number;
  device_id: number | null;
  diagnosis_ref: string | null;
  category: string;
  brand: string | null;
  model: string | null;
  symptom: string;
  description: string | null;
  found_at: string | null;
  checks: string[];
  content: string;
  status: TicketStatus;
  status_history: TicketStatusPoint[];
  created_at: string;
  updated_at: string;
}

export interface TicketInput {
  category: string;
  symptom: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  found_at?: string | null;
  checks?: string[];
  content: string;
  device_id?: number | null;
  diagnosis_ref?: string | null;
}

export const createTicket = (p: TicketInput) =>
  request<RepairTicket>("/repairs", { method: "POST", body: JSON.stringify(p) });

export const listTickets = () => request<RepairTicket[]>("/repairs");

export const updateTicketStatus = (id: number, status: TicketStatus) =>
  request<RepairTicket>(`/repairs/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

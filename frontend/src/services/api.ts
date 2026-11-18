/** 后端 API 客户端。开发期通过 Vite 代理访问 127.0.0.1:8000。
 *  用户体系（USER-001）接入前以 X-User-Id 标识演示用户。 */

const BASE = "/api";
const HEADERS = {
  "Content-Type": "application/json",
  "X-User-Id": "1",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(BASE + path, { headers: HEADERS, ...init });
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
}

/** 真实 AI 诊断：失败抛错，由调用方回退本地 Mock */
export const requestAIDiagnosis = (p: AIDiagnosePayload) =>
  request<AIDiagnoseResponse>("/diagnose/complete", {
    method: "POST",
    body: JSON.stringify(p),
  });

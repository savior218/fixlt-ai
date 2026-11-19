/** 后端 API 客户端。开发期通过 Vite 代理访问 127.0.0.1:8000。
 *  登录态由服务端 HttpOnly Cookie 决定；CSRF 令牌只保存在内存中。 */

const BASE = "/api";

let csrfToken = "";
/** 由 authStore 注册：会话失效时更新前端状态，不在此处跳转页面 */
let unauthorizedHandler: (() => void) | null = null;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  code: string;
  status: number;
  detail?: unknown;

  constructor(message: string, code = "http_error", status = 0, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 20_000
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = init?.signal;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort);

  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (method !== "GET" && method !== "HEAD" && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  let resp: Response;
  try {
    resp = await fetch(BASE + path, {
      headers,
      credentials: "include",
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new ApiError("请求超时，请稍后重试", "timeout", 0);
    }
    if (external?.aborted) {
      throw new ApiError("请求已取消", "aborted", 0);
    }
    throw new ApiError("无法连接服务，请检查网络或后端是否启动", "network", 0);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }

  if (!resp.ok) {
    let message = `请求失败（HTTP ${resp.status}）`;
    let code = `http_${resp.status}`;
    let detail: unknown;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      detail = body?.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail && typeof detail === "object") {
        const obj = detail as { code?: string; message?: string };
        if (obj.message) message = obj.message;
        if (obj.code) code = obj.code;
      }
    } catch {
      /* 保留默认错误信息 */
    }
    if (resp.status === 401 && !path.startsWith("/auth/")) {
      unauthorizedHandler?.();
    }
    throw new ApiError(message, code, resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export interface HealthInfo {
  status: string;
  app: string;
  version: string;
  time: string;
  deployment_mode?: string;
  ai_configured?: boolean;
  safety_rules_version?: string;
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
  /** 游客只读样例（不属于任何可登录账号） */
  demo?: boolean;
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
/** 游客演示：固定只读样例，没有写接口 */
export const listDemoDevices = () => request<Device[]>("/demo/devices");

/* ---------- 账号：注册 / 登录 / 当前用户 / 资料 / 密码 ---------- */

export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
  created_at: string;
}

export interface AuthSessionPayload {
  user: AuthUser;
  csrf_token: string;
}

export const getCurrentAccount = () => request<AuthSessionPayload>("/auth/me");

export const registerAccount = (p: {
  username: string;
  password: string;
  nickname?: string;
}) =>
  request<AuthSessionPayload>("/auth/register", {
    method: "POST",
    body: JSON.stringify(p),
  });

export const loginAccount = (p: { username: string; password: string }) =>
  request<AuthSessionPayload>("/auth/login", {
    method: "POST",
    body: JSON.stringify(p),
  });

export const logoutAccount = () =>
  request<void>("/auth/logout", { method: "POST" });

export const updateAccountProfile = (nickname: string) =>
  request<AuthSessionPayload>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({ nickname }),
  });

export const changeAccountPassword = (p: {
  current_password: string;
  new_password: string;
}) =>
  request<{ message: string; relogin_required: boolean }>("/auth/password", {
    method: "POST",
    body: JSON.stringify(p),
  });

/* ---------- AI 诊断（阶段十：完整问答上下文 + 双文案 + 服务端安全下限） ---------- */

export interface AIQAItem {
  question_id: string;
  question_text: string;
  answer: string;
  unknown: boolean;
}

/** AI 诊断内容（standard / elder 双文案，单次调用产出；事实由服务端生成） */
export interface AIDiagnoseContent {
  conclusion: string;
  conclusion_elder: string;
  possible_causes: { title: string; description: string }[];
  evidence: string[];
  unknown_information: string[];
  suggestions: { title: string; description: string }[];
  suggestions_elder: { title: string; description: string }[];
  tips: string;
  tips_elder: string;
  risk_note: string;
  risk_note_elder: string;
}

export interface AIDiagnoseResponse {
  source: "ai";
  model: string;
  content: AIDiagnoseContent;
  risk_floor: "low" | "medium" | "high";
  risk_matched: string[];
  safety_rules_version: string;
  /** 登录用户的保存回执；游客为 null */
  receipt?: string | null;
}

export interface AIDiagnosePayload {
  category: string;
  symptom: string | null;
  description: string;
  qa: AIQAItem[];
  device_name?: string | null;
  device_brand?: string | null;
  device_model?: string | null;
}

/** 真实 AI 诊断：失败抛 ApiError，由调用方明确提示并允许重试（不自动回退模板） */
export const requestAIDiagnosis = (p: AIDiagnosePayload, signal?: AbortSignal) =>
  request<AIDiagnoseResponse>(
    "/diagnose/complete",
    {
      method: "POST",
      body: JSON.stringify(p),
      signal,
    },
    65_000
  );

/* ---------- 云端诊断报告 / 维修记录（阶段十二） ---------- */

export interface CloudContentItem {
  title: string;
  description: string;
}

export interface CloudDiagnosisContent {
  conclusion: string;
  possible_causes: CloudContentItem[];
  evidence: string[];
  unknown_information: string[];
  suggestions: CloudContentItem[];
  tips: string | null;
  risk_note: string | null;
}

export interface CloudDiagnosisRecord {
  id: number;
  client_ref: string;
  device_id: number | null;
  device_name: string | null;
  category: string | null;
  symptom: string;
  description: string;
  source: "ai" | "template" | "unknown";
  ai_model: string | null;
  risk_level: "low" | "medium" | "high";
  risk_rules_version: string | null;
  qa: AIQAItem[];
  content: { standard: CloudDiagnosisContent; elder?: CloudDiagnosisContent };
  verified: boolean;
  imported: boolean;
  created_at: string;
}

export interface CloudDiagnosisPayload {
  client_ref: string;
  device_id: number | null;
  device_name: string | null;
  category: string | null;
  symptom: string;
  description: string;
  source: "ai" | "template" | "unknown";
  ai_model: string | null;
  risk_level: "low" | "medium" | "high";
  risk_rules_version: string | null;
  qa: AIQAItem[];
  content: {
    standard: CloudDiagnosisContent;
    elder?: CloudDiagnosisContent;
  };
  receipt?: string | null;
  created_at: string;
}

export interface CloudRepairRecord {
  id: number;
  client_ref: string;
  device_id: number | null;
  device_name: string;
  diagnosis_ref: string | null;
  diagnosis_source: string | null;
  fault_description: string;
  repair_method: string;
  repair_time: string | null;
  technician: string | null;
  cost: number | null;
  status: "pending" | "recovered" | "partial" | "failed";
  images: string[];
  verification_status:
    | "unverified"
    | "recovered"
    | "partial"
    | "notRecovered"
    | "unknown";
  imported: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface CloudRepairPayload {
  client_ref: string;
  device_id: number | null;
  device_name: string;
  diagnosis_ref: string | null;
  fault_description: string;
  repair_method: string;
  repair_time: string | null;
  technician: string | null;
  cost: number | null;
  status: "pending" | "recovered" | "partial" | "failed";
  images: string[];
  verification_status:
    | "unverified"
    | "recovered"
    | "partial"
    | "notRecovered"
    | "unknown";
  created_at: string;
}

export interface CloudRepairPatch {
  verification_status?:
    | "unverified"
    | "recovered"
    | "partial"
    | "notRecovered"
    | "unknown";
  status?: "pending" | "recovered" | "partial" | "failed";
  technician?: string | null;
  repair_method?: string;
  repair_time?: string | null;
  cost?: number | null;
}

export const listCloudDiagnoses = () =>
  request<CloudDiagnosisRecord[]>("/diagnoses");
export const saveCloudDiagnosis = (p: CloudDiagnosisPayload) =>
  request<CloudDiagnosisRecord>("/diagnoses", {
    method: "POST",
    body: JSON.stringify(p),
  });
export const importCloudDiagnoses = (items: CloudDiagnosisPayload[]) =>
  request<CloudDiagnosisRecord[]>("/diagnoses/import", {
    method: "POST",
    body: JSON.stringify({ items }),
  });

export const listCloudRepairs = () => request<CloudRepairRecord[]>("/repairs");
export const saveCloudRepair = (p: CloudRepairPayload) =>
  request<CloudRepairRecord>("/repairs", {
    method: "POST",
    body: JSON.stringify(p),
  });
export const patchCloudRepair = (id: number, p: CloudRepairPatch) =>
  request<CloudRepairRecord>(`/repairs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
export const importCloudRepairs = (items: CloudRepairPayload[]) =>
  request<CloudRepairRecord[]>("/repairs/import", {
    method: "POST",
    body: JSON.stringify({ items }),
  });

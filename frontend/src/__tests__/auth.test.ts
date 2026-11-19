/**
 * 阶段十一前端测试：登录返回地址校验 / 本地数据按账号隔离 / 旧数据不自动归属。
 * 运行：npm test（Vitest）
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { Diagnosis, DiagnosisDraft } from "../types/diagnosis";
import { EMPTY_DRAFT } from "../types/diagnosis";
import type { RepairRecord } from "../types/repair";
import {
  diagnosesForOwner,
  localHistoryCount,
  useDiagnosisStore,
} from "../stores/diagnosisStore";
import { localRepairCount, recordsForOwner } from "../stores/repairStore";
import { itemOwner } from "../services/identity";
import { normalizeDiagnosis } from "../utils/diagnosis";
import { loginHref, safeReturnTo } from "../utils/redirect";

function diagnosis(id: string, ownerKey?: string): Diagnosis {
  return normalizeDiagnosis({
    id,
    deviceId: 1,
    deviceName: "空调",
    category: "ac",
    symptom: "不制冷",
    description: "",
    createdAt: "2026-11-19T00:00:00.000Z",
    conclusion: "检查滤网",
    possibleCauses: [],
    evidence: [],
    suggestions: [],
    tips: null,
    riskNote: null,
    riskLevel: "low",
    status: "completed",
    source: "unknown",
    ownerKey,
  });
}

function record(id: string, ownerKey?: string): RepairRecord {
  return {
    id,
    ownerKey,
    deviceId: 1,
    deviceName: "空调",
    diagnosisId: "d-1",
    createdAt: "2026-11-19T00:00:00.000Z",
    repairTime: null,
    faultDescription: "",
    repairMethod: "",
    technician: null,
    cost: null,
    status: "recovered",
    images: [],
    verificationStatus: "unverified",
  };
}

describe("登录返回地址校验", () => {
  it("只允许站内相对路径", () => {
    expect(safeReturnTo("/devices")).toBe("/devices");
    expect(safeReturnTo("/diagnosis/abc/result?x=1")).toBe(
      "/diagnosis/abc/result?x=1"
    );
    expect(safeReturnTo("https://evil.example/phish")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });

  it("登录链接对返回地址进行编码", () => {
    expect(loginHref("/settings?tab=privacy")).toBe(
      "/login?returnTo=%2Fsettings%3Ftab%3Dprivacy"
    );
  });
});

describe("账号切换时重置页面草稿", () => {
  beforeEach(() => {
    useDiagnosisStore.setState({
      ownerKey: "local",
      draftOwner: "local",
      draft: { ...EMPTY_DRAFT, chat: [], qa: [] },
      history: [],
    });
  });

  it("同一账号刷新时保留草稿", () => {
    const draft: DiagnosisDraft = {
      ...EMPTY_DRAFT,
      step: 2,
      category: "ac",
      symptom: "不制冷",
      chat: [],
      qa: [],
    };
    useDiagnosisStore.setState({
      ownerKey: "local",
      draftOwner: "user:1",
      draft,
    });
    useDiagnosisStore.getState().applyOwner("user:1");
    expect(useDiagnosisStore.getState().ownerKey).toBe("user:1");
    expect(useDiagnosisStore.getState().draft.symptom).toBe("不制冷");
  });

  it("切换到其他账号时清空上一账号草稿", () => {
    useDiagnosisStore.setState({
      ownerKey: "user:1",
      draftOwner: "user:1",
      draft: {
        ...EMPTY_DRAFT,
        step: 2,
        category: "ac",
        symptom: "上一账号的草稿",
        chat: [],
        qa: [],
      },
    });
    useDiagnosisStore.getState().applyOwner("user:2");
    expect(useDiagnosisStore.getState().ownerKey).toBe("user:2");
    expect(useDiagnosisStore.getState().draft.symptom).toBeNull();
  });
});

describe("本地数据按账号隔离", () => {
  const history = [
    diagnosis("a", "user:1"),
    diagnosis("b", "user:2"),
    diagnosis("legacy", undefined),
  ];

  it("只展示当前账号的诊断，legacy 记录归入本机历史", () => {
    expect(diagnosesForOwner(history, "user:1").map((d) => d.id)).toEqual(["a"]);
    expect(diagnosesForOwner(history, "user:2").map((d) => d.id)).toEqual(["b"]);
    expect(localHistoryCount(history, "user:1")).toBe(1);
    expect(localHistoryCount(history, "local")).toBe(0);
  });

  it("旧记录缺少归属时保持本机历史，不自动归属新账号", () => {
    expect(itemOwner(undefined)).toBe("local");
    const normalized = normalizeDiagnosis({ id: "legacy-only" });
    expect(normalized.ownerKey).toBe("local");
  });

  it("维修记录同样按账号过滤", () => {
    const records = [record("a", "user:1"), record("b", "user:2"), record("c")];
    expect(recordsForOwner(records, "user:1").map((r) => r.id)).toEqual(["a"]);
    expect(recordsForOwner(records, "local").map((r) => r.id)).toEqual(["c"]);
    expect(localRepairCount(records, "user:2")).toBe(1);
  });
});

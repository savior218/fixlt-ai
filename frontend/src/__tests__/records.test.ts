import { describe, expect, it } from "vitest";

import {
  fromApiDiagnosis,
  fromApiRepair,
  toApiDiagnosis,
  toApiRepair,
} from "../services/recordService";
import type { CloudDiagnosisRecord, CloudRepairRecord } from "../services/api";
import type { Diagnosis } from "../types/diagnosis";
import type { RepairRecord } from "../types/repair";

const diagnosis: Diagnosis = {
  id: "diag-test-1",
  deviceId: null,
  deviceName: "客厅空调",
  category: "ac",
  symptom: "制冷效果变差",
  description: "不太凉",
  createdAt: "2026-11-19T06:00:00.000Z",
  source: "template",
  model: null,
  qa: [
    {
      questionId: "q1",
      questionText: "过滤网多久没洗了？",
      answer: "不清楚",
      unknown: true,
    },
  ],
  content: {
    standard: {
      conclusion: "标准结论",
      possibleCauses: [{ title: "滤网积尘", description: "影响出风" }],
      evidence: ["故障现象：制冷效果变差"],
      unknownInformation: ["过滤网：不清楚"],
      suggestions: [{ title: "清洗滤网", description: "断电后清洗" }],
      tips: "定期清洗",
      riskNote: "不要拆机",
    },
    elder: {
      conclusion: "长辈结论",
      possibleCauses: [{ title: "滤网积尘", description: "影响出风" }],
      evidence: ["故障现象：制冷效果变差"],
      unknownInformation: ["过滤网：不清楚"],
      suggestions: [{ title: "洗过滤网", description: "断电再洗" }],
      tips: "常洗",
      riskNote: "别自己拆",
    },
  },
  riskLevel: "low",
  conclusion: "标准结论",
  possibleCauses: [{ title: "滤网积尘", description: "影响出风" }],
  evidence: ["故障现象：制冷效果变差"],
  suggestions: [{ title: "清洗滤网", description: "断电后清洗" }],
  tips: "定期清洗",
  riskNote: "不要拆机",
  status: "completed",
};

describe("云端记录映射（阶段十二）", () => {
  it("诊断载荷与服务端记录往返保留双文案、问答和未知信息", () => {
    const payload = toApiDiagnosis(diagnosis);
    expect(payload.client_ref).toBe("diag-test-1");
    expect(payload.qa[0].unknown).toBe(true);
    expect(payload.content.elder?.conclusion).toBe("长辈结论");

    const cloud: CloudDiagnosisRecord = {
      id: 42,
      client_ref: payload.client_ref,
      device_id: null,
      device_name: payload.device_name,
      category: payload.category,
      symptom: payload.symptom,
      description: payload.description,
      source: "template",
      ai_model: null,
      risk_level: "medium",
      risk_rules_version: null,
      qa: payload.qa,
      content: payload.content,
      verified: false,
      imported: false,
      created_at: payload.created_at,
    };
    const back = fromApiDiagnosis(cloud);
    expect(back.id).toBe("diag-test-1");
    expect(back.serverId).toBe(42);
    expect(back.source).toBe("template");
    expect(back.content?.elder?.suggestions[0].title).toBe("洗过滤网");
    expect(back.content?.standard.unknownInformation[0]).toContain("不清楚");
    expect(back.cloud).toBe(true);
  });

  it("本机导入记录不被标记为服务端已验证", () => {
    const cloud: CloudDiagnosisRecord = {
      id: 7,
      client_ref: "local-diag-old",
      device_id: null,
      device_name: "旧设备",
      category: "other",
      symptom: "无法开机",
      description: "",
      source: "ai",
      ai_model: "glm-4-flash",
      risk_level: "low",
      risk_rules_version: "SAFETY-2026-11-18-A",
      qa: [],
      content: {
        standard: {
          conclusion: "旧结论",
          possible_causes: [],
          evidence: [],
          unknown_information: [],
          suggestions: [],
          tips: null,
          risk_note: null,
        },
      },
      verified: false,
      imported: true,
      created_at: "2026-11-01T00:00:00",
    };
    const back = fromApiDiagnosis(cloud);
    expect(back.verified).toBe(false);
    expect(back.imported).toBe(true);
    expect(back.source).toBe("ai");
  });

  it("维修记录映射保留验证状态与关联诊断", () => {
    const record: RepairRecord = {
      id: "rep-test-1",
      deviceId: 0,
      deviceName: "未关联设备",
      diagnosisId: "diag-test-1",
      diagnosisSource: "template",
      createdAt: "2026-11-19T06:00:00.000Z",
      repairTime: null,
      faultDescription: "制冷效果变差",
      repairMethod: "清洗滤网",
      technician: null,
      cost: null,
      status: "pending",
      images: [],
      verificationStatus: "unverified",
    };
    const payload = toApiRepair(record);
    expect(payload.device_id).toBeNull();
    expect(payload.diagnosis_ref).toBe("diag-test-1");

    const cloud: CloudRepairRecord = {
      id: 9,
      client_ref: payload.client_ref,
      device_id: null,
      device_name: payload.device_name,
      diagnosis_ref: "diag-test-1",
      diagnosis_source: "template",
      fault_description: payload.fault_description,
      repair_method: payload.repair_method,
      repair_time: null,
      technician: null,
      cost: null,
      status: "pending",
      images: [],
      verification_status: "recovered",
      imported: false,
      created_at: payload.created_at,
      updated_at: payload.created_at,
    };
    const back = fromApiRepair({ ...cloud, status: "recovered" });
    expect(back.id).toBe("rep-test-1");
    expect(back.serverId).toBe(9);
    expect(back.verificationStatus).toBe("recovered");
    expect(back.diagnosisId).toBe("diag-test-1");
  });
});

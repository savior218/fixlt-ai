/**
 * 阶段十前端可信性测试：旧数据兼容 / 问答迁移 / 双文案 / 失败不静默回退。
 * 运行：npm test（Vitest；不依赖浏览器与真实模型）
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Diagnosis } from "../types/diagnosis";
import {
  buildEvidence,
  buildTemplateDiagnosis,
  generateAIDiagnosis,
  nextTurn,
  type AskContext,
} from "../services/diagnosisService";
import {
  contentFor,
  hasElderCopy,
  normalizeDiagnosis,
  normalizeDraft,
} from "../utils/diagnosis";

function ctx(overrides: Partial<AskContext> = {}): AskContext {
  return {
    category: "ac",
    symptom: "制冷效果变差",
    description: "空调开了半小时还是不凉",
    qa: [],
    device: null,
    ...overrides,
  };
}

const aiContent = {
  conclusion: "先检查滤网与室外机散热。",
  conclusion_elder: "先看看过滤网脏不脏。",
  possible_causes: [{ title: "过滤网积尘", description: "影响出风" }],
  evidence: [],
  unknown_information: [],
  suggestions: [{ title: "清洗滤网", description: "断电后清洗" }],
  suggestions_elder: [{ title: "第一步：拔电源", description: "洗过滤网" }],
  tips: "定期清洗。",
  tips_elder: "常洗滤网。",
  risk_note: "请勿自行拆机。",
  risk_note_elder: "不要自己拆。",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("旧数据兼容", () => {
  it("旧诊断缺少来源时标为 unknown，不推断为真实 AI", () => {
    const old = {
      id: "old-1",
      deviceId: 1,
      deviceName: "客厅空调",
      category: "ac",
      symptom: "不制冷",
      description: "",
      createdAt: "2026-11-01T00:00:00.000Z",
      conclusion: "旧结论",
      possibleCauses: [{ title: "旧原因", description: "旧说明" }],
      evidence: ["旧事实"],
      suggestions: [{ title: "旧建议", description: "旧做法" }],
      tips: null,
      riskNote: null,
      riskLevel: "low",
      status: "completed",
    };
    const normalized = normalizeDiagnosis(old);
    expect(normalized.source).toBe("unknown");
    expect(normalized.qa).toEqual([]);
    expect(normalized.content?.standard.conclusion).toBe("旧结论");
    expect(hasElderCopy(normalized)).toBe(false);
    expect(contentFor(normalized, "elder").exact).toBe(false);
  });

  it("旧草稿的 answers 按固定问题顺序迁移为 qa（含未知标记）", () => {
    const draft = normalizeDraft({
      step: 2,
      category: "ac",
      symptom: "制冷效果变差",
      description: "",
      answers: ["不知道", "完全没有冷风"],
      chat: [],
    });
    expect(draft.qa).toHaveLength(2);
    expect(draft.qa[0].questionId).toBe("ac_filter_clean");
    expect(draft.qa[0].unknown).toBe(true);
    expect(draft.qa[1].questionId).toBe("ac_cold_wind");
  });

  it("旧草稿缺少类别时不迁移问答，不编造问题", () => {
    const draft = normalizeDraft({ step: 2, answers: ["亮"] });
    expect(draft.qa).toEqual([]);
  });
});

describe("问答上下文与事实追溯", () => {
  it("问诊逐题推进，完成后返回 result", () => {
    expect(nextTurn(ctx(), "standard").kind).toBe("question");
    expect(nextTurn(ctx({ qa: [{ questionId: "ac_filter_clean", questionText: "q", answer: "洗过", unknown: false }] }), "standard").kind).toBe("question");
    expect(
      nextTurn(
        ctx({
          qa: [
            { questionId: "ac_filter_clean", questionText: "q1", answer: "洗过", unknown: false },
            { questionId: "ac_cold_wind", questionText: "q2", answer: "有冷风", unknown: false },
          ],
        }),
        "standard"
      ).kind
    ).toBe("result");
  });

  it("未知回答进入待确认信息，不进入已确认事实", () => {
    const facts = buildEvidence(
      ctx({
        qa: [
          {
            questionId: "ac_filter_clean",
            questionText: "最近有清洗过空调过滤网吗？",
            answer: "不知道",
            unknown: true,
          },
        ],
      })
    );
    expect(facts.evidence.join("\n")).not.toContain("不知道");
    expect(facts.unknownInformation.join("\n")).toContain("不知道");
  });

  it("高风险输入在问诊阶段直接拦截（与模式无关）", () => {
    const high = nextTurn(ctx({ description: "空调冒烟了" }), "standard");
    expect(high.kind).toBe("interception");
    const highElder = nextTurn(ctx({ description: "空调冒烟了" }), "elder");
    expect(highElder.kind).toBe("interception");
  });
});

describe("模板演示与双文案", () => {
  it("模板诊断来源恒为 template，并保存标准 / 长辈双文案", () => {
    const diagnosis = buildTemplateDiagnosis(
      ctx({
        qa: [
          {
            questionId: "ac_filter_clean",
            questionText: "最近有清洗过空调过滤网吗？",
            answer: "上个月洗过",
            unknown: false,
          },
        ],
      })
    );
    expect(diagnosis.source).toBe("template");
    expect(diagnosis.content?.standard.conclusion).not.toBe("");
    expect(diagnosis.content?.elder?.conclusion).not.toBe("");
    expect(diagnosis.content?.standard.possibleCauses.length).toBe(
      diagnosis.content?.elder?.possibleCauses.length
    );
    expect(diagnosis.evidence.join("\n")).toContain("上个月洗过");
  });
});

describe("真实 AI 失败不静默回退", () => {
  it("模型未配置时返回错误，不返回模板冒充 AI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          detail: { code: "ai_not_configured", message: "AI 服务未配置" },
        }),
      }))
    );
    const result = await generateAIDiagnosis(ctx(), "standard");
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === "error") {
      expect(result.error.code).toBe("ai_not_configured");
    }
  });

  it("成功响应映射双文案、来源 ai 与后端风险下限", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          source: "ai",
          model: "glm-4-flash",
          content: aiContent,
          risk_floor: "medium",
          risk_matched: [],
          safety_rules_version: "SAFETY-2026-11-18-A",
        }),
      }))
    );
    const result = await generateAIDiagnosis(ctx(), "standard");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const diagnosis: Diagnosis = result.diagnosis;
      expect(diagnosis.source).toBe("ai");
      expect(diagnosis.model).toBe("glm-4-flash");
      expect(diagnosis.content?.standard.conclusion).toBe(aiContent.conclusion);
      expect(diagnosis.content?.elder?.conclusion).toBe(aiContent.conclusion_elder);
      expect(diagnosis.riskLevel).toBe("medium");
      expect(diagnosis.qa).toHaveLength(0);
    }
  });
});

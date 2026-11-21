import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrefs } from "../stores/prefs";
import {
  normalizeSpeechText,
  resetSpeechForTests,
  shouldAutoRead,
  speak,
  speechLeadIn,
  splitForSpeech,
  stopSpeech,
  useSpeech,
} from "../services/speech";

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: { name: string; lang: string } | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

let spoken: FakeUtterance[] = [];
let cancelCount = 0;

function installSpeech(voices: Array<{ name: string; lang: string }> = []) {
  spoken = [];
  cancelCount = 0;
  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    pitch = 1;
    voice: { name: string; lang: string } | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  const fakeSynth = {
    paused: false,
    speaking: false,
    getVoices: () => voices,
    addEventListener: () => undefined,
    speak: (u: FakeUtterance) => {
      spoken.push(u);
      setTimeout(() => u.onstart?.(), 0);
    },
    cancel: () => {
      cancelCount += 1;
    },
    resume: () => undefined,
  };
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", fakeSynth);
}

beforeEach(() => {
  // 测试环境为 node：把 window 指向全局对象，供 speech 服务按浏览器路径运行
  vi.stubGlobal("window", globalThis);
  // 默认既没有原生语音，也没有云端能力；各用例按需覆盖
  vi.stubGlobal("speechSynthesis", undefined);
  vi.stubGlobal("SpeechSynthesisUtterance", undefined);
  vi.stubGlobal("fetch", undefined);
  vi.stubGlobal("Audio", undefined);
  resetSpeechForTests();
  usePrefs.setState({ voiceEnabled: true, autoRead: false, speechRate: 1, mode: "standard" });
});

afterEach(() => {
  stopSpeech();
  vi.unstubAllGlobals();
});

describe("语音朗读（阶段十三）", () => {
  it("整理朗读文本：合并标点与空白，不读出空段落", () => {
    expect(
      normalizeSpeechText(["结论一", null, "  ", "结论二。"])
    ).toBe("结论一。结论二");
    expect(normalizeSpeechText(["AI 建议：**先断电**"])).toBe(
      "AI 建议：先断电"
    );
  });

  it("默认优先较自然的中文系统音色，也可手动指定音色", async () => {
    installSpeech([
      { name: "Microsoft Huihui - Chinese (Simplified, PRC)", lang: "zh-CN" },
      { name: "Microsoft Yaoyao - Chinese (Simplified, PRC)", lang: "zh-CN" },
      { name: "Microsoft Kangkang - Chinese (Simplified, PRC)", lang: "zh-CN" },
    ]);
    usePrefs.setState({ speechVoiceURI: null });
    speak({ key: "k0", text: "音色" });
    await new Promise((r) => setTimeout(r, 60));
    expect(spoken[0].voice?.name).toContain("Yaoyao");

    usePrefs.setState({ speechVoiceURI: "Microsoft Kangkang - Chinese (Simplified, PRC)" });
    speak({ key: "k1", text: "换音色" });
    await new Promise((r) => setTimeout(r, 60));
    expect(spoken[spoken.length - 1].voice?.name).toContain("Kangkang");
  });

  it("模板与未记录来源有明确朗读前说明", () => {
    expect(speechLeadIn("template")).toContain("并非真实 AI 诊断");
    expect(speechLeadIn("unknown")).toContain("无法确认");
    expect(speechLeadIn("ai")).toBe("");
  });

  it("朗读时优先选择中文音色，并按设置语速播放", async () => {
    installSpeech([
      { name: "English", lang: "en-US" },
      { name: "Tingting", lang: "zh-CN" },
    ]);
    expect(speak({ key: "k1", text: "您好" })).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.name).toBe("Tingting");
    expect(spoken[0].rate).toBe(1);
    expect(useSpeech.getState().status).toBe("speaking");
    expect(useSpeech.getState().activeKey).toBe("k1");
  });

  it("开始新段落时停止旧内容，同一时间只播放一段", async () => {
    installSpeech([{ name: "Tingting", lang: "zh-CN" }]);
    speak({ key: "k1", text: "第一段" });
    await new Promise((r) => setTimeout(r, 50));
    speak({ key: "k2", text: "第二段" });
    await new Promise((r) => setTimeout(r, 60));
    expect(cancelCount).toBeGreaterThanOrEqual(1);
    expect(spoken).toHaveLength(2);
    expect(useSpeech.getState().activeKey).toBe("k2");
  });

  it("停止后状态复位，且关闭语音时拒绝朗读", async () => {
    installSpeech([{ name: "Tingting", lang: "zh-CN" }]);
    speak({ key: "k1", text: "第一段" });
    await new Promise((r) => setTimeout(r, 60));
    stopSpeech();
    expect(useSpeech.getState().status).toBe("idle");
    expect(useSpeech.getState().activeKey).toBeNull();

    usePrefs.setState({ voiceEnabled: false });
    const result = speak({ key: "k2", text: "第二段" });
    expect(result).toBe(false);
    expect(useSpeech.getState().status).toBe("error");
  });

  it("浏览器不支持时明确失败，不影响文字内容", () => {
    expect(speak({ key: "k1", text: "您好" })).toBe(false);
    expect(useSpeech.getState().error).toContain("不支持");
  });

  it("原生可用时不调用云端接口", async () => {
    installSpeech([{ name: "Tingting", lang: "zh-CN" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Audio", class {});
    expect(speak({ key: "k1", text: "原生优先" })).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("没有原生语音时走云端合成并依次播放", async () => {
    const calls: Array<{ url: string; body: { text: string; speed: number } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init.body)),
        });
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array(128)]),
        } as unknown as Response;
      })
    );
    class FakeAudio {
      src = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }
      pause() {}
      removeAttribute() {}
      load() {}
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    });

    expect(speak({ key: "cloud:1", text: "您好，我是修必达。" })).toBe(true);
    expect(useSpeech.getState().loading).toBe(true);
    await new Promise((r) => setTimeout(r, 60));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/tts");
    expect(calls[0].body).toEqual({ text: "您好，我是修必达", speed: 1 });
    expect(useSpeech.getState().status).toBe("idle");
    expect(useSpeech.getState().loading).toBe(false);
  });

  it("云端朗读失败时给出可读提示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          detail: { code: "tts_unavailable", message: "云端朗读暂不可用，请稍后重试" },
        }),
      }) as unknown as Response)
    );
    class FakeAudio {
      src = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        return Promise.resolve();
      }
      pause() {}
      removeAttribute() {}
      load() {}
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    });

    expect(speak({ key: "cloud:2", text: "失败提示" })).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(useSpeech.getState().status).toBe("error");
    expect(useSpeech.getState().errorSource).toBe("cloud");
    expect(useSpeech.getState().error).toContain("云端朗读");
  });

  it("长文本按标点分段，单段不超过上限", () => {
    const text = "第一句。".repeat(100);
    const chunks = splitForSpeech(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  it("自动朗读同一段只触发一次（刷新 / 重渲染不重复）", () => {
    resetSpeechForTests();
    expect(shouldAutoRead("auto:q1:standard")).toBe(true);
    expect(shouldAutoRead("auto:q1:standard")).toBe(false);
    // 切换长辈模式视为另一段文案，可再次朗读
    expect(shouldAutoRead("auto:q1:elder")).toBe(true);
  });
});

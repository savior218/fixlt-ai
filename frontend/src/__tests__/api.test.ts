import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDevice, listDevices } from "../services/api";

/** 模拟始终不返回的请求：只在 AbortSignal 触发时以 AbortError 结束 */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("接口超时策略（免费实例冷启动）", () => {
  it("只读请求超时后自动重试一次", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const pending = listDevices();
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });

    // 第一次 30s 超时 → 自动重试一次（60s）→ 仍超时后报错
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("写请求超时不自动重试，避免重复创建", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const pending = createDevice({
      name: "客厅空调",
      category: "ac",
      brand: "格力",
      model: "KFR-35GW",
      purchase_date: null,
      location: "客厅",
      image_url: null,
      note: null,
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

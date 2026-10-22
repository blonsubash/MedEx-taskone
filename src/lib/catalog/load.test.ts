import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { loadCatalog } from "./load";

const collections = {
  "/api/category/active": fixture.categories,
  "/api/providers": fixture.providers,
  "/api/service": fixture.services,
};

afterEach(() => vi.unstubAllGlobals());

describe("loadCatalog", () => {
  it("fetches all three endpoints concurrently with the same abort signal and normalizes them", async () => {
    const pending: (() => void)[] = [];
    const fetcher = vi.fn((url: keyof typeof collections) => new Promise<Response>((resolve) => {
      pending.push(() => resolve(Response.json(collections[url])));
    }));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = loadCatalog(controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const url of Object.keys(collections)) {
      expect(fetcher).toHaveBeenCalledWith(url, { signal: controller.signal, cache: "no-store" });
    }
    pending.forEach((resolve) => resolve());
    const catalog = await result;
    expect(catalog.services).toHaveLength(2853);
    expect(catalog.providersById.size).toBe(65);
  });

  it.each(Object.keys(collections))("rejects the entire load when %s fails", async (failedUrl) => {
    vi.stubGlobal("fetch", vi.fn(async (url: keyof typeof collections) =>
      url === failedUrl ? new Response(null, { status: 503 }) : Response.json(collections[url])));
    await expect(loadCatalog(new AbortController().signal)).rejects.toThrow("503");
  });

  it("rejects a non-array response instead of displaying a partial catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "unexpected response" })));
    await expect(loadCatalog(new AbortController().signal)).rejects.toThrow("Invalid");
  });

  it("propagates a network failure so the UI can offer a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(loadCatalog(new AbortController().signal)).rejects.toThrow("Failed to fetch");
  });

  it("passes cancellation through to the requests", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, { signal }: RequestInit) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const controller = new AbortController();
    const result = loadCatalog(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { CatalogLoadError, loadCatalog, readCatalogSimulation } from "./load";

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

  it.each([
    ["categories", "/api/category/active"], ["providers", "/api/providers"], ["services", "/api/service"],
  ])("rejects the entire load when %s fails", async (collection, failedUrl) => {
    vi.stubGlobal("fetch", vi.fn(async (url: keyof typeof collections) =>
      url === failedUrl ? new Response(null, { status: 503 }) : Response.json(collections[url])));
    await expect(loadCatalog(new AbortController().signal)).rejects.toMatchObject({
      name: "CatalogLoadError", collection,
      message: expect.stringContaining("503"),
    });
  });

  it("identifies malformed JSON with its endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: keyof typeof collections) => url === "/api/providers"
      ? new Response("{") : Response.json(collections[url])));
    await expect(loadCatalog(new AbortController().signal)).rejects.toMatchObject({ collection: "providers" });
  });

  it("forces only the chosen endpoint to fail and retries all collections without the failure", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url, "http://localhost");
      return parsed.searchParams.has("fail") ? new Response(null, { status: 503 })
        : Response.json(collections[parsed.pathname as keyof typeof collections]);
    });
    vi.stubGlobal("fetch", fetcher);
    const params = new URLSearchParams("mockFail=providers&mockDelay=1200&q=checkup&currency=THB");
    await expect(loadCatalog(new AbortController().signal, readCatalogSimulation(params))).rejects.toBeInstanceOf(CatalogLoadError);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/category/active?delay=1200", "/api/providers?delay=1200&fail=true", "/api/service?delay=1200",
    ]);
    const catalog = await loadCatalog(new AbortController().signal, readCatalogSimulation(params, true));
    expect(catalog.services).toHaveLength(2853);
    expect(fetcher.mock.calls.slice(3).every(([url]) => !url.includes("fail="))).toBe(true);
    expect(params.toString()).toBe("mockFail=providers&mockDelay=1200&q=checkup&currency=THB");
  });

  it.each(["mockFail=__proto__&mockDelay=-1", "mockFail=bad&mockDelay=5001", "mockDelay=", "mockDelay=1.5", "mockDelay=Infinity"])("ignores invalid simulation controls: %s", (query) => {
    expect(readCatalogSimulation(new URLSearchParams(query))).toEqual({});
  });

  it.each([0, 5000])("accepts the delay boundary %i", (delay) => {
    expect(readCatalogSimulation(new URLSearchParams(`mockDelay=${delay}`))).toEqual({ delay });
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogLoadError } from "./load";
import { createCatalogResource, LOAD_TIMEOUT_MS, SLOW_LOAD_MS } from "./resource";
import type { CatalogResource } from "./resource";
import type { Catalog } from "./types";

const catalog: Catalog = { services: [], providersById: new Map(), categoriesById: new Map(), subcategoriesById: new Map() };
const disposers: (() => void)[] = [];
function setup(online = true) {
  const connection = new EventTarget();
  const requests: { signal: AbortSignal; retry: boolean; resolve: (data: Catalog) => void; reject: (error: Error) => void }[] = [];
  const updates: CatalogResource[] = [];
  const resource = createCatalogResource({
    connection,
    isOnline: () => online,
    load: (signal, retry) => new Promise<Catalog>((resolve, reject) => requests.push({ signal, retry, resolve, reject })),
    publish: (state) => updates.push(state),
  });
  disposers.push(resource.dispose);
  return {
    resource, requests, updates,
    get latest() { return updates.at(-1); },
    setOnline(value: boolean) {
      online = value;
      connection.dispatchEvent(new Event(value ? "online" : "offline"));
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); vi.useRealTimers(); });

describe("catalog resource recovery", () => {
  it("gives slow feedback without restarting requests and clears timers on success", async () => {
    const session = setup();
    expect(session.latest).toEqual({ status: "loading", slow: false });
    await vi.advanceTimersByTimeAsync(SLOW_LOAD_MS - 1);
    expect(session.latest).toEqual({ status: "loading", slow: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(session.latest).toEqual({ status: "loading", slow: true });
    expect(session.requests).toHaveLength(1);
    session.requests[0].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest).toEqual({ status: "ready", data: catalog, offline: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["categories", "providers", "services"] as const)("recovers from a %s failure", async (collection) => {
    const session = setup();
    session.requests[0].reject(new CatalogLoadError(collection, "503"));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest).toEqual({ status: "error", message: `We couldn’t load the ${collection}.` });
    expect(vi.getTimerCount()).toBe(0);
    session.resource.retry();
    expect(session.requests[1].retry).toBe(true);
    session.requests[1].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest?.status).toBe("ready");
  });

  it("offers a retry for network errors", async () => {
    const session = setup();
    session.requests[0].reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest?.status).toBe("error");
    session.resource.retry();
    expect(session.latest).toEqual({ status: "loading", slow: false });
  });

  it("does not request data while offline and automatically loads on reconnect", async () => {
    const session = setup(false);
    expect(session.latest).toEqual({ status: "offline" });
    session.resource.retry();
    expect(session.requests).toHaveLength(0);
    session.setOnline(true);
    expect(session.requests).toHaveLength(1);
    session.requests[0].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest?.status).toBe("ready");
  });

  it("cancels an interrupted load and ignores stale completions after reconnect", async () => {
    const session = setup();
    session.setOnline(false);
    expect(session.requests[0].signal.aborted).toBe(true);
    expect(session.latest).toEqual({ status: "offline" });
    expect(vi.getTimerCount()).toBe(0);
    session.setOnline(true);
    session.requests[0].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest).toEqual({ status: "loading", slow: false });
    session.requests[1].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest?.status).toBe("ready");
  });

  it("keeps the loaded catalog available offline without refetching on reconnect", async () => {
    const session = setup();
    session.requests[0].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    session.setOnline(false);
    expect(session.latest).toEqual({ status: "ready", data: catalog, offline: true });
    session.setOnline(true);
    expect(session.latest).toEqual({ status: "ready", data: catalog, offline: false });
    expect(session.requests).toHaveLength(1);
  });

  it("aborts stalled requests after a bounded wait and permits a new attempt", async () => {
    const session = setup();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect(session.requests[0].signal.aborted).toBe(true);
    expect(session.latest).toEqual({ status: "error", message: "The services are taking too long to load." });
    session.resource.retry();
    session.requests[0].reject(new Error("late rejection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest).toEqual({ status: "loading", slow: false });
    session.requests[1].resolve(catalog);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.latest?.status).toBe("ready");
  });

  it("cleans up requests, timers, and connection listeners on disposal", async () => {
    const session = setup();
    session.resource.dispose();
    const count = session.updates.length;
    session.requests[0].resolve(catalog);
    session.setOnline(false);
    session.setOnline(true);
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect(session.requests[0].signal.aborted).toBe(true);
    expect(session.requests).toHaveLength(1);
    expect(session.updates).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
});

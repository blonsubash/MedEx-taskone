import { afterEach, describe, expect, it, vi } from "vitest";

import { createSearchScheduler, normalizeSearchQuery } from "./search";

afterEach(() => vi.useRealTimers());

describe("search input scheduling", () => {
  it("normalizes repeated whitespace while preserving case and punctuation", () => {
    expect(normalizeSearchQuery("  hba1c  TEST\n (Diabetes)\t ")).toBe("hba1c TEST (Diabetes)");
    expect(normalizeSearchQuery(" \u00a0 ")).toBe("");
  });

  it("coalesces typing into one normalized update after 300 ms", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const search = createSearchScheduler(apply);
    search.schedule("hea");
    vi.advanceTimersByTime(200);
    search.schedule("  health   check ");
    vi.advanceTimersByTime(299);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledExactlyOnceWith("health check");
  });

  it("flushes Enter/Search immediately and prevents a duplicate pending update", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const search = createSearchScheduler(apply);
    search.schedule("old");
    search.flush(" new   query ");
    expect(apply).toHaveBeenCalledExactlyOnceWith("new query");
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("cancels pending typing when navigating away or restoring browser history", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const search = createSearchScheduler(apply);
    search.schedule("should not apply");
    search.cancel();
    vi.runAllTimers();
    expect(apply).not.toHaveBeenCalled();
    search.schedule("after navigation");
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledExactlyOnceWith("after navigation");
  });

  it("clears immediately without allowing an old query to reappear", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const search = createSearchScheduler(apply);
    search.schedule("pending");
    search.flush("");
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledExactlyOnceWith("");
  });

  it("keeps separate search instances independent", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const other = vi.fn();
    const search = createSearchScheduler(apply);
    createSearchScheduler(other).schedule("other query");
    search.schedule("cancel me");
    search.cancel();
    vi.runAllTimers();
    expect(apply).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledExactlyOnceWith("other query");
  });
});

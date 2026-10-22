import { describe, expect, it } from "vitest";

import {
  buildExplorerHref, parseExplorerState, serializeExplorerState,
  toSearchParams, updateExplorerQuery,
} from "./explorer-state";
import type { ExplorerPatch } from "./explorer-state";

const parse = (query = "") => parseExplorerState(new URLSearchParams(query));
const selected = "q=old&type=package&category=cat&subcategory=child&provider=48&city=bangkok&currency=THB&min=100&max=500&home=true&sort=rating&page=4";

describe("URL parsing", () => {
  it("has explicit defaults and writes them as an empty query", () => {
    const state = parse();
    expect(state).toEqual({
      query: "", types: [], categoryId: null, subcategoryId: null,
      providerIds: [], location: null, currency: null, minPrice: null,
      maxPrice: null, homeTest: false, sort: "relevance", page: 1,
    });
    expect(serializeExplorerState(state).toString()).toBe("");
  });

  it("reads all filters, sorting, and pagination", () => {
    expect(parse(selected)).toEqual({
      query: "old", types: ["package"], categoryId: "cat", subcategoryId: "child",
      providerIds: [48], location: { kind: "city", id: "bangkok" },
      currency: "THB", minPrice: "100", maxPrice: "500", homeTest: true,
      sort: "rating", page: 4,
    });
  });

  it("normalizes multi-selects without dropping valid IDs absent from loaded data", () => {
    const state = parse("type=wellness&type=package&type=unknown&type=package&provider=048&provider=2&provider=48&provider=0&provider=-1&provider=1.5&provider=1e3&provider=9007199254740992");
    expect(state.types).toEqual(["package", "wellness"]);
    expect(state.providerIds).toEqual([2, 48]);
  });

  it("keeps category identity as an ID and clears an orphan subcategory", () => {
    expect(parse("category=lab-ultrasound-id&subcategory=thyroid-id"))
      .toMatchObject({ categoryId: "lab-ultrasound-id", subcategoryId: "thyroid-id" });
    expect(parse("subcategory=thyroid-id").subcategoryId).toBeNull();
  });

  it("prefers a specific city over country when both are provided", () => {
    expect(parse("city=bangkok&country=219").location).toEqual({ kind: "city", id: "bangkok" });
    expect(parse("city=&country=219").location).toEqual({ kind: "country", id: 219 });
    expect(parse("country=-1").location).toBeNull();
  });

  it.each(["0", "-2", "1.5", "1e3", "2abc", "Infinity", "9007199254740992", ""])(
    "defaults invalid page %j to one",
    (page) => expect(parse(`page=${page}`).page).toBe(1),
  );

  it("accepts a safe page number without guessing the total number of pages", () => {
    expect(parse("page=00012").page).toBe(12);
    expect(parse("page=9999").page).toBe(9999);
  });

  it("uses the first scalar value and requires explicit boolean and enum values", () => {
    expect(parse("q=first&q=second&page=3&page=8&sort=unknown&sort=rating&home=1"))
      .toMatchObject({ query: "first", page: 3, sort: "relevance", homeTest: false });
    expect(parse("home=true").homeTest).toBe(true);
    expect(parse("home=false").homeTest).toBe(false);
  });

  it.each(["", "currency=USD", "currency=thb"])(
    "does not apply unscoped price bounds for %j",
    (currency) => expect(parse(`${currency}&min=0&max=5000`))
      .toMatchObject({ currency: null, minPrice: null, maxPrice: null }),
  );

  it("preserves a zero bound and exact decimal values", () => {
    expect(parse("currency=THB&min=000.00&max=05000.0050"))
      .toMatchObject({ minPrice: "0", maxPrice: "5000.005" });
  });

  it("swaps reversed bounds without floating-point precision loss", () => {
    expect(parse("currency=NPR&min=9007199254740993.26&max=9007199254740993.25"))
      .toMatchObject({ minPrice: "9007199254740993.25", maxPrice: "9007199254740993.26" });
  });

  it.each(["-1", "NaN", "1e3", "1,000", "Infinity", ""])(
    "drops invalid bound %j independently of a valid bound",
    (bound) => expect(parse(`currency=INR&min=${encodeURIComponent(bound)}&max=100`))
      .toMatchObject({ minPrice: null, maxPrice: "100" }),
  );

  it("handles the Next.js server object and client search params identically", () => {
    const server = toSearchParams({
      q: "  Full   body ", type: ["wellness", "package"], provider: ["48", "46"],
      currency: "THB", max: "5000.00", missing: undefined,
    });
    expect(server.has("missing")).toBe(false);
    expect(parseExplorerState(server)).toEqual(parse(server.toString()));
    expect(parseExplorerState(server)).toMatchObject({ query: "Full body", providerIds: [46, 48] });
  });
});

describe("URL round trips", () => {
  it.each([
    "", selected,
    "q=%E0%A4%B8%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A5%8D%E0%A4%AF+%26+care%2B%2F%25%23&type=lab_test&type=package",
    "country=154&provider=46&provider=48&currency=NPR&min=0&max=1234.567&sort=price-asc&page=2",
    "category=package-ultrasound-id&subcategory=thyroid-id&home=true&sort=price-desc",
  ])("restores the complete canonical state for %j", (query) => {
    const original = parse(query);
    const before = structuredClone(original);
    const canonical = serializeExplorerState(original);
    expect(parseExplorerState(canonical)).toEqual(original);
    expect(serializeExplorerState(parseExplorerState(canonical)).toString()).toBe(canonical.toString());
    expect(original).toEqual(before);
  });

  it("normalizes manually constructed state using the same parser", () => {
    const state = { ...parse(), query: " full  body ", providerIds: [48, 2, 48], currency: "THB" as const, minPrice: "20", maxPrice: "10" };
    expect(parseExplorerState(serializeExplorerState(state)))
      .toMatchObject({ query: "full body", providerIds: [2, 48], minPrice: "10", maxPrice: "20" });
    expect(state.providerIds).toEqual([48, 2, 48]);
  });
});

describe("URL updates", () => {
  const patches: ExplorerPatch[] = [
    { query: "new" }, { types: ["lab_test"] }, { categoryId: "other" },
    { subcategoryId: "other-child" }, { providerIds: [46] },
    { location: { kind: "country", id: 219 } }, { currency: "NPR" },
    { minPrice: "200" }, { maxPrice: "400" }, { homeTest: false }, { sort: "price-asc" },
  ];
  it.each(patches)("resets pagination when filters or sorting change: %j", (patch) => {
    expect(parseExplorerState(updateExplorerQuery(new URLSearchParams(selected), patch)).page).toBe(1);
  });

  it("changes only the page when paging", () => {
    expect(parseExplorerState(updateExplorerQuery(new URLSearchParams(selected), { page: 5 })))
      .toEqual({ ...parse(selected), page: 5 });
  });

  it("keeps pagination for normalized no-op edits, including undefined fields", () => {
    const next = updateExplorerQuery(new URLSearchParams(selected), {
      query: undefined, categoryId: undefined, minPrice: "100.00", types: ["package", "package"],
    });
    expect(parseExplorerState(next)).toEqual(parse(selected));
  });

  it("clears a child on parent changes but supports a complete batch selection", () => {
    const current = new URLSearchParams(selected);
    expect(parseExplorerState(updateExplorerQuery(current, { categoryId: "new" })).subcategoryId).toBeNull();
    expect(parseExplorerState(updateExplorerQuery(current, { categoryId: "new", subcategoryId: "new-child" })))
      .toMatchObject({ categoryId: "new", subcategoryId: "new-child" });
    expect(parseExplorerState(updateExplorerQuery(current, { categoryId: null })).subcategoryId).toBeNull();
  });

  it("clears old price bounds when currency changes instead of reinterpreting amounts", () => {
    const current = new URLSearchParams(selected);
    expect(parseExplorerState(updateExplorerQuery(current, { currency: "NPR" })))
      .toMatchObject({ currency: "NPR", minPrice: null, maxPrice: null });
    expect(parseExplorerState(updateExplorerQuery(current, { currency: "NPR", maxPrice: "2500" })))
      .toMatchObject({ currency: "NPR", minPrice: null, maxPrice: "2500" });
    expect(parseExplorerState(updateExplorerQuery(current, { currency: null, minPrice: "100" })))
      .toMatchObject({ currency: null, minPrice: null, maxPrice: null });
  });

  it("replaces city with country and preserves unknown query keys without mutating input", () => {
    const current = new URLSearchParams(`${selected}&utm_source=friend&tag=a&tag=b`);
    const before = current.toString();
    const next = updateExplorerQuery(current, { location: { kind: "country", id: 219 } });
    expect(next.has("city")).toBe(false);
    expect(next.get("country")).toBe("219");
    expect(next.get("utm_source")).toBe("friend");
    expect(next.getAll("tag")).toEqual(["a", "b"]);
    expect(current.toString()).toBe(before);
  });

  it("preserves the pathname and hash when constructing a navigation URL", () => {
    const href = buildExplorerHref("https://example.com/explorer?utm_source=friend&page=4#results", { query: "heart & care" });
    const url = new URL(href, "https://example.com");
    expect(url.pathname).toBe("/explorer");
    expect(url.hash).toBe("#results");
    expect(url.searchParams.get("utm_source")).toBe("friend");
    expect(url.searchParams.get("q")).toBe("heart & care");
    expect(parseExplorerState(url.searchParams).page).toBe(1);
  });
});

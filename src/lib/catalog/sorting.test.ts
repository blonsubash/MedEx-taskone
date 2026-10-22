import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState, updateExplorerQuery } from "@/lib/explorer-state";
import { normalizeCatalog } from "./normalize";
import { getProviderGroups, prepareServices } from "./results";
import type { ProviderGroup } from "./results";
import type { Service } from "./types";
import { paginateProviderGroups, PROVIDERS_PER_PAGE, sortProviderGroups } from "./sorting";

const catalog = normalizeCatalog(fixture);
const base = catalog.services[0];
const state = (query = "") => parseExplorerState(new URLSearchParams(query));
function group(id: number, name: string, rows: Partial<Service>[], currency = "THB", rating: number | null = null): ProviderGroup {
  const provider = { ...base.provider, id, name, currency, rating };
  const services = rows.map((row, index) => {
    const service = { ...base, id: `${id}-${index}`, title: `Service ${index}`, type: "lab_test" as const,
      category: null, subcategory: null, price: "100", discount: "0", discountType: "amount",
      serviceCharge: "0", serviceChargeType: "amount", ...row, provider };
    service.searchText = [service.title, name, service.category?.title, service.subcategory?.title]
      .filter(Boolean).join(" ").toLowerCase();
    return service;
  });
  return { provider, services: prepareServices(services) };
}
const providerIds = (groups: ProviderGroup[]) => groups.map(({ provider }) => provider.id);
const rowIds = (group: ProviderGroup) => group.services.map(({ service }) => service.id);

describe("provider and service sorting", () => {
  it("ranks exact title, partial title, provider, and category matches in that order", () => {
    const category = { ...catalog.categoriesById.values().next().value!, title: "Heart" };
    const groups = [group(1, "A Clinic", [{ title: "Other", category }]),
      group(2, "B Heart Clinic", [{ title: "Other" }]),
      group(3, "Y Clinic", [{ title: "Heart screening" }]),
      group(4, "Z Clinic", [{ title: "Heart" }])];
    expect(providerIds(sortProviderGroups(groups, state("q=heart")))).toEqual([4, 3, 2, 1]);
  });

  it("ranks a provider by its best matching service and puts that service first", () => {
    const groups = [group(1, "A Heart Clinic", [{ title: "Screening" }]),
      group(2, "Z Heart Clinic", [{ id: "provider-match", title: "General" }, { id: "title-match", title: "Heart" }])];
    const sorted = sortProviderGroups(groups, state("q=heart"));
    expect(providerIds(sorted)).toEqual([2, 1]);
    expect(rowIds(sorted[0])).toEqual(["title-match", "provider-match"]);
  });

  it("normalizes relevance query case and whitespace", () => {
    const groups = [group(1, "A Clinic", [{ title: "Other", category: { ...base.category!, title: "Heart Check" } }]),
      group(2, "Z Clinic", [{ title: "HEART   Check" }])];
    expect(providerIds(sortProviderGroups(groups, state("q=++heart+++CHECK++")))).toEqual([2, 1]);
  });

  it("uses provider names/IDs and service titles/IDs for deterministic ties", () => {
    const groups = [group(3, "Same", [{ id: "b", title: "Same" }, { id: "a", title: "Same" }]),
      group(2, "Same", [{ title: "Zebra" }, { title: "Alpha" }]), group(1, "Alpha", [{}])];
    const sorted = sortProviderGroups(groups, state());
    expect(providerIds(sorted)).toEqual([1, 2, 3]);
    expect(sorted[1].services.map(({ service }) => service.title)).toEqual(["Alpha", "Zebra"]);
    expect(rowIds(sorted[2])).toEqual(["a", "b"]);
    expect(sortProviderGroups([...groups].reverse(), state())).toEqual(sorted);
  });

  it("uses the cheapest matching service ascending and most expensive descending", () => {
    const groups = [group(1, "A", [{ id: "high", price: "900" }, { id: "low", price: "100" }]),
      group(2, "B", [{ price: "200" }])];
    const ascending = sortProviderGroups(groups, state("sort=price-asc"));
    const descending = sortProviderGroups(groups, state("sort=price-desc"));
    expect(providerIds(ascending)).toEqual([1, 2]);
    expect(rowIds(ascending[0])).toEqual(["low", "high"]);
    expect(providerIds(descending)).toEqual([1, 2]);
    expect(rowIds(descending[0])).toEqual(["high", "low"]);
  });

  it("compares decimal prices exactly, beyond Number precision", () => {
    const groups = [group(1, "A", [{ price: "9007199254740993.26" }]),
      group(2, "Z", [{ price: "9007199254740993.25" }])];
    expect(providerIds(sortProviderGroups(groups, state("sort=price-asc")))).toEqual([2, 1]);
    expect(providerIds(sortProviderGroups(groups, state("sort=price-desc")))).toEqual([1, 2]);
  });

  it("uses final prices after discounts and charges", () => {
    const groups = [group(1, "Z", [{ price: "100", discount: "10", discountType: "percent",
      serviceCharge: "7", serviceChargeType: "percent" }]), group(2, "A", [{ price: "96.31" }])];
    expect(providerIds(sortProviderGroups(groups, state("sort=price-asc")))).toEqual([1, 2]);
  });

  it.each(["price-asc", "price-desc"])("keeps unknown prices last for %s and treats free as zero", (sort) => {
    const groups = [group(1, "A unknown", [{ price: null }]), group(2, "B free", [{ price: "0" }]),
      group(3, "C paid", [{ price: "100" }, { id: "unknown-row", price: null }]),
      group(4, "D wellness", [{ type: "wellness", wellnessPricing: [] }])];
    const sorted = sortProviderGroups(groups, state(`sort=${sort}`));
    expect(providerIds(sorted)).toEqual(sort === "price-asc" ? [2, 3, 1, 4] : [3, 2, 1, 4]);
    expect(rowIds(sorted.find(({ provider }) => provider.id === 3)!)).toEqual(["3-0", "unknown-row"]);
  });

  it.each(["price-asc", "price-desc"])("separates currencies before comparing prices for %s", (sort) => {
    const groups = [group(1, "INR", [{ price: "0" }], "INR"), group(2, "NPR", [{ price: "999999" }], "NPR"),
      group(3, "THB low", [{ price: "1" }]), group(4, "THB high", [{ price: "2" }])];
    expect(providerIds(sortProviderGroups(groups, state(`sort=${sort}`))))
      .toEqual(sort === "price-asc" ? [3, 4, 2, 1] : [4, 3, 2, 1]);
  });

  it("places unsupported currencies after known groups with unavailable prices", () => {
    const groups = [group(1, "USD", [{ price: "1" }], "USD"), group(2, "THB", [{ price: "100" }])];
    expect(providerIds(sortProviderGroups(groups, state("sort=price-asc")))).toEqual([2, 1]);
  });

  it("ranks ratings descending with zero above unrated and deterministic ties", () => {
    const groups = [group(1, "Unknown", [{}]), group(2, "Zero", [{}], "THB", 0),
      group(3, "B", [{}], "THB", 4.8), group(4, "A", [{}], "THB", 4.8)];
    expect(providerIds(sortProviderGroups(groups, state("sort=rating")))).toEqual([4, 3, 2, 1]);
  });

  it("keeps title matches first inside a rating-ranked provider", () => {
    const sorted = sortProviderGroups([group(1, "Heart Clinic", [
      { title: "A general screening" }, { title: "Heart" },
    ])], state("q=heart&sort=rating"));
    expect(sorted[0].services[0].service.title).toBe("Heart");
  });

  it("ranks wellness by its displayed lowest qualifying duration in either direction", () => {
    const groups = [group(1, "Wellness", [{ type: "wellness", wellnessPricing: [
      { id: "short", durationInMinutes: 30, price: "100", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
      { id: "medium", durationInMinutes: 60, price: "200", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
      { id: "long", durationInMinutes: 90, price: "300", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
    ] }]), group(2, "Fixed", [{ price: "250" }])];
    const filtered = getProviderGroups(groups.flatMap(({ services }) => services), state("currency=THB&min=150&max=300"));
    expect(providerIds(sortProviderGroups(filtered, state("sort=price-asc")))).toEqual([1, 2]);
    expect(providerIds(sortProviderGroups(filtered, state("sort=price-desc")))).toEqual([2, 1]);
    expect(filtered[0].services[0].pricing).toMatchObject({ startingOption: { id: "medium" } });
  });

  it("uses only matching services for ranking and retains all matches for card expansion", () => {
    const groups = [group(1, "A", [{ title: "Unrelated", price: "0" }, { title: "Match", price: "500" }]),
      group(2, "B", [{ title: "Match", price: "100" }])];
    const matching = getProviderGroups(groups.flatMap(({ services }) => services), state("q=match"));
    const sorted = sortProviderGroups(matching, state("q=match&sort=price-asc"));
    expect(providerIds(sorted)).toEqual([2, 1]);
    expect(sorted[1].services).toHaveLength(1);
  });

  it("does not mutate input groups, service arrays, or cached pricing", () => {
    const groups = [group(2, "B", [{ price: "900" }, { price: "100" }]), group(1, "A", [{ price: null }])];
    const before = structuredClone(groups);
    for (const sort of ["relevance", "price-asc", "price-desc", "rating"]) sortProviderGroups(groups, state(`sort=${sort}`));
    expect(groups).toEqual(before);
  });
});

describe("provider pagination", () => {
  const groups = Array.from({ length: 14 }, (_, index) => group(index + 1, `Provider ${index + 1}`, [{}, {}, {}, {}]));

  it("pages providers rather than services without truncating card matches", () => {
    const result = paginateProviderGroups(groups, 2);
    expect(PROVIDERS_PER_PAGE).toBe(6);
    expect(result).toMatchObject({ page: 2, pageCount: 3, totalProviders: 14, start: 7, end: 12 });
    expect(providerIds(result.groups)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(result.groups.every(({ services }) => services.length === 4)).toBe(true);
  });

  it("handles a partial last page and exact page boundary", () => {
    expect(paginateProviderGroups(groups, 3)).toMatchObject({ start: 13, end: 14, page: 3 });
    expect(paginateProviderGroups(groups, 3).groups).toHaveLength(2);
    expect(paginateProviderGroups(groups.slice(0, 12), 2)).toMatchObject({ end: 12, pageCount: 2 });
    expect(paginateProviderGroups(groups.slice(0, 6), 1).groups).toHaveLength(6);
  });

  it("clamps high pages to the final page", () => {
    expect(paginateProviderGroups(groups, 99999)).toEqual(paginateProviderGroups(groups, 3));
  });

  it.each([0, -1, 1.5, NaN, Infinity])("defaults invalid page %s to one", (page) => {
    expect(paginateProviderGroups(groups, page).page).toBe(1);
  });

  it("returns an empty first page with honest totals", () => {
    expect(paginateProviderGroups([], 999)).toEqual({ groups: [], page: 1, pageCount: 1, totalProviders: 0, start: 0, end: 0 });
  });

  it("covers each sorted provider exactly once without mutating groups", () => {
    const sorted = sortProviderGroups(groups, state());
    const before = structuredClone(sorted);
    const allPages = [1, 2, 3].flatMap((page) => paginateProviderGroups(sorted, page).groups);
    expect(allPages).toEqual(sorted);
    expect(new Set(providerIds(allPages)).size).toBe(14);
    expect(sorted).toEqual(before);
  });

  it("sorts before slicing and keeps totals before pagination for the full fixture", () => {
    const all = sortProviderGroups(getProviderGroups(prepareServices(catalog.services), state()), state("sort=rating"));
    const result = paginateProviderGroups(all, 1);
    expect(result).toMatchObject({ totalProviders: 64, pageCount: 11, start: 1, end: 6 });
    expect(all.reduce((count, group) => count + group.services.length, 0)).toBe(2853);
    expect(result.groups).toEqual(all.slice(0, 6));
    expect(all[0].provider.rating).toBe(Math.max(...catalog.services.map(({ provider }) => provider.rating ?? -1)));
  });

  it("preserves filters on page changes and resets only on actual filter/sort edits", () => {
    const query = new URLSearchParams("q=heart&type=lab_test&currency=THB&max=5000&sort=rating&page=2&note=keep");
    const paged = updateExplorerQuery(query, { page: 3 });
    expect(parseExplorerState(paged)).toEqual({ ...parseExplorerState(query), page: 3 });
    expect(paged.get("note")).toBe("keep");
    expect(parseExplorerState(updateExplorerQuery(paged, { sort: "price-asc" })).page).toBe(1);
    expect(parseExplorerState(updateExplorerQuery(paged, { maxPrice: "4000" })).page).toBe(1);
    expect(parseExplorerState(updateExplorerQuery(paged, { sort: "rating", maxPrice: "5000.00" })).page).toBe(3);
  });
});

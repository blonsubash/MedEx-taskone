import { describe, expect, it } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { getLocationOptions, getProviderOptions } from "./catalog/filter-options";
import { normalizeCatalog } from "./catalog/normalize";
import { filterServices, prepareServices } from "./catalog/results";
import { buildExplorerHref, parseExplorerState, updateExplorerQuery } from "./explorer-state";
import { clearFiltersPatch, getAppliedFilters } from "./applied-filters";

const catalog = normalizeCatalog(fixture);
const categories = [...catalog.categoriesById.values()];
const parent = categories.find((category) => category.type === "package" && category.children.length > 0)!;
const labels = { categories, locations: getLocationOptions(catalog.providersById.values()),
  providers: getProviderOptions(catalog.providersById.values()), ready: true };
const parse = (query = "") => parseExplorerState(new URLSearchParams(query));
const selected = `q=heart&type=package&type=lab_test&category=${parent.id}&subcategory=${parent.children[0].id}&provider=46&provider=48&country=219&currency=THB&min=0&max=5000&home=true&sort=rating&page=4`;
function remove(query: string, id: string) {
  const state = parse(query);
  const chip = getAppliedFilters(state, labels).find((filter) => filter.id === id)!;
  return parseExplorerState(updateExplorerQuery(new URLSearchParams(query), chip.remove));
}

describe("applied filter summaries and removal", () => {
  it("summarizes every applied filter separately, excluding sort and page", () => {
    const chips = getAppliedFilters(parse(selected), labels);
    expect(chips.map(({ id }) => id)).toEqual(["query", "type:package", "type:lab_test", "category", "subcategory",
      "provider:46", "provider:48", "location", "currency", "minPrice", "maxPrice", "homeTest"]);
    expect(chips.find(({ id }) => id === "category")?.label).toBe(`Category: ${parent.title} · Health package`);
    expect(chips.find(({ id }) => id === "subcategory")?.label).toBe(`Subcategory: ${parent.children[0].title}`);
    expect(chips.find(({ id }) => id === "provider:48")?.label).toBe("Provider: Riverside International Hospital · Bangkok, Thailand");
    expect(chips.find(({ id }) => id === "location")?.label).toBe("Country: Thailand");
  });

  it("has no filter chips for default filters even when sorted or paged", () => {
    expect(getAppliedFilters(parse("sort=rating&page=3"), labels)).toEqual([]);
  });

  it("labels cities with country context and uses removable placeholders for unknown locations", () => {
    const country = labels.locations.find((country) => country.name === "Thailand")!;
    const city = country.cities.find((city) => city.name === "Bangkok")!;
    expect(getAppliedFilters(parse(`city=${city.id}`), labels)[0].label).toBe("City: Bangkok, Thailand");
    expect(getAppliedFilters(parse("city=removed-id"), labels)[0]).toMatchObject({ label: "City: Unavailable city", remove: { location: null } });
    expect(getAppliedFilters(parse("country=999999"), labels)[0].label).toBe("Country: Unavailable country");
  });

  it("preserves exact decimal bounds instead of rounding the displayed constraint", () => {
    const chips = getAppliedFilters(parse("currency=THB&min=0&max=9007199254740993.005"), labels);
    expect(chips.map(({ label }) => label)).toEqual(["Currency: THB", "Minimum: THB 0", "Maximum: THB 9,007,199,254,740,993.005"]);
  });

  it("uses honest placeholders while labels load and identifies unavailable providers", () => {
    const loading = getAppliedFilters(parse(selected), { categories: [], locations: [], providers: [], ready: false });
    expect(loading.find(({ id }) => id === "provider:48")?.label).toBe("Provider: Selected provider #48");
    expect(loading.find(({ id }) => id === "category")?.label).toBe("Category: Selected category");
    expect(getAppliedFilters(parse("provider=999"), labels)[0].label).toBe("Provider: Unavailable provider #999");
  });

  it("clears category and child together, while child removal retains its parent", () => {
    const query = `category=${parent.id}&subcategory=${parent.children[0].id}&type=package&page=4&sort=rating`;
    expect(remove(query, "category")).toMatchObject({ categoryId: null, subcategoryId: null, types: ["package"], page: 1, sort: "rating" });
    expect(remove(query, "subcategory")).toMatchObject({ categoryId: parent.id, subcategoryId: null, page: 1 });
  });

  it("clears incompatible category dependencies when removing one selected service type", () => {
    const next = remove(selected, "type:package");
    expect(next).toMatchObject({ types: ["lab_test"], categoryId: null, subcategoryId: null, page: 1 });
    expect(next.providerIds).toEqual([46, 48]);
    expect(next.maxPrice).toBe("5000");
    expect(remove(selected, "type:lab_test")).toMatchObject({ types: ["package"], categoryId: parent.id, subcategoryId: parent.children[0].id });
    expect(remove(`type=package&category=${parent.id}`, "type:package")).toMatchObject({ types: [], categoryId: parent.id });
  });

  it("removes providers independently and lets the last removal restore all providers", () => {
    expect(remove(selected, "provider:48")).toMatchObject({ providerIds: [46], page: 1, query: "heart", maxPrice: "5000" });
    expect(remove("provider=48&type=lab_test", "provider:48")).toMatchObject({ providerIds: [], types: ["lab_test"] });
  });

  it("clears price bounds when currency is removed, preserving other filters", () => {
    expect(remove(selected, "currency")).toMatchObject({ currency: null, minPrice: null, maxPrice: null,
      query: "heart", types: ["package", "lab_test"], homeTest: true, sort: "rating", page: 1 });
  });

  it("removes each bound independently while retaining the selected currency", () => {
    expect(remove(selected, "minPrice")).toMatchObject({ currency: "THB", minPrice: null, maxPrice: "5000", page: 1 });
    expect(remove(selected, "maxPrice")).toMatchObject({ currency: "THB", minPrice: "0", maxPrice: null, page: 1 });
  });

  it("removes query, location, and availability without disturbing other filters", () => {
    expect(remove(selected, "query")).toEqual({ ...parse(selected), query: "", page: 1 });
    expect(remove(selected, "location")).toEqual({ ...parse(selected), location: null, page: 1 });
    expect(remove(selected, "homeTest")).toEqual({ ...parse(selected), homeTest: false, page: 1 });
  });

  it("recovers real results when a restrictive price chip is removed", () => {
    const entries = prepareServices(catalog.services);
    const query = "provider=48&type=package&currency=THB&max=0";
    expect(filterServices(entries, parse(query))).toHaveLength(0);
    expect(filterServices(entries, remove(query, "maxPrice"))).toHaveLength(17);
    expect(filterServices(entries, remove(query, "currency"))).toHaveLength(17);
  });

  it("clears all filters atomically while preserving sorting and unrelated URL data", () => {
    const href = buildExplorerHref(`https://example.test/?${selected}&note=keep#results`, clearFiltersPatch());
    const url = new URL(href, "https://example.test");
    expect(parseExplorerState(url.searchParams)).toEqual({ ...parse(), sort: "rating" });
    expect(url.searchParams.get("note")).toBe("keep");
    expect(url.hash).toBe("#results");
    expect(getAppliedFilters(parseExplorerState(url.searchParams), labels)).toEqual([]);
  });

  it("does not mutate the state or label collections while building removal actions", () => {
    const state = parse(selected);
    const before = structuredClone({ state, labels });
    getAppliedFilters(state, labels);
    expect({ state, labels }).toEqual(before);
  });
});

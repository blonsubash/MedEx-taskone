import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState } from "@/lib/explorer-state";
import { createFilterDraft, updateFilterDraft } from "@/lib/filter-draft";
import { getFacetCounts } from "./facets";
import { normalizeCatalog } from "./normalize";
import { filterServices, prepareServices } from "./results";
import type { Category, Service } from "./types";

const catalog = normalizeCatalog(fixture);
const base = catalog.services[0];
function category(id: string, type: Category["type"], children: string[]): Category {
  return { id, title: "Screening", slug: "screening", type, position: 1,
    children: children.map((child) => ({ id: child, title: child, slug: child, type, position: 1, parentId: id })) };
}
const packageCategory = category("package", "package", ["package-1", "package-2"]);
const labCategory = category("lab", "lab_test", ["lab-1", "lab-2"]);
const wellnessCategory = category("wellness", "wellness", []);
const categories = [packageCategory, labCategory, wellnessCategory];
const providers = [
  { ...base.provider, id: 1, name: "Bangkok Clinic", currency: "THB", city: { id: "bangkok", name: "Bangkok", slug: "bangkok" }, country: { id: 1, name: "Thailand", alphaCode: "TH" } },
  { ...base.provider, id: 2, name: "Chiang Clinic", currency: "THB", city: { id: "chiang", name: "Chiang Mai", slug: "chiang" }, country: { id: 1, name: "Thailand", alphaCode: "TH" } },
  { ...base.provider, id: 3, name: "Kathmandu Clinic", currency: "NPR", city: { id: "kathmandu", name: "Kathmandu", slug: "kathmandu" }, country: { id: 2, name: "Nepal", alphaCode: "NP" } },
  { ...base.provider, id: 4, name: "Delhi Clinic", currency: "INR", city: { id: "delhi", name: "Delhi", slug: "delhi" }, country: { id: 3, name: "India", alphaCode: "IN" } },
];
function service(id: string, provider: number, category: Category | null, child: number | null, price: string | null, home: boolean): Service {
  const item = { ...base, id, title: id, type: category?.type ?? "lab_test", category,
    subcategory: child === null ? null : category!.children[child], provider: providers[provider - 1],
    price, discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount", testAtHome: home };
  return { ...item, searchText: [id, item.provider.name, category?.title].join(" ").toLowerCase() };
}
const services = [
  service("Heart package", 1, packageCategory, 0, "100", true),
  service("General package", 1, packageCategory, 1, "200", false),
  service("Heart lab", 1, labCategory, 0, "50", true),
  service("General lab", 2, labCategory, 1, "150", false),
  { ...service("Wellness", 2, wellnessCategory, null, null, false), wellnessPricing: [
    { id: "short", durationInMinutes: 30, price: "80", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
    { id: "long", durationInMinutes: 60, price: "300", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
  ] },
  service("Nepal lab", 3, labCategory, 0, "100", true),
  service("Nepal unpriced", 3, packageCategory, 0, null, false),
  service("India lab", 4, labCategory, 1, "75", false),
  service("Uncategorized free", 1, null, null, "0", false),
  { ...service("Discounted package", 2, packageCategory, 0, "100", true), discount: "10", discountType: "percent", serviceCharge: "7", serviceChargeType: "percent" },
];
const entries = prepareServices(services);
const parse = (query = "") => parseExplorerState(new URLSearchParams(query));
const facets = (query = "") => getFacetCounts(entries, parse(query));

describe("disjunctive facet counts", () => {
  it("counts services by identity on a hand-checked mixed catalog", () => {
    const counts = facets();
    expect(counts.total).toBe(10);
    expect(Object.fromEntries(counts.types)).toEqual({ package: 4, lab_test: 5, wellness: 1 });
    expect(Object.fromEntries(counts.providers)).toEqual({ 1: 4, 2: 3, 3: 2, 4: 1 });
    expect(Object.fromEntries(counts.currencies)).toEqual({ THB: 7, NPR: 2, INR: 1 });
    expect(counts.homeTest).toBe(4);
    // Duplicate category titles stay separate, and unassigned records belong only to All categories.
    expect(Object.fromEntries(counts.categories)).toEqual({ package: 4, lab: 4, wellness: 1 });
    expect(counts.categoryTotal).toBe(10);
  });

  it("ignores the whole type multi-select while keeping other dimensions", () => {
    const counts = facets("type=package&type=lab_test&country=1&home=true");
    expect(counts.total).toBe(3);
    expect(Object.fromEntries(counts.types)).toEqual({ package: 2, lab_test: 1 });
    expect(facets("type=package&country=1&home=true").types).toEqual(counts.types);
    expect(counts.locationTotal).toBe(4);
    expect(Object.fromEntries(counts.countries)).toEqual({ 1: 3, 2: 1 });
  });

  it("counts each provider independently of all selected provider IDs", () => {
    const counts = facets("type=lab_test&home=true&provider=1&provider=2");
    expect(counts.total).toBe(1);
    expect(Object.fromEntries(counts.providers)).toEqual({ 1: 1, 3: 1 });
    expect(counts.providers.get(2) ?? 0).toBe(0);
    expect(facets("type=lab_test&home=true&provider=999").providers).toEqual(counts.providers);
  });

  it("retains provider constraints while counting other facets", () => {
    const counts = facets("provider=1&home=true&country=1");
    expect(counts.total).toBe(2);
    expect(Object.fromEntries(counts.types)).toEqual({ package: 1, lab_test: 1 });
    expect(counts.homeTest).toBe(2);
    expect(Object.fromEntries(counts.categories)).toEqual({ package: 1, lab: 1 });
  });

  it("omits both category levels for parent counts but retains type and location", () => {
    const counts = facets("type=lab_test&category=lab&subcategory=lab-1&country=1");
    expect(counts.total).toBe(1);
    expect(counts.categoryTotal).toBe(3);
    expect(Object.fromEntries(counts.categories)).toEqual({ lab: 2 });
    expect(facets("type=lab_test&country=1").categories).toEqual(counts.categories);
  });

  it("retains the parent while omitting the selected subcategory", () => {
    const counts = facets("category=package&subcategory=package-1");
    expect(counts.total).toBe(3);
    expect(counts.subcategoryTotal).toBe(4);
    expect(Object.fromEntries(counts.subcategories)).toEqual({ "package-1": 3, "package-2": 1 });
    expect(counts.subcategories.has("lab-1")).toBe(false);
  });

  it("includes parent-only services in All subcategories without inventing a child", () => {
    const extra = prepareServices([service("Parent only", 1, packageCategory, null, "100", false)]);
    const counts = getFacetCounts([...entries, ...extra], parse("category=package"));
    expect(counts.subcategoryTotal).toBe(5);
    expect(Object.fromEntries(counts.subcategories)).toEqual({ "package-1": 3, "package-2": 1 });
  });

  it("keeps category dependencies when counting the type dimension", () => {
    const counts = facets("type=package&category=package&subcategory=package-1");
    expect(Object.fromEntries(counts.types)).toEqual({ package: 3 });
    expect(counts.types.get("lab_test") ?? 0).toBe(0);
  });

  it("omits city/country together as one location dimension", () => {
    const city = facets("city=bangkok");
    const country = facets("country=2");
    expect(city.total).toBe(4);
    expect(country.total).toBe(2);
    expect(city.cities).toEqual(country.cities);
    expect(city.countries).toEqual(country.countries);
    expect(Object.fromEntries(city.cities)).toEqual({ bangkok: 4, chiang: 3, kathmandu: 2, delhi: 1 });
    expect(Object.fromEntries(city.countries)).toEqual({ 1: 7, 2: 2, 3: 1 });
  });

  it("omits availability for its own count, retaining the other constraints", () => {
    const off = facets("type=lab_test&country=1");
    const on = facets("type=lab_test&country=1&home=true");
    expect(off.total).toBe(3);
    expect(on.total).toBe(1);
    expect(off.homeTest).toBe(1);
    expect(on.homeTest).toBe(1);
  });

  it("uses exact final-price bounds and currency for every other facet", () => {
    const counts = facets("currency=THB&min=96.3&max=100");
    expect(counts.total).toBe(2);
    expect(Object.fromEntries(counts.providers)).toEqual({ 1: 1, 2: 1 });
    expect(Object.fromEntries(counts.types)).toEqual({ package: 2 });
    expect(Object.fromEntries(counts.countries)).toEqual({ 1: 2 });
    expect(counts.homeTest).toBe(2);
    expect(facets("type=package&currency=THB&max=96.299999").providers.get(2)).toBeUndefined();
  });

  it("omits currency and dependent price bounds for currency choices", () => {
    const counts = facets("currency=THB&min=96.3&max=100");
    expect(Object.fromEntries(counts.currencies)).toEqual({ THB: 7, NPR: 2, INR: 1 });
    expect(counts.currencyTotal).toBe(10);
    const restricted = facets("provider=1&currency=THB&max=0");
    expect(Object.fromEntries(restricted.currencies)).toEqual({ THB: 4 });
    expect(restricted.total).toBe(1);
  });

  it("counts a wellness service once when any duration qualifies", () => {
    expect(facets("currency=THB&min=250&max=350").total).toBe(1);
    const counts = facets("type=wellness&currency=THB&min=50&max=350");
    expect(counts.total).toBe(1);
    expect(counts.providers.get(2)).toBe(1);
    expect(counts.categories.get("wellness")).toBe(1);
    expect(counts.subcategoryTotal).toBe(1);
  });

  it("keeps unpriced browsing records but excludes them from numeric ranges", () => {
    expect(facets("currency=NPR").total).toBe(2);
    expect(facets("currency=NPR&min=0").total).toBe(1);
    const free = facets("currency=THB&max=0");
    expect(free.total).toBe(1);
    expect(free.categoryTotal).toBe(1);
    expect(free.categories.size).toBe(0);
  });

  it("retains search across all facets and reports zero when other constraints cannot match", () => {
    const counts = facets("q=heart&type=package");
    expect(counts.total).toBe(1);
    expect(Object.fromEntries(counts.types)).toEqual({ package: 1, lab_test: 1 });
    const empty = facets("q=does-not-exist&provider=999");
    expect(empty.total).toBe(0);
    expect(empty.providers.size).toBe(0);
    expect(empty.currencies.size).toBe(0);
    expect(empty.homeTest).toBe(0);
  });

  it("ignores sorting and pagination and leaves inputs unchanged", () => {
    const selected = parse("type=lab_test&home=true");
    const before = structuredClone({ entries, selected });
    const baseline = getFacetCounts(entries, selected);
    expect(getFacetCounts(entries, { ...selected, sort: "price-desc", page: 999 })).toEqual(baseline);
    expect({ entries, selected }).toEqual(before);
  });

  it("uses only normalized visible services, before provider pagination", () => {
    const all = getFacetCounts(prepareServices(catalog.services), parse("page=11&sort=rating"));
    expect(all.total).toBe(2853);
    expect([...all.types.values()].reduce((sum, count) => sum + count, 0)).toBe(2853);
    expect([...all.providers.values()].reduce((sum, count) => sum + count, 0)).toBe(2853);
    expect(all.providers.size).toBe(64);
    for (const provider of fixture.providers.filter((provider) => provider.status !== "active")) {
      expect(all.providers.has(provider.id)).toBe(false);
    }
  });

  it("updates draft facets and the matching total without mutating applied filters", () => {
    const applied = parse("provider=1&page=4");
    const draft = updateFilterDraft(createFilterDraft(applied), { types: ["lab_test"], homeTest: true }, categories);
    const counts = getFacetCounts(entries, draft);
    expect(counts.total).toBe(1);
    expect(counts.total).toBe(filterServices(entries, draft).length);
    expect(Object.fromEntries(counts.providers)).toEqual({ 1: 1, 3: 1 });
    expect(applied).toMatchObject({ page: 4, types: [], homeTest: false });
    expect(getFacetCounts(entries, applied).total).toBe(4);
  });

  it("returns empty count maps for an empty catalog", () => {
    const counts = getFacetCounts([], parse());
    expect(counts.total).toBe(0);
    expect(counts.types.size).toBe(0);
    expect(counts.categories.size).toBe(0);
    expect(counts.locationTotal).toBe(0);
    expect(counts.currencyTotal).toBe(0);
  });
});

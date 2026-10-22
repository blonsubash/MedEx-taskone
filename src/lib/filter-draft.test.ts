import { describe, expect, it } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { normalizeCatalog } from "./catalog/normalize";
import { filterServices, prepareServices } from "./catalog/results";
import { parseExplorerState, updateExplorerQuery } from "./explorer-state";
import { createFilterDraft, updateFilterDraft } from "./filter-draft";

const catalog = normalizeCatalog(fixture);
const categories = [...catalog.categoriesById.values()];
const entries = prepareServices(catalog.services);
const parse = (query: string) => parseExplorerState(new URLSearchParams(query));

describe("mobile filter drafts", () => {
  it("copies the applied state, including independent multi-select arrays", () => {
    const applied = parse("q=heart&type=lab_test&provider=46&provider=48&country=219&page=4");
    const draft = createFilterDraft(applied);
    expect(draft).toEqual(applied);
    expect(draft).not.toBe(applied);
    expect(draft.types).not.toBe(applied.types);
    expect(draft.providerIds).not.toBe(applied.providerIds);
  });

  it("previews draft results while leaving the applied selection unchanged", () => {
    const applied = parse("provider=48&page=4");
    const draft = updateFilterDraft(createFilterDraft(applied), { types: ["package"] }, categories);
    expect(filterServices(entries, draft)).toHaveLength(17);
    expect(filterServices(entries, applied)).toHaveLength(53);
    expect(applied).toMatchObject({ types: [], page: 4 });
    expect(draft.page).toBe(1);
  });

  it("uses the same AND and home-test matching rules in previews", () => {
    const applied = parse("provider=48");
    let draft = updateFilterDraft(createFilterDraft(applied), { types: ["lab_test", "package"] }, categories);
    draft = updateFilterDraft(draft, { location: { kind: "country", id: 219 }, homeTest: true }, categories);
    expect(filterServices(entries, draft)).toHaveLength(6);
    expect(applied.homeTest).toBe(false);
  });

  it("normalizes draft search immediately for previews without changing applied search", () => {
    const applied = parse("provider=46&provider=48");
    const draft = updateFilterDraft(createFilterDraft(applied), { query: " HBA1C   test (DIABETES) " }, categories);
    expect(draft.query).toBe("HBA1C test (DIABETES)");
    expect(filterServices(entries, draft)).toHaveLength(1);
    expect(applied.query).toBe("");
  });

  it("clears category dependencies when a draft changes parent or type", () => {
    const parent = categories.find((category) => category.type === "package" && category.children.length > 0)!;
    const applied = parse(`type=package&category=${parent.id}&subcategory=${parent.children[0].id}`);
    const draft = updateFilterDraft(createFilterDraft(applied), { types: ["lab_test"] }, categories);
    expect(draft).toMatchObject({ types: ["lab_test"], categoryId: null, subcategoryId: null });
    expect(applied.subcategoryId).toBe(parent.children[0].id);
    const cleared = updateFilterDraft(createFilterDraft(applied), { categoryId: null }, categories);
    expect(cleared.subcategoryId).toBeNull();
  });

  it("applies the complete draft in one URL update and preserves unrelated parameters", () => {
    const original = new URLSearchParams("provider=48&page=4&note=keep");
    const draft = updateFilterDraft(createFilterDraft(parseExplorerState(original)), {
      providerIds: [46, 48], query: "blood", types: ["lab_test"], homeTest: true,
    }, categories);
    const next = updateExplorerQuery(original, { ...draft, page: 1 });
    expect(parseExplorerState(next)).toMatchObject({
      providerIds: [46, 48], query: "blood", types: ["lab_test"], homeTest: true, page: 1,
    });
    expect(next.get("note")).toBe("keep");
    expect(original.toString()).toBe("provider=48&page=4&note=keep");
  });

  it("previews scoped price ranges and clears them when the draft currency changes", () => {
    const applied = parse("currency=THB&max=5000&page=3");
    let draft = updateFilterDraft(createFilterDraft(applied), { minPrice: "2000", maxPrice: "2100" }, categories);
    expect(draft).toMatchObject({ currency: "THB", minPrice: "2000", maxPrice: "2100", page: 1 });
    expect(filterServices(entries, draft).every(({ service }) => service.provider.currency === "THB")).toBe(true);
    draft = updateFilterDraft(draft, { currency: "NPR" }, categories);
    expect(draft).toMatchObject({ currency: "NPR", minPrice: null, maxPrice: null });
    expect(applied).toMatchObject({ currency: "THB", minPrice: null, maxPrice: "5000", page: 3 });
  });

  it("previews successive price edits without changing applied prices or results", () => {
    const applied = parse("provider=48&currency=THB&max=0&sort=rating");
    let draft = updateFilterDraft(createFilterDraft(applied), { maxPrice: "5000.00" }, categories);
    expect(draft.maxPrice).toBe("5000");
    expect(filterServices(entries, draft)).toHaveLength(36);
    draft = updateFilterDraft(draft, { maxPrice: "5000.005" }, categories);
    expect(draft.maxPrice).toBe("5000.005");
    expect(applied.maxPrice).toBe("0");
    expect(filterServices(entries, applied)).toHaveLength(2);
  });

  it("recovers from incomplete or invalid draft amounts using the shared parser", () => {
    const applied = parse("provider=48&currency=THB&max=0");
    let draft = updateFilterDraft(createFilterDraft(applied), { maxPrice: "5000." }, categories);
    expect(draft).toMatchObject({ currency: "THB", maxPrice: null });
    expect(filterServices(entries, draft)).toHaveLength(53);
    draft = updateFilterDraft(draft, { maxPrice: "5000.00" }, categories);
    expect(draft.maxPrice).toBe("5000");
    expect(filterServices(entries, draft)).toHaveLength(36);
    expect(applied.maxPrice).toBe("0");
  });

  it("applies the price preview with all other draft changes in one URL update", () => {
    const original = new URLSearchParams("provider=48&currency=THB&max=0&sort=rating&page=4&note=keep");
    let draft = updateFilterDraft(createFilterDraft(parseExplorerState(original)), { maxPrice: "5000.00" }, categories);
    draft = updateFilterDraft(draft, { types: ["lab_test"] }, categories);
    const next = updateExplorerQuery(original, { ...draft, page: 1 });
    expect(parseExplorerState(next)).toMatchObject({ providerIds: [48], currency: "THB", maxPrice: "5000",
      types: ["lab_test"], sort: "rating", page: 1 });
    expect(filterServices(entries, parseExplorerState(next))).toHaveLength(10);
    expect(next.get("note")).toBe("keep");
    expect(parseExplorerState(original)).toMatchObject({ types: [], maxPrice: "0", page: 4 });
  });

  it("starts fresh from current applied selections when a discarded draft is reopened", () => {
    const applied = parse("provider=48&type=lab_test");
    const discarded = updateFilterDraft(createFilterDraft(applied), { homeTest: true }, categories);
    expect(discarded.homeTest).toBe(true);
    const reopened = createFilterDraft(parse("provider=46&type=package"));
    expect(reopened).toMatchObject({ providerIds: [46], types: ["package"], homeTest: false });
  });
});

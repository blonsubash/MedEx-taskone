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

  it("starts fresh from current applied selections when a discarded draft is reopened", () => {
    const applied = parse("provider=48&type=lab_test");
    const discarded = updateFilterDraft(createFilterDraft(applied), { homeTest: true }, categories);
    expect(discarded.homeTest).toBe(true);
    const reopened = createFilterDraft(parse("provider=46&type=package"));
    expect(reopened).toMatchObject({ providerIds: [46], types: ["package"], homeTest: false });
  });
});

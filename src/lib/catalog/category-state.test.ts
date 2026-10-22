import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState, updateExplorerQuery } from "@/lib/explorer-state";
import { resolveCategoryState } from "./category-state";
import { normalizeCatalog } from "./normalize";
import { getProviderGroups, prepareServices } from "./results";

const catalog = normalizeCatalog(fixture);
const categories = [...catalog.categoriesById.values()];
const packageUltrasound = categories.find((category) => category.slug === "ultrasound" && category.type === "package")!;
const labUltrasound = categories.find((category) => category.slug === "ultrasound" && category.type === "lab_test")!;
const parse = (query: string) => parseExplorerState(new URLSearchParams(query));
const selection = `category=${packageUltrasound.id}&subcategory=${packageUltrasound.children[0].id}`;

describe("category hierarchy state", () => {
  it.each([packageUltrasound, labUltrasound])("preserves a valid $type Ultrasound parent and child by ID", (category) => {
    const state = parse(`category=${category.id}&subcategory=${category.children[0].id}`);
    expect(resolveCategoryState(state, categories)).toBe(state);
    expect(resolveCategoryState(state, categories).categoryId).toBe(category.id);
  });

  it("keeps the two Ultrasound result sets distinct despite identical parent and child labels", () => {
    const entries = prepareServices(catalog.services);
    const matches = [packageUltrasound, labUltrasound].map((category) => {
      const state = resolveCategoryState(parse(`category=${category.id}&subcategory=${category.children[0].id}`), categories);
      return getProviderGroups(entries, state).flatMap((group) => group.services.map(({ service }) => service));
    });
    expect(matches[0].length).toBeGreaterThan(0);
    expect(matches[1].length).toBeGreaterThan(0);
    expect(matches[0].every((service) => service.type === "package" && service.category?.id === packageUltrasound.id)).toBe(true);
    expect(matches[1].every((service) => service.type === "lab_test" && service.category?.id === labUltrasound.id)).toBe(true);
    const packageIds = new Set(matches[0].map((service) => service.id));
    expect(matches[1].some((service) => packageIds.has(service.id))).toBe(false);
  });

  it("drops a child belonging to another parent even when its title is also Thyroid", () => {
    const state = parse(`category=${packageUltrasound.id}&subcategory=${labUltrasound.children[0].id}`);
    expect(resolveCategoryState(state, categories))
      .toMatchObject({ categoryId: packageUltrasound.id, subcategoryId: null });
  });

  it("drops an unknown child while retaining its valid parent", () => {
    expect(resolveCategoryState(parse(`category=${packageUltrasound.id}&subcategory=missing`), categories))
      .toMatchObject({ categoryId: packageUltrasound.id, subcategoryId: null });
  });

  it("drops an inactive child after catalog normalization", () => {
    const raw = structuredClone(fixture);
    const parent = raw.categories.find((category) => category.id === packageUltrasound.id)!;
    parent.children[0].status = false;
    const active = [...normalizeCatalog(raw).categoriesById.values()];
    expect(resolveCategoryState(parse(selection), active))
      .toMatchObject({ categoryId: packageUltrasound.id, subcategoryId: null });
  });

  it.each(["missing", fixture.categories.find((category) => !category.status)!.id])(
    "drops an unavailable parent %s and its child", (id) => {
      expect(resolveCategoryState(parse(`category=${id}&subcategory=${packageUltrasound.children[0].id}`), categories))
        .toMatchObject({ categoryId: null, subcategoryId: null });
    },
  );

  it("honors explicit service types and clears an incompatible parent and child", () => {
    const state = parse(`${selection}&type=lab_test&country=219&home=true&q=heart&currency=THB&max=5000&provider=48`);
    const resolved = resolveCategoryState(state, categories);
    expect(resolved).toEqual({ ...state, categoryId: null, subcategoryId: null });
  });

  it.each(["", "&type=package", "&type=package&type=lab_test"])(
    "retains a compatible parent with type selection %s", (types) => {
      const state = parse(`${selection}${types}`);
      expect(resolveCategoryState(state, categories)).toBe(state);
    },
  );

  it("clears category dependencies atomically when a type is deselected", () => {
    const current = new URLSearchParams(`${selection}&type=package&type=lab_test&page=4&country=219`);
    const nextState = resolveCategoryState({ ...parseExplorerState(current), types: ["lab_test"] }, categories);
    const next = updateExplorerQuery(current, {
      types: nextState.types, categoryId: nextState.categoryId, subcategoryId: nextState.subcategoryId,
    });
    expect(parseExplorerState(next)).toMatchObject({
      types: ["lab_test"], categoryId: null, subcategoryId: null, page: 1, location: { kind: "country", id: 219 },
    });
    expect(next.has("category")).toBe(false);
    expect(next.has("subcategory")).toBe(false);
    expect(resolveCategoryState(parseExplorerState(current), categories).subcategoryId).toBe(packageUltrasound.children[0].id);
  });

  it("clears children when changing or removing the parent and resets the page", () => {
    const current = new URLSearchParams(`${selection}&page=4`);
    for (const categoryId of [labUltrasound.id, null]) {
      const next = updateExplorerQuery(current, { categoryId });
      expect(parseExplorerState(next)).toMatchObject({ categoryId, subcategoryId: null, page: 1 });
      expect(next.has("subcategory")).toBe(false);
    }
  });

  it("cleans an orphan URL child without inventing a parent", () => {
    const params = new URLSearchParams(`subcategory=${packageUltrasound.children[0].id}&country=219`);
    const resolved = resolveCategoryState(parseExplorerState(params), categories);
    const clean = updateExplorerQuery(params, { categoryId: resolved.categoryId, subcategoryId: resolved.subcategoryId });
    expect(clean.has("subcategory")).toBe(false);
    expect(clean.has("category")).toBe(false);
    expect(clean.get("country")).toBe("219");
  });

  it("retains a parent with no children but removes an invalid child selection", () => {
    const category = categories.find((category) => category.children.length === 0)!;
    expect(resolveCategoryState(parse(`category=${category.id}&subcategory=missing`), categories))
      .toMatchObject({ categoryId: category.id, subcategoryId: null });
  });

  it("repairs links without losing unrelated parameters or mutating state and catalog", () => {
    const params = new URLSearchParams(`category=${packageUltrasound.id}&subcategory=wrong&page=4&utm_source=friend`);
    const state = parseExplorerState(params);
    const before = JSON.stringify({ state, categories });
    const resolved = resolveCategoryState(state, categories);
    const clean = updateExplorerQuery(params, { categoryId: resolved.categoryId, subcategoryId: resolved.subcategoryId });
    expect(clean.get("utm_source")).toBe("friend");
    expect(clean.get("category")).toBe(packageUltrasound.id);
    expect(clean.has("subcategory")).toBe(false);
    expect(clean.has("page")).toBe(false);
    expect(JSON.stringify({ state, categories })).toBe(before);
    expect(params.get("subcategory")).toBe("wrong");
  });
});

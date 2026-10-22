import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { normalizeCatalog } from "./normalize";
import type { RawCatalog } from "./types";

function makeCatalog(): RawCatalog {
  return structuredClone({
    providers: [{ ...fixture.providers[0], id: 1, name: "Example Hospital" }],
    categories: [{
      ...fixture.categories[0],
      id: "package-category",
      title: "Ultrasound",
      slug: "ultrasound",
      position: 2,
      children: [{
        ...fixture.categories[0].children[0],
        id: "subcategory",
        title: "Thyroid",
        parentId: "package-category",
      }],
    }],
    services: [{
      ...fixture.services[0],
      id: "service",
      userId: 1,
      categoryId: "package-category",
      subCategoryId: "subcategory",
    }],
  });
}

describe("normalizeCatalog", () => {
  it("joins through userId and flattens provider metadata for the UI", () => {
    const raw = makeCatalog();
    const second = structuredClone(raw.providers[0]);
    second.id = 2;
    second.name = "Other Hospital";
    second.providerInformation.currency = "NPR";
    raw.providers.push(second);
    raw.services[0].userId = 2;

    const catalog = normalizeCatalog(raw);
    expect(catalog.services[0]).toMatchObject({
      id: "service",
      provider: { id: 2, name: "Other Hospital", currency: "NPR" },
      category: { id: "package-category", title: "Ultrasound" },
      subcategory: { id: "subcategory", parentId: "package-category" },
    });
    expect(catalog.providersById.get(2)?.currency).toBe("NPR");
  });

  it.each([
    { name: "inactive service", change: (raw: RawCatalog) => { raw.services[0].status = false; } },
    { name: "inactive provider", change: (raw: RawCatalog) => { raw.providers[0].status = "inactive"; } },
    { name: "unknown provider status", change: (raw: RawCatalog) => { raw.providers[0].status = "suspended"; } },
    { name: "inactive category", change: (raw: RawCatalog) => { raw.categories[0].status = false; } },
    { name: "missing provider", change: (raw: RawCatalog) => { raw.services[0].userId = 999; } },
    { name: "missing category", change: (raw: RawCatalog) => { raw.services[0].categoryId = "missing"; } },
    { name: "mismatched category type", change: (raw: RawCatalog) => { raw.services[0].type = "lab_test"; } },
    { name: "unsupported service type", change: (raw: RawCatalog) => { raw.services[0].type = "unknown"; } },
    { name: "invalid top-level parent", change: (raw: RawCatalog) => { raw.categories[0].parentId = "another-parent"; } },
    { name: "unsupported category type", change: (raw: RawCatalog) => { raw.categories[0].type = "unknown"; } },
  ])("excludes a service with an $name", ({ change }) => {
    const raw = makeCatalog();
    change(raw);
    expect(normalizeCatalog(raw).services).toEqual([]);
  });

  it.each(["service", "category"])(
    "requires literal boolean true for %s visibility",
    (entity) => {
      const raw = makeCatalog();
      const record = entity === "service" ? raw.services[0] : raw.categories[0];
      Object.assign(record, { status: "true" });
      expect(normalizeCatalog(raw).services).toEqual([]);
    },
  );

  it("only indexes active providers and valid active categories", () => {
    const raw = makeCatalog();
    raw.providers[0].status = "inactive";
    raw.categories[0].status = false;
    const catalog = normalizeCatalog(raw);
    expect(catalog.providersById.size).toBe(0);
    expect(catalog.categoriesById.size).toBe(0);
    expect(catalog.subcategoriesById.size).toBe(0);
  });

  it.each([null, "subcategory"])(
    "keeps an uncategorized service and clears its child reference %j",
    (childId) => {
      const raw = makeCatalog();
      raw.services[0].categoryId = null;
      raw.services[0].subCategoryId = childId;
      const { services } = normalizeCatalog(raw);
      expect(services).toHaveLength(1);
      expect(services[0].category).toBeNull();
      expect(services[0].subcategory).toBeNull();
    },
  );

  it("keeps duplicate slugs distinct by category ID and service type", () => {
    const raw = makeCatalog();
    raw.categories.push({
      ...raw.categories[0], id: "lab-category", type: "lab_test", position: 1, children: [],
    });
    raw.services.push({
      ...raw.services[0], id: "lab-service", type: "lab_test",
      categoryId: "lab-category", subCategoryId: null,
    });
    const catalog = normalizeCatalog(raw);
    expect([...catalog.categoriesById.keys()]).toEqual(["lab-category", "package-category"]);
    expect([...catalog.categoriesById.values()].map((category) => category.slug))
      .toEqual(["ultrasound", "ultrasound"]);
    expect(catalog.services.map((service) => service.category?.id))
      .toEqual(["package-category", "lab-category"]);
  });

  it.each(["missing", "inactive", "wrong-type", "wrong-parent"])(
    "clears a %s subcategory without hiding an otherwise valid service",
    (problem) => {
      const raw = makeCatalog();
      if (problem === "missing") raw.services[0].subCategoryId = "missing";
      if (problem === "inactive") raw.categories[0].children[0].status = false;
      if (problem === "wrong-type") raw.categories[0].children[0].type = "lab_test";
      if (problem === "wrong-parent") {
        raw.categories.push({
          ...raw.categories[0], id: "other-category",
          children: [{ ...raw.categories[0].children[0], id: "other-child", parentId: "other-category" }],
        });
        raw.services[0].subCategoryId = "other-child";
      }
      const catalog = normalizeCatalog(raw);
      expect(catalog.services).toHaveLength(1);
      expect(catalog.services[0].subcategory).toBeNull();
      expect(catalog.services[0].category?.id).toBe("package-category");
      if (problem === "wrong-parent") {
        expect(catalog.subcategoriesById.has("other-child")).toBe(true);
      }
    },
  );

  it("rejects children whose parentId does not match their containing category", () => {
    const raw = makeCatalog();
    raw.categories[0].children[0].parentId = "wrong-parent";
    const catalog = normalizeCatalog(raw);
    expect(catalog.subcategoriesById.size).toBe(0);
    expect(catalog.categoriesById.get("package-category")?.children).toEqual([]);
    expect(catalog.services[0].subcategory).toBeNull();
  });

  it("normalizes whitespace, preserves display case, and prepares case-insensitive search", () => {
    const raw = makeCatalog();
    raw.services[0].title = "  hba1c   TEST (Diabetes) ";
    raw.providers[0].name = " Example\t Hospital ";
    raw.categories[0].title = " Full  Body ";
    raw.categories[0].children[0].title = " General\nCheckup ";
    const before = structuredClone(raw);

    const { services } = normalizeCatalog(raw);
    expect(services[0].title).toBe("hba1c TEST (Diabetes)");
    expect(services[0].searchText).toBe(
      "hba1c test (diabetes) example hospital full body general checkup",
    );
    expect(raw).toEqual(before);
  });

  it("falls back to the company name for a blank provider name", () => {
    const raw = makeCatalog();
    raw.providers[0].name = "  ";
    raw.providers[0].providerInformation.companyName = " Company  Hospital ";
    expect(normalizeCatalog(raw).services[0].provider.name).toBe("Company Hospital");
  });

  it.each([
    { rating: null, expected: null },
    { rating: 0, expected: 0 },
    { rating: 4.7, expected: 4.7 },
    { rating: -1, expected: null },
    { rating: 6, expected: null },
    { rating: NaN, expected: null },
  ])("maps rating $rating to $expected", ({ rating, expected }) => {
    const raw = makeCatalog();
    raw.providers[0].providerInformation.rating = rating;
    raw.providers[0].providerInformation.reviewCount = -1;
    const provider = normalizeCatalog(raw).services[0].provider;
    expect(provider.rating).toBe(expected);
    expect(provider.reviewCount).toBe(0);
  });

  it("preserves decimal strings, free prices, nulls, and wellness options without calculating", () => {
    const raw = makeCatalog();
    raw.services[0].price = "0.00";
    raw.services[0].homeTestCharge = null;
    raw.services[0].wellnessPricing = structuredClone(fixture.services[2].wellnessPricing);
    const before = structuredClone(raw);
    const service = normalizeCatalog(raw).services[0];
    expect(service.price).toBe("0.00");
    expect(service.discount).toBe("10.00");
    expect(service.homeTestCharge).toBeNull();
    expect(service.wellnessPricing).toEqual(before.services[0].wellnessPricing);
    service.wellnessPricing[0].price = "999.00";
    expect(raw).toEqual(before);
  });

  it("accepts empty endpoint collections", () => {
    const catalog = normalizeCatalog({ categories: [], providers: [], services: [] });
    expect(catalog.services).toEqual([]);
    expect(catalog.providersById.size).toBe(0);
    expect(catalog.categoriesById.size).toBe(0);
    expect(catalog.subcategoriesById.size).toBe(0);
  });

  it("normalizes the complete fixture to the audited 2,853 visible services", () => {
    const before = structuredClone(fixture);
    const catalog = normalizeCatalog(fixture);
    expect(catalog.services).toHaveLength(2853);
    expect(catalog.providersById.size).toBe(65);
    expect(catalog.categoriesById.size).toBe(12);
    expect(catalog.services.find((service) => service.id.endsWith("000000000007"))?.title)
      .toBe("hba1c TEST (Diabetes)");
    expect(catalog.services.filter((service) => service.category === null).length)
      .toBeGreaterThan(0);
    const wellness = catalog.services.find((service) => service.type === "wellness");
    expect(wellness?.price).toBeNull();
    expect(wellness?.wellnessPricing.length).toBeGreaterThan(0);
    expect(fixture).toEqual(before);
  });
});

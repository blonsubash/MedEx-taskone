import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState } from "@/lib/explorer-state";
import { normalizeCatalog } from "./normalize";
import { getProviderGroups, prepareServices } from "./results";
import type { Service } from "./types";

const catalog = normalizeCatalog(fixture);
const entries = prepareServices(catalog.services);
const stateFor = (query = "") => parseExplorerState(new URLSearchParams(query));
const groupsFor = (query = "") => getProviderGroups(entries, stateFor(query));
const idsFor = (query: string) => groupsFor(query).flatMap((group) => group.services.map(({ service }) => service.id));

function example(overrides: Partial<Service> = {}): Service {
  return { ...catalog.services[0], ...overrides };
}

describe("provider results", () => {
  it("groups every visible service exactly once and preserves source order", () => {
    const groups = groupsFor();
    expect(groups).toHaveLength(64);
    expect(groups.reduce((total, group) => total + group.services.length, 0)).toBe(2853);
    expect(new Set(groups.flatMap((group) => group.services.map(({ service }) => service.id))).size).toBe(2853);
    expect(groups[0].provider.id).toBe(48);
    expect(groups[0].services.map(({ service }) => service.id))
      .toEqual(catalog.services.filter((service) => service.provider.id === 48).map((service) => service.id));
  });

  it("counts all matching services before a card limits its preview", () => {
    const groups = groupsFor("provider=48");
    expect(groups).toHaveLength(1);
    expect(groups[0].services).toHaveLength(53);
    const filtered = groupsFor("provider=48&q=executive+health+check+(male)");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].services).toHaveLength(1);
    expect(filtered[0].services[0].service.title).toBe("Executive Health Check (Male)");
  });

  it("uses OR within types/providers and AND across dimensions", () => {
    const groups = groupsFor("provider=48&provider=46&type=lab_test&type=package&home=true");
    const expected = catalog.services.filter((service) =>
      [48, 46].includes(service.provider.id) && ["lab_test", "package"].includes(service.type) && service.testAtHome);
    expect(groups.flatMap((group) => group.services).map(({ service }) => service.id).sort())
      .toEqual(expected.map((service) => service.id).sort());
    expect(expected.length).toBeGreaterThan(0);
  });

  it.each(["title", "provider", "category", "subcategory"])("searches normalized %s text", (field) => {
    const source = catalog.services.find((service) => service.subcategory !== null)!;
    const query = field === "title" ? source.title : field === "provider" ? source.provider.name
      : field === "category" ? source.category!.title : source.subcategory!.title;
    expect(idsFor(`q=${encodeURIComponent(`  ${query.toUpperCase()}  `)}`)).toContain(source.id);
  });

  it("matches category and subcategory by IDs rather than ambiguous slugs", () => {
    const source = catalog.services.find((service) => service.subcategory !== null)!;
    const matches = idsFor(`category=${source.category!.id}&subcategory=${source.subcategory!.id}`);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.sort()).toEqual(catalog.services.filter((service) =>
      service.category?.id === source.category!.id && service.subcategory?.id === source.subcategory!.id)
      .map((service) => service.id).sort());
    expect(groupsFor(`category=missing&subcategory=${source.subcategory!.id}`)).toEqual([]);
  });

  it.each(["city", "country"])("matches a provider's %s location", (kind) => {
    const provider = catalog.services[0].provider;
    const id = kind === "city" ? provider.city.id : provider.country.id;
    const groups = groupsFor(`${kind}=${id}`);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => kind === "city"
      ? group.provider.city.id === id : group.provider.country.id === id)).toBe(true);
  });

  it("returns no empty provider cards for unknown selections or zero matches", () => {
    expect(groupsFor("provider=999999")).toEqual([]);
    expect(groupsFor("q=does-not-exist-anywhere")).toEqual([]);
  });

  it("scopes price bounds to the selected currency and includes exact boundaries", () => {
    const service = example({ price: "100", discount: "10", discountType: "percent",
      serviceCharge: "7", serviceChargeType: "percent" });
    const prepared = prepareServices([service, { ...service, id: "other-currency",
      provider: { ...service.provider, id: 999, currency: "NPR" } }]);
    const groups = getProviderGroups(prepared, stateFor("currency=THB&min=96.3&max=96.3"));
    expect(groups).toHaveLength(1);
    expect(groups[0].services.map(({ service }) => service.id)).toEqual([service.id]);
    expect(getProviderGroups(prepared, stateFor("currency=THB&max=96.299999"))).toEqual([]);
  });

  it("keeps unknown prices for browsing but excludes them from a range; free remains zero", () => {
    const prepared = prepareServices([
      example({ id: "unknown", price: null }),
      example({ id: "free", price: "0", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" }),
    ]);
    expect(getProviderGroups(prepared, stateFor())[0].services).toHaveLength(2);
    expect(getProviderGroups(prepared, stateFor("currency=THB&max=0"))[0].services.map(({ service }) => service.id))
      .toEqual(["free"]);
  });

  it("shows the cheapest qualifying wellness duration without mutating cached pricing", () => {
    const service = catalog.services.find((service) => service.title === "Signature Facial")!;
    const prepared = prepareServices([service]);
    const groups = getProviderGroups(prepared, stateFor("currency=THB&min=2000&max=2100"));
    const pricing = groups[0].services[0].pricing;
    expect(pricing).toMatchObject({ kind: "wellness", startingOption: {
      durationInMinutes: 90, price: { finalPrice: "2040" },
    } });
    expect(prepared[0].pricing).toMatchObject({ kind: "wellness", startingOption: {
      durationInMinutes: 60, price: { finalPrice: "1800" },
    } });
    expect(getProviderGroups(prepared, stateFor("currency=THB&min=2101"))).toEqual([]);
  });

  it("retains an unpriced wellness service until a price range is applied", () => {
    const prepared = prepareServices([example({ type: "wellness", wellnessPricing: [] })]);
    expect(getProviderGroups(prepared, stateFor())[0].services).toHaveLength(1);
    expect(getProviderGroups(prepared, stateFor("currency=THB&min=0"))).toEqual([]);
  });
});

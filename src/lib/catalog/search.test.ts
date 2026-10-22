import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState, updateExplorerQuery } from "@/lib/explorer-state";
import { normalizeCatalog } from "./normalize";
import { filterServices, getProviderGroups, prepareServices } from "./results";
import { filterProviderOptions, getProviderOptions } from "./filter-options";

const catalog = normalizeCatalog(fixture);
const entries = prepareServices(catalog.services);
const options = getProviderOptions(catalog.providersById.values());
const parse = (query: string) => parseExplorerState(new URLSearchParams(query));

describe("catalog search and provider selection", () => {
  it("finds a messy service title regardless of query spacing or case", () => {
    const state = parse("q=++HBA1C++++test++(DIABETES)++&provider=46&provider=48");
    const matches = filterServices(entries, state);
    expect(matches).toHaveLength(1);
    expect(matches[0].service.title).toBe("hba1c TEST (Diabetes)");
    expect(matches[0].service.provider.id).toBe(46);
  });

  it("matches provider names in the catalog search", () => {
    const matches = filterServices(entries, parse("q=HIMAL+NEO+CLINIC&provider=46&provider=48"));
    expect(matches).toHaveLength(44);
    expect(matches.every(({ service }) => service.provider.id === 46)).toBe(true);
  });

  it.each(["Blood Tests", "General Check-Up"])("matches the category label %s", (query) => {
    const source = catalog.services.find((service) => service.category?.title === query || service.subcategory?.title === query)!;
    const matches = filterServices(entries, parse(`q=${encodeURIComponent(query.toUpperCase())}`));
    expect(matches.some(({ service }) => service.id === source.id)).toBe(true);
    expect(matches.every(({ service }) => service.searchText.includes(query.toLowerCase()))).toBe(true);
  });

  it("uses OR within providers, AND with search, and counts only matching services", () => {
    const groups = getProviderGroups(entries, parse("provider=48&provider=46"));
    expect(groups.map((group) => [group.provider.id, group.services.length])).toEqual([[48, 53], [46, 44]]);
    const searched = getProviderGroups(entries, parse("provider=48&provider=46&q=Executive+Health+Check+(Male)"));
    expect(searched).toHaveLength(1);
    expect(searched[0].provider.id).toBe(48);
    expect(searched[0].services).toHaveLength(1);
  });

  it("keeps other URL filters and resets the page when search or providers change", () => {
    const current = new URLSearchParams("q=old&type=lab_test&home=true&country=154&page=4&note=keep");
    const withProviders = updateExplorerQuery(current, { providerIds: [46, 48] });
    const searched = updateExplorerQuery(withProviders, { query: "  Basic   Blood Panel  " });
    expect(parseExplorerState(searched)).toMatchObject({
      query: "Basic Blood Panel", providerIds: [46, 48], types: ["lab_test"], homeTest: true,
      location: { kind: "country", id: 154 }, page: 1,
    });
    expect(searched.get("note")).toBe("keep");
  });

  it("removes providers individually or together without losing the catalog query", () => {
    const current = new URLSearchParams("q=heart&provider=46&provider=48&home=true");
    const remaining = updateExplorerQuery(current, { providerIds: [46] });
    expect(parseExplorerState(remaining)).toMatchObject({ query: "heart", providerIds: [46], homeTest: true });
    const cleared = updateExplorerQuery(remaining, { providerIds: [] });
    expect(cleared.has("provider")).toBe(false);
    expect(cleared.get("q")).toBe("heart");
  });

  it("creates sorted options from all active providers without mutating the input", () => {
    const providers = [...catalog.providersById.values()];
    const before = structuredClone(providers);
    const choices = getProviderOptions(providers);
    expect(choices).toHaveLength(65);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(65);
    expect(choices.find((choice) => choice.id === 46)).toMatchObject({ name: "Himal Neo Clinic", location: "Kathmandu, Nepal" });
    expect(choices.map((choice) => choice.name)).toEqual(choices.map((choice) => choice.name).sort((a, b) => a.localeCompare(b, "en")));
    expect(providers).toEqual(before);
  });

  it("normalizes provider-list search independently without filtering catalog results", () => {
    const state = parse("provider=46&provider=48");
    const before = JSON.stringify(state);
    expect(filterProviderOptions(options, "  RIVERSIDE   international  ").map((choice) => choice.id)).toEqual([48]);
    expect(filterServices(entries, state)).toHaveLength(97);
    expect(JSON.stringify(state)).toBe(before);
    expect(filterProviderOptions(options, "no matching provider")).toEqual([]);
    expect(filterProviderOptions(options, " ")).toEqual(options);
  });

  it("keeps duplicate provider names distinct by ID and uses ID as a stable tie-breaker", () => {
    const base = catalog.providersById.get(48)!;
    const choices = getProviderOptions([{ ...base, id: 2 }, { ...base, id: 1 }]);
    expect(choices.map((choice) => choice.id)).toEqual([1, 2]);
    expect(filterProviderOptions(choices, base.name)).toHaveLength(2);
  });
});

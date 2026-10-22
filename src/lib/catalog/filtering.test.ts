import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState, updateExplorerQuery } from "@/lib/explorer-state";
import { normalizeCatalog } from "./normalize";
import { filterServices, getProviderGroups, prepareServices } from "./results";
import type { Service, ServiceType } from "./types";

const base = normalizeCatalog(fixture).services[0];
function service(id: string, type: ServiceType, providerId: number, city: string, country: number, home: boolean): Service {
  return {
    ...base, id, type, testAtHome: home, homeTestCharge: null,
    provider: { ...base.provider, id: providerId,
      city: { id: city, name: city === "other-bangkok" ? "Bangkok" : city, slug: city },
      country: { id: country, name: country === 1 ? "Thailand" : "Nepal", alphaCode: country === 1 ? "TH" : "NP" } },
  };
}
const services = [
  service("bangkok-lab-home", "lab_test", 1, "Bangkok", 1, true),
  service("bangkok-package", "package", 1, "Bangkok", 1, false),
  service("chiang-wellness-home", "wellness", 2, "Chiang Mai", 1, true),
  service("kathmandu-lab-home", "lab_test", 3, "Kathmandu", 2, true),
  service("kathmandu-package-home", "package", 3, "Kathmandu", 2, true),
  service("same-city-name", "lab_test", 4, "other-bangkok", 2, true),
  service("bangkok-lab-clinic", "lab_test", 1, "Bangkok", 1, false),
];
const entries = prepareServices(services);
function ids(query: string) {
  return filterServices(entries, parseExplorerState(new URLSearchParams(query))).map(({ service }) => service.id);
}

describe("type, location and home-test filtering", () => {
  it("includes all types when none are selected", () => {
    expect(ids("")).toEqual(services.map((service) => service.id));
  });

  it("uses OR for selected service types", () => {
    expect(ids("type=package&type=lab_test")).toEqual([
      "bangkok-lab-home", "bangkok-package", "kathmandu-lab-home", "kathmandu-package-home",
      "same-city-name", "bangkok-lab-clinic",
    ]);
  });

  it("matches cities by ID even if another city has the same name", () => {
    expect(ids("city=Bangkok")).toEqual(["bangkok-lab-home", "bangkok-package", "bangkok-lab-clinic"]);
  });

  it("includes every city in a selected country", () => {
    expect(ids("country=1")).toEqual([
      "bangkok-lab-home", "bangkok-package", "chiang-wellness-home", "bangkok-lab-clinic",
    ]);
  });

  it("requires availability rather than a nonzero home collection charge", () => {
    expect(ids("home=true")).toEqual([
      "bangkok-lab-home", "chiang-wellness-home", "kathmandu-lab-home", "kathmandu-package-home", "same-city-name",
    ]);
  });

  it("uses AND across types, location and availability", () => {
    expect(ids("type=package&type=lab_test&city=Bangkok&home=true")).toEqual(["bangkok-lab-home"]);
    expect(ids("type=wellness&city=Bangkok&home=true")).toEqual([]);
  });

  it("keeps existing provider and currency constraints when adding Phase 7 filters", () => {
    expect(ids("provider=3&type=lab_test&country=2&home=true&currency=THB"))
      .toEqual(["kathmandu-lab-home"]);
    expect(ids("provider=3&type=lab_test&country=2&home=true&currency=NPR")).toEqual([]);
  });

  it("returns identical matches after URL edits and a reload parse", () => {
    const edited = updateExplorerQuery(new URLSearchParams("page=4&provider=1"), {
      types: ["lab_test", "package"], location: { kind: "city", id: "Bangkok" }, homeTest: true,
    });
    expect(parseExplorerState(edited).page).toBe(1);
    expect(ids(edited.toString())).toEqual(["bangkok-lab-home"]);
    expect(edited.get("provider")).toBe("1");
  });

  it("recovers the appropriate matches as each selection is removed", () => {
    let params = new URLSearchParams("type=lab_test&city=Bangkok&home=true");
    params = updateExplorerQuery(params, { homeTest: false });
    expect(ids(params.toString())).toEqual(["bangkok-lab-home", "bangkok-lab-clinic"]);
    params = updateExplorerQuery(params, { types: [] });
    expect(ids(params.toString())).toEqual(["bangkok-lab-home", "bangkok-package", "bangkok-lab-clinic"]);
    params = updateExplorerQuery(params, { location: null });
    expect(ids(params.toString())).toEqual(services.map((service) => service.id));
    expect(params.toString()).toBe("");
  });

  it("switches between country and city without leaving a hidden location constraint", () => {
    const city = updateExplorerQuery(new URLSearchParams("country=2"), { location: { kind: "city", id: "Bangkok" } });
    expect(city.has("country")).toBe(false);
    expect(ids(city.toString())).toEqual(["bangkok-lab-home", "bangkok-package", "bangkok-lab-clinic"]);
    const country = updateExplorerQuery(city, { location: { kind: "country", id: 2 } });
    expect(country.has("city")).toBe(false);
    expect(ids(country.toString())).toEqual(["kathmandu-lab-home", "kathmandu-package-home", "same-city-name"]);
  });

  it("keeps group totals consistent with filtered rows without changing the input", () => {
    const before = JSON.stringify(entries);
    const state = parseExplorerState(new URLSearchParams("type=lab_test&home=true"));
    const matches = filterServices(entries, state);
    const groups = getProviderGroups(entries, state);
    expect(matches).toHaveLength(3);
    expect(groups.map((group) => [group.provider.id, group.services.length])).toEqual([[1, 1], [3, 1], [4, 1]]);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

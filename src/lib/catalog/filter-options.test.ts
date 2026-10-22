import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { getLocationOptions } from "./filter-options";
import { normalizeCatalog } from "./normalize";
import type { Provider } from "./types";

const provider = normalizeCatalog(fixture).providersById.values().next().value!;
function makeProvider(id: number, cityId: string, cityName: string, countryId: number, countryName: string): Provider {
  return { ...provider, id, city: { id: cityId, name: cityName, slug: cityName },
    country: { id: countryId, name: countryName, alphaCode: "XX" } };
}

describe("location options", () => {
  it("deduplicates locations by ID and sorts countries and their cities by name", () => {
    const providers = [
      makeProvider(1, "pokhara", "Pokhara", 2, "Nepal"),
      makeProvider(2, "bangkok", "Bangkok", 1, "Thailand"),
      makeProvider(3, "kathmandu", "Kathmandu", 2, "Nepal"),
      makeProvider(4, "bangkok", "Bangkok", 1, "Thailand"),
    ];
    const before = structuredClone(providers);
    expect(getLocationOptions(providers)).toEqual([
      { id: 2, name: "Nepal", cities: [{ id: "kathmandu", name: "Kathmandu" }, { id: "pokhara", name: "Pokhara" }] },
      { id: 1, name: "Thailand", cities: [{ id: "bangkok", name: "Bangkok" }] },
    ]);
    expect(providers).toEqual(before);
  });

  it("keeps same-name cities with different IDs distinct", () => {
    const options = getLocationOptions([
      makeProvider(1, "one", "City", 1, "Country A"), makeProvider(2, "two", "City", 2, "Country B"),
    ]);
    expect(options.flatMap((country) => country.cities).map((city) => city.id)).toEqual(["one", "two"]);
  });

  it("accepts the full provider index and handles an empty catalog", () => {
    expect(getLocationOptions(new Map([[1, provider]]).values())).toHaveLength(1);
    expect(getLocationOptions([])).toEqual([]);
  });
});

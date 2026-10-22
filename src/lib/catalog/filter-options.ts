import type { City, Provider, ServiceType } from "./types";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  package: "Health package",
  lab_test: "Lab test",
  wellness: "Wellness",
  service: "Healthcare service",
  insurance: "Insurance",
};

export interface LocationCountry {
  id: number;
  name: string;
  cities: Pick<City, "id" | "name">[];
}

// Use the full active-provider catalog so selections do not disappear as results narrow.
export function getLocationOptions(providers: Iterable<Provider>): LocationCountry[] {
  const countries = new Map<number, LocationCountry>();
  const cityIds = new Set<string>();
  for (const provider of providers) {
    const { country, city } = provider;
    let option = countries.get(country.id);
    if (!option) {
      option = { id: country.id, name: country.name, cities: [] };
      countries.set(country.id, option);
    }
    if (!cityIds.has(city.id)) {
      option.cities.push({ id: city.id, name: city.name });
      cityIds.add(city.id);
    }
  }
  const sorted = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id);
  for (const country of sorted) {
    country.cities.sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"));
  }
  return sorted;
}

import { normalizeSearchQuery } from "@/lib/search";

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

export interface ProviderOption {
  id: number;
  name: string;
  location: string;
}

export function getProviderOptions(providers: Iterable<Provider>): ProviderOption[] {
  return [...providers].map((provider) => ({
    id: provider.id,
    name: provider.name,
    location: `${provider.city.name}, ${provider.country.name}`,
  })).sort((a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id);
}

export function filterProviderOptions(providers: ProviderOption[], query: string): ProviderOption[] {
  const needle = normalizeSearchQuery(query).toLowerCase();
  return providers.filter((provider) => normalizeSearchQuery(provider.name).toLowerCase().includes(needle));
}

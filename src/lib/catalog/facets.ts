import type { ExplorerState } from "@/lib/explorer-state";
import { filterServices } from "./results";
import type { PricedService } from "./results";
import type { ServiceType } from "./types";

export interface FacetCounts {
  total: number;
  types: Map<ServiceType, number>;
  countries: Map<number, number>;
  cities: Map<string, number>;
  locationTotal: number;
  homeTest: number;
  categories: Map<string, number>;
  categoryTotal: number;
  subcategories: Map<string, number>;
  subcategoryTotal: number;
  providers: Map<number, number>;
  currencies: Map<string, number>;
  currencyTotal: number;
}

function countBy<Key>(entries: PricedService[], keyFor: (entry: PricedService) => Key | undefined): Map<Key, number> {
  const counts = new Map<Key, number>();
  for (const entry of entries) {
    const key = keyFor(entry);
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function getFacetCounts(entries: PricedService[], state: ExplorerState): FacetCounts {
  // Reuse result matching once per dimension, rather than once per option.
  const types = filterServices(entries, { ...state, types: [] });
  const locations = filterServices(entries, { ...state, location: null });
  const availability = filterServices(entries, { ...state, homeTest: false });
  const categories = filterServices(entries, { ...state, categoryId: null, subcategoryId: null });
  const subcategories = filterServices(entries, { ...state, subcategoryId: null });
  const providers = filterServices(entries, { ...state, providerIds: [] });
  // Switching currency clears its dependent bounds in both URL and draft updates.
  const currencies = filterServices(entries, { ...state, currency: null, minPrice: null, maxPrice: null });

  return {
    total: filterServices(entries, state).length,
    types: countBy(types, ({ service }) => service.type),
    countries: countBy(locations, ({ service }) => service.provider.country.id),
    cities: countBy(locations, ({ service }) => service.provider.city.id),
    locationTotal: locations.length,
    homeTest: availability.filter(({ service }) => service.testAtHome).length,
    categories: countBy(categories, ({ service }) => service.category?.id),
    categoryTotal: categories.length,
    subcategories: countBy(subcategories, ({ service }) => service.subcategory?.id),
    subcategoryTotal: subcategories.length,
    providers: countBy(providers, ({ service }) => service.provider.id),
    currencies: countBy(currencies, ({ service }) => service.provider.currency),
    currencyTotal: currencies.length,
  };
}

import Big from "big.js";

import type { ExplorerState } from "@/lib/explorer-state";
import { getServicePricing } from "@/lib/pricing";
import type { AvailablePrice, ServicePricing } from "@/lib/pricing";
import type { Provider, Service } from "./types";

export interface PricedService {
  service: Service;
  pricing: ServicePricing;
}

export interface ProviderGroup {
  provider: Provider;
  services: PricedService[];
}

export function prepareServices(services: Service[]): PricedService[] {
  return services.map((service) => ({ service, pricing: getServicePricing(service) }));
}

function matchesPrice(price: AvailablePrice, state: ExplorerState): boolean {
  const amount = new Big(price.finalPrice);
  return (state.minPrice === null || amount.gte(state.minPrice)) &&
    (state.maxPrice === null || amount.lte(state.maxPrice));
}

function matchingPricing(pricing: ServicePricing, state: ExplorerState): ServicePricing | null {
  if (state.currency === null || (state.minPrice === null && state.maxPrice === null)) {
    return pricing;
  }
  if (pricing.kind === "fixed") {
    return pricing.price.status === "available" && matchesPrice(pricing.price, state)
      ? pricing : null;
  }

  let startingOption: typeof pricing.startingOption = null;
  for (const option of pricing.options) {
    if (option.price.status !== "available" || !matchesPrice(option.price, state)) continue;
    if (startingOption === null || new Big(option.price.finalPrice).lt(startingOption.price.finalPrice)) {
      startingOption = { ...option, price: option.price };
    }
  }
  return startingOption === null ? null : { ...pricing, startingOption };
}

export function filterServices(entries: PricedService[], state: ExplorerState): PricedService[] {
  const matches: PricedService[] = [];
  const query = state.query.toLowerCase();

  for (const entry of entries) {
    const { service } = entry;
    const provider = service.provider;
    if (query && !service.searchText.includes(query)) continue;
    if (state.types.length && !state.types.includes(service.type)) continue;
    if (state.categoryId !== null && service.category?.id !== state.categoryId) continue;
    if (state.subcategoryId !== null && service.subcategory?.id !== state.subcategoryId) continue;
    if (state.providerIds.length && !state.providerIds.includes(provider.id)) continue;
    if (state.location?.kind === "city" && provider.city.id !== state.location.id) continue;
    if (state.location?.kind === "country" && provider.country.id !== state.location.id) continue;
    if (state.currency !== null && provider.currency !== state.currency) continue;
    if (state.homeTest && !service.testAtHome) continue;
    const pricing = matchingPricing(entry.pricing, state);
    if (pricing === null) continue;

    matches.push({ service, pricing });
  }
  return matches;
}

export function getProviderGroups(entries: PricedService[], state: ExplorerState): ProviderGroup[] {
  const groups = new Map<number, ProviderGroup>();
  for (const entry of filterServices(entries, state)) {
    const provider = entry.service.provider;
    let group = groups.get(provider.id);
    if (!group) {
      group = { provider, services: [] };
      groups.set(provider.id, group);
    }
    group.services.push(entry);
  }

  // Ranking and pagination operate on these complete matching groups.
  return [...groups.values()];
}

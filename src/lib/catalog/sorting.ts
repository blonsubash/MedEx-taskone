import Big from "big.js";

import type { ExplorerState } from "@/lib/explorer-state";
import { CURRENCIES } from "@/lib/pricing";
import { normalizeSearchQuery } from "@/lib/search";
import type { PricedService, ProviderGroup } from "./results";

function compareText(a: string, b: string) {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function relevance(entry: PricedService, query: string): number {
  if (!query) return 0;
  const text = (value: string) => normalizeSearchQuery(value).toLowerCase();
  const { service } = entry;
  const title = text(service.title);
  if (title === query) return 0;
  if (title.includes(query)) return 1;
  if (text(service.provider.name).includes(query)) return 2;
  if ([service.category?.title, service.subcategory?.title].some((label) => label && text(label).includes(query))) return 3;
  return 4;
}

function displayedPrice({ pricing }: PricedService): Big | null {
  const price = pricing.kind === "fixed" ? pricing.price : pricing.startingOption?.price;
  return price?.status === "available" ? new Big(price.finalPrice) : null;
}

function comparePrices(a: Big | null, b: Big | null, descending: boolean) {
  // Missing prices follow known prices in both directions.
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a.cmp(b) * (descending ? -1 : 1);
}

function compareCurrencies(a: string, b: string) {
  const position = (currency: string) => {
    const index = CURRENCIES.findIndex((known) => known === currency);
    return index === -1 ? CURRENCIES.length : index;
  };
  return position(a) - position(b) || compareText(a, b) || a.localeCompare(b, "en");
}

export function sortProviderGroups(groups: ProviderGroup[], state: ExplorerState): ProviderGroup[] {
  const query = normalizeSearchQuery(state.query).toLowerCase();
  const byPrice = state.sort === "price-asc" || state.sort === "price-desc";
  const descending = state.sort === "price-desc";
  const ranked = groups.map((group) => {
    const services = group.services.map((entry) => ({
      entry, relevance: relevance(entry, query), price: displayedPrice(entry),
    })).sort((a, b) => {
      const rank = byPrice ? comparePrices(a.price, b.price, descending) : a.relevance - b.relevance;
      return rank || compareText(a.entry.service.title, b.entry.service.title) ||
        a.entry.service.id.localeCompare(b.entry.service.id, "en");
    });
    return {
      group: { ...group, services: services.map(({ entry }) => entry) },
      relevance: services[0]?.relevance ?? 4,
      // Sorted rows put the cheapest/most expensive displayed match first.
      price: services[0]?.price ?? null,
    };
  });
  ranked.sort((a, b) => {
    let rank = 0;
    if (byPrice) {
      // Currency groups have a fixed order; their amounts are never compared.
      rank = compareCurrencies(a.group.provider.currency, b.group.provider.currency) ||
        comparePrices(a.price, b.price, descending);
    } else if (state.sort === "rating") {
      const left = a.group.provider.rating;
      const right = b.group.provider.rating;
      rank = left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left;
    } else {
      rank = a.relevance - b.relevance;
    }
    return rank || compareText(a.group.provider.name, b.group.provider.name) ||
      a.group.provider.id - b.group.provider.id;
  });
  return ranked.map(({ group }) => group);
}

export const PROVIDERS_PER_PAGE = 6;

export interface ProviderPage {
  groups: ProviderGroup[];
  page: number;
  pageCount: number;
  totalProviders: number;
  start: number;
  end: number;
}

export function paginateProviderGroups(groups: ProviderGroup[], requestedPage: number): ProviderPage {
  const totalProviders = groups.length;
  const pageCount = Math.max(1, Math.ceil(totalProviders / PROVIDERS_PER_PAGE));
  const validPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = Math.min(validPage, pageCount);
  const offset = (page - 1) * PROVIDERS_PER_PAGE;
  return {
    groups: groups.slice(offset, offset + PROVIDERS_PER_PAGE), page, pageCount, totalProviders,
    start: totalProviders === 0 ? 0 : offset + 1,
    end: Math.min(offset + PROVIDERS_PER_PAGE, totalProviders),
  };
}

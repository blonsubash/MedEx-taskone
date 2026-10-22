import Big from "big.js";

import { normalizeSearchQuery } from "./search";

import { SERVICE_TYPES } from "./catalog/types";
import type { ServiceType } from "./catalog/types";
import { CURRENCIES } from "./pricing";
import type { Currency } from "./pricing";

export const SORT_ORDERS = ["relevance", "price-asc", "price-desc", "rating"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];
export type LocationFilter =
  | { kind: "city"; id: string }
  | { kind: "country"; id: number };

export interface ExplorerState {
  query: string;
  types: ServiceType[];
  categoryId: string | null;
  subcategoryId: string | null;
  providerIds: number[];
  location: LocationFilter | null;
  currency: Currency | null;
  minPrice: string | null;
  maxPrice: string | null;
  homeTest: boolean;
  sort: SortOrder;
  page: number;
}

export type ExplorerPatch = Partial<ExplorerState>;
export type PageSearchParams = Record<string, string | string[] | undefined>;
type SearchParams = Pick<URLSearchParams, "get" | "getAll">;

const QUERY_KEYS = [
  "q", "type", "category", "subcategory", "provider", "city", "country",
  "currency", "min", "max", "home", "sort", "page",
];

function nonEmpty(value: string | null): string | null {
  return value?.trim() || null;
}

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function priceBound(value: string | null): string | null {
  const text = nonEmpty(value);
  return text !== null && /^\d+(?:\.\d+)?$/.test(text)
    ? new Big(text).toFixed()
    : null;
}

export function toSearchParams(values: PageSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  return params;
}

export function parseExplorerState(params: SearchParams): ExplorerState {
  const categoryId = nonEmpty(params.get("category"));
  const cityId = nonEmpty(params.get("city"));
  const countryId = positiveInteger(params.get("country"));
  const currency = CURRENCIES.find((value) => value === params.get("currency")) ?? null;
  const selectedTypes = new Set(params.getAll("type"));
  const providerIds = params.getAll("provider")
    .map(positiveInteger)
    .filter((id): id is number => id !== null);
  let minPrice = currency === null ? null : priceBound(params.get("min"));
  let maxPrice = currency === null ? null : priceBound(params.get("max"));
  if (minPrice !== null && maxPrice !== null && new Big(minPrice).gt(maxPrice)) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    query: normalizeSearchQuery(params.get("q") ?? ""),
    types: SERVICE_TYPES.filter((type) => selectedTypes.has(type)),
    categoryId,
    subcategoryId: categoryId === null ? null : nonEmpty(params.get("subcategory")),
    providerIds: [...new Set(providerIds)].sort((a, b) => a - b),
    location: cityId !== null
      ? { kind: "city", id: cityId }
      : countryId !== null ? { kind: "country", id: countryId } : null,
    currency,
    minPrice,
    maxPrice,
    homeTest: params.get("home") === "true",
    sort: SORT_ORDERS.find((value) => value === params.get("sort")) ?? "relevance",
    page: positiveInteger(params.get("page")) ?? 1,
  };
}

function writeState(state: ExplorerState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const type of state.types) params.append("type", type);
  if (state.categoryId !== null) params.set("category", state.categoryId);
  if (state.subcategoryId !== null) params.set("subcategory", state.subcategoryId);
  for (const id of state.providerIds) params.append("provider", String(id));
  if (state.location !== null) params.set(state.location.kind, String(state.location.id));
  if (state.currency !== null) params.set("currency", state.currency);
  if (state.minPrice !== null) params.set("min", state.minPrice);
  if (state.maxPrice !== null) params.set("max", state.maxPrice);
  if (state.homeTest) params.set("home", "true");
  if (state.sort !== "relevance") params.set("sort", state.sort);
  if (state.page !== 1) params.set("page", String(state.page));
  return params;
}

export function serializeExplorerState(state: ExplorerState): URLSearchParams {
  // Use the parser as the single normalization policy, including for UI edits.
  return writeState(parseExplorerState(writeState(state)));
}

export function updateExplorerQuery(
  current: URLSearchParams,
  patch: ExplorerPatch,
): URLSearchParams {
  const previous = parseExplorerState(current);
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as ExplorerPatch;
  const next = { ...previous, ...definedPatch };
  if (patch.categoryId !== undefined && patch.categoryId !== previous.categoryId) {
    next.subcategoryId = patch.subcategoryId ?? null;
  }
  if (patch.currency !== undefined && patch.currency !== previous.currency) {
    next.minPrice = patch.minPrice ?? null;
    next.maxPrice = patch.maxPrice ?? null;
  }

  const normalized = parseExplorerState(writeState(next));
  const beforeFilters = serializeExplorerState({ ...previous, page: 1 }).toString();
  const afterFilters = serializeExplorerState({ ...normalized, page: 1 }).toString();
  if (beforeFilters !== afterFilters) normalized.page = 1;

  const result = new URLSearchParams(current);
  for (const key of QUERY_KEYS) result.delete(key);
  for (const [key, value] of serializeExplorerState(normalized)) result.append(key, value);
  return result;
}

export function buildExplorerHref(currentHref: string, patch: ExplorerPatch): string {
  const url = new URL(currentHref);
  url.search = updateExplorerQuery(url.searchParams, patch).toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

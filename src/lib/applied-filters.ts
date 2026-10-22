import { resolveCategoryState } from "./catalog/category-state";
import { SERVICE_TYPE_LABELS } from "./catalog/filter-options";
import type { LocationCountry, ProviderOption } from "./catalog/filter-options";
import type { Category } from "./catalog/types";
import type { ExplorerPatch, ExplorerState } from "./explorer-state";

export interface AppliedFilter {
  id: string;
  label: string;
  remove: ExplorerPatch;
}

export interface FilterLabels {
  categories: Category[];
  locations: LocationCountry[];
  providers: ProviderOption[];
  ready: boolean;
}

function priceLabel(amount: string, currency: string): string {
  const [whole, fraction] = amount.split(".");
  const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(BigInt(whole));
  return `${currency} ${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function getAppliedFilters(state: ExplorerState, labels: FilterLabels): AppliedFilter[] {
  const filters: AppliedFilter[] = [];
  if (state.query) filters.push({ id: "query", label: `Search: ${state.query}`, remove: { query: "" } });
  for (const type of state.types) {
    const types = state.types.filter((selected) => selected !== type);
    const next = labels.ready ? resolveCategoryState({ ...state, types }, labels.categories) : { ...state, types };
    filters.push({ id: `type:${type}`, label: `Type: ${SERVICE_TYPE_LABELS[type]}`,
      remove: { types, categoryId: next.categoryId, subcategoryId: next.subcategoryId } });
  }
  const category = labels.categories.find((option) => option.id === state.categoryId);
  if (state.categoryId !== null) filters.push({
    id: "category", label: `Category: ${category ? `${category.title} · ${SERVICE_TYPE_LABELS[category.type]}` : "Selected category"}`,
    remove: { categoryId: null, subcategoryId: null },
  });
  if (state.subcategoryId !== null) filters.push({
    id: "subcategory", label: `Subcategory: ${category?.children.find((child) => child.id === state.subcategoryId)?.title ?? "Selected subcategory"}`,
    remove: { subcategoryId: null },
  });
  for (const id of state.providerIds) {
    const provider = labels.providers.find((option) => option.id === id);
    filters.push({ id: `provider:${id}`, label: `Provider: ${provider ? `${provider.name} · ${provider.location}`
      : `${labels.ready ? "Unavailable" : "Selected"} provider #${id}`}`,
    remove: { providerIds: state.providerIds.filter((selected) => selected !== id) } });
  }
  if (state.location !== null) {
    let label: string;
    if (state.location.kind === "country") {
      const id = state.location.id;
      label = `Country: ${labels.locations.find((country) => country.id === id)?.name ??
        `${labels.ready ? "Unavailable" : "Selected"} country`}`;
    } else {
      const id = state.location.id;
      const country = labels.locations.find((option) => option.cities.some((city) => city.id === id));
      const city = country?.cities.find((option) => option.id === id);
      label = `City: ${city && country ? `${city.name}, ${country.name}` : `${labels.ready ? "Unavailable" : "Selected"} city`}`;
    }
    filters.push({ id: "location", label, remove: { location: null } });
  }
  if (state.currency !== null) {
    filters.push({ id: "currency", label: `Currency: ${state.currency}`,
      remove: { currency: null, minPrice: null, maxPrice: null } });
    if (state.minPrice !== null) filters.push({ id: "minPrice", label: `Minimum: ${priceLabel(state.minPrice, state.currency)}`,
      remove: { minPrice: null } });
    if (state.maxPrice !== null) filters.push({ id: "maxPrice", label: `Maximum: ${priceLabel(state.maxPrice, state.currency)}`,
      remove: { maxPrice: null } });
  }
  if (state.homeTest) filters.push({ id: "homeTest", label: "Home test available", remove: { homeTest: false } });
  return filters;
}

export function clearFiltersPatch(): ExplorerPatch {
  return { query: "", types: [], categoryId: null, subcategoryId: null, providerIds: [],
    location: null, currency: null, minPrice: null, maxPrice: null, homeTest: false, page: 1 };
}

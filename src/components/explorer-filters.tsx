"use client";

import { FacetCount, formatFacetCount } from "./facet-count";
import type { FacetCounts } from "@/lib/catalog/facets";
import { PriceFilter } from "./price-filter";
import { ProviderFilter } from "./provider-filter";

import { resolveCategoryState } from "@/lib/catalog/category-state";
import { SERVICE_TYPE_LABELS } from "@/lib/catalog/filter-options";
import type { LocationCountry, ProviderOption } from "@/lib/catalog/filter-options";
import { SERVICE_TYPES } from "@/lib/catalog/types";
import type { Category } from "@/lib/catalog/types";
import type { ExplorerPatch, ExplorerState, LocationFilter } from "@/lib/explorer-state";

type Props = {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  locations: LocationCountry[];
  categories: Category[];
  providers: ProviderOption[];
  ready: boolean;
  facets: FacetCounts | null;
};

export function ExplorerFilters({ state, update, locations, categories, providers, ready, facets }: Props) {
  const locationValue = state.location ? `${state.location.kind}:${state.location.id}` : "";
  const locationChoices = new Map<string, LocationFilter>();
  for (const country of locations) {
    locationChoices.set(`country:${country.id}`, { kind: "country", id: country.id });
    for (const city of country.cities) {
      locationChoices.set(`city:${city.id}`, { kind: "city", id: city.id });
    }
  }
  const unknownLocation = locationValue !== "" && !locationChoices.has(locationValue);

  const category = categories.find((option) => option.id === state.categoryId);
  const children = category?.children ?? [];

  return (
    <div className="filter-panel" role="region" aria-labelledby="filters-title">
      <h2 id="filters-title">Filter services</h2>
      <p className="filter-help facet-help">Counts show services matching the other filters. Selected choices can still be removed at zero.</p>
      <div className="filter-fields">
        <fieldset className="filter-field" disabled={!ready}>
          <legend>Service types</legend>
          <div className="type-options">
            {SERVICE_TYPES.map((type) => (
              <label className="type-option" key={type}>
                <input type="checkbox" name="type" value={type}
                  checked={state.types.includes(type)}
                  disabled={facets !== null && !state.types.includes(type) && !facets.types.get(type)} onChange={(event) => {
                    const types = event.target.checked ? [...state.types, type]
                      : state.types.filter((selected) => selected !== type);
                    const next = resolveCategoryState({ ...state, types }, categories);
                    update({ types, categoryId: next.categoryId, subcategoryId: next.subcategoryId });
                  }} />
                {SERVICE_TYPE_LABELS[type]} <FacetCount count={facets ? facets.types.get(type) ?? 0 : undefined} />
              </label>
            ))}
          </div>
          <p className="filter-help">Leave unchecked to include all types.</p>
        </fieldset>
        <fieldset className="filter-field" disabled={!ready}>
          <legend>Location</legend>
          <label className="sr-only" htmlFor="location-filter">Country or city</label>
          <select id="location-filter" value={locationValue} onChange={(event) => {
            update({ location: locationChoices.get(event.target.value) ?? null });
          }}>
            <option value="">All locations ({formatFacetCount(facets?.locationTotal)})</option>
            {unknownLocation && <option value={locationValue}>
              {ready ? "Unavailable location (0)" : "Selected location"}
            </option>}
            <optgroup label="Countries">
              {locations.map((country) => <option key={country.id} value={`country:${country.id}`}
                disabled={facets !== null && locationValue !== `country:${country.id}` && !facets.countries.get(country.id)}>
                {country.name} ({formatFacetCount(facets ? facets.countries.get(country.id) ?? 0 : undefined)})
              </option>)}
            </optgroup>
            {locations.map((country) => (
              <optgroup key={country.id} label={`Cities in ${country.name}`}>
                {country.cities.map((city) => <option key={city.id} value={`city:${city.id}`}
                  disabled={facets !== null && locationValue !== `city:${city.id}` && !facets.cities.get(city.id)}>
                  {city.name} ({formatFacetCount(facets ? facets.cities.get(city.id) ?? 0 : undefined)})
                </option>)}
              </optgroup>
            ))}
          </select>
          <p className="filter-help">Choose a country or a city.</p>
        </fieldset>
        <fieldset className="filter-field" disabled={!ready}>
          <legend>Availability</legend>
          <label className="home-option">
            <input type="checkbox" checked={state.homeTest}
              disabled={facets !== null && !state.homeTest && facets.homeTest === 0}
              onChange={(event) => update({ homeTest: event.target.checked })} />
            Home test available <FacetCount count={facets?.homeTest} />
          </label>
          <p className="filter-help">Only services offering home testing.</p>
        </fieldset>
      </div>
      <div className="category-fields">
        <fieldset className="filter-field" disabled={!ready}>
          <legend>Category</legend>
          <label className="sr-only" htmlFor="category-filter">Category</label>
          <select id="category-filter" value={state.categoryId ?? ""}
            onChange={(event) => update({ categoryId: event.target.value || null })}>
            <option value="">All categories ({formatFacetCount(facets?.categoryTotal)})</option>
            {!ready && state.categoryId && <option value={state.categoryId}>Selected category</option>}
            {SERVICE_TYPES.map((type) => {
              const options = categories.filter((option) => option.type === type);
              return options.length > 0 && <optgroup key={type} label={SERVICE_TYPE_LABELS[type]}>
                {options.map((option) => <option key={option.id} value={option.id}
                  disabled={facets !== null && state.categoryId !== option.id && !facets.categories.get(option.id)}>
                  {option.title} · {SERVICE_TYPE_LABELS[option.type]} ({formatFacetCount(facets ? facets.categories.get(option.id) ?? 0 : undefined)})
                </option>)}
              </optgroup>;
            })}
          </select>
          <p className="filter-help">Category counts follow the selected service types.</p>
        </fieldset>
        <fieldset className="filter-field" disabled={!ready || children.length === 0}>
          <legend>Subcategory</legend>
          <label className="sr-only" htmlFor="subcategory-filter">Subcategory</label>
          <select id="subcategory-filter" value={state.subcategoryId ?? ""}
            onChange={(event) => update({ subcategoryId: event.target.value || null })}>
            <option value="">{!category ? "Select a category first" : children.length === 0
              ? "No subcategories" : `All subcategories (${formatFacetCount(facets?.subcategoryTotal)})`}</option>
            {!ready && state.subcategoryId && <option value={state.subcategoryId}>Selected subcategory</option>}
            {children.map((child) => <option key={child.id} value={child.id}
              disabled={facets !== null && state.subcategoryId !== child.id && !facets.subcategories.get(child.id)}>
              {child.title} ({formatFacetCount(facets ? facets.subcategories.get(child.id) ?? 0 : undefined)})</option>)}
          </select>
          <p className="filter-help">{category ? `Within ${category.title}.`
            : "Choose a category to see its subcategories."}</p>
        </fieldset>
      </div>
      <PriceFilter state={state} update={update} ready={ready} facets={facets} />
      <ProviderFilter providers={providers} selectedIds={state.providerIds} update={update} ready={ready} counts={facets?.providers ?? null} />
    </div>
  );
}

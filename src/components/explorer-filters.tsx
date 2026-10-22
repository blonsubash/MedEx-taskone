"use client";

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
};

export function ExplorerFilters({ state, update, locations, categories, providers, ready }: Props) {
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
  const compatibleCategories = categories.filter((option) =>
    state.types.length === 0 || state.types.includes(option.type));
  const children = category?.children ?? [];

  return (
    <div className="filter-panel" role="region" aria-labelledby="filters-title">
      <h2 id="filters-title">Filter services</h2>
      <div className="filter-fields">
        <fieldset className="filter-field" disabled={!ready}>
          <legend>Service types</legend>
          <div className="type-options">
            {SERVICE_TYPES.map((type) => (
              <label className="type-option" key={type}>
                <input type="checkbox" name="type" value={type}
                  checked={state.types.includes(type)} onChange={(event) => {
                    const types = event.target.checked ? [...state.types, type]
                      : state.types.filter((selected) => selected !== type);
                    const next = resolveCategoryState({ ...state, types }, categories);
                    update({ types, categoryId: next.categoryId, subcategoryId: next.subcategoryId });
                  }} />
                {SERVICE_TYPE_LABELS[type]}
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
            <option value="">All locations</option>
            {unknownLocation && <option value={locationValue}>
              {ready ? "Unavailable location" : "Selected location"}
            </option>}
            <optgroup label="Countries">
              {locations.map((country) => <option key={country.id} value={`country:${country.id}`}>
                {country.name}
              </option>)}
            </optgroup>
            {locations.map((country) => (
              <optgroup key={country.id} label={`Cities in ${country.name}`}>
                {country.cities.map((city) => <option key={city.id} value={`city:${city.id}`}>
                  {city.name}
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
              onChange={(event) => update({ homeTest: event.target.checked })} />
            Home test available
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
            <option value="">All categories</option>
            {!ready && state.categoryId && <option value={state.categoryId}>Selected category</option>}
            {SERVICE_TYPES.map((type) => {
              const options = compatibleCategories.filter((option) => option.type === type);
              return options.length > 0 && <optgroup key={type} label={SERVICE_TYPE_LABELS[type]}>
                {options.map((option) => <option key={option.id} value={option.id}>
                  {option.title} · {SERVICE_TYPE_LABELS[option.type]}
                </option>)}
              </optgroup>;
            })}
          </select>
          <p className="filter-help">Categories follow the selected service types.</p>
        </fieldset>
        <fieldset className="filter-field" disabled={!ready || children.length === 0}>
          <legend>Subcategory</legend>
          <label className="sr-only" htmlFor="subcategory-filter">Subcategory</label>
          <select id="subcategory-filter" value={state.subcategoryId ?? ""}
            onChange={(event) => update({ subcategoryId: event.target.value || null })}>
            <option value="">{!category ? "Select a category first" : children.length === 0
              ? "No subcategories" : "All subcategories"}</option>
            {!ready && state.subcategoryId && <option value={state.subcategoryId}>Selected subcategory</option>}
            {children.map((child) => <option key={child.id} value={child.id}>{child.title}</option>)}
          </select>
          <p className="filter-help">{category ? `Within ${category.title}.`
            : "Choose a category to see its subcategories."}</p>
        </fieldset>
      </div>
      <ProviderFilter providers={providers} selectedIds={state.providerIds} update={update} ready={ready} />
    </div>
  );
}

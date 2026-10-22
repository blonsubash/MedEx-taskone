"use client";

import { SERVICE_TYPE_LABELS } from "@/lib/catalog/filter-options";
import type { LocationCountry } from "@/lib/catalog/filter-options";
import { SERVICE_TYPES } from "@/lib/catalog/types";
import type { ExplorerPatch, ExplorerState, LocationFilter } from "@/lib/explorer-state";

type Props = {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  locations: LocationCountry[];
  ready: boolean;
};

export function ExplorerFilters({ state, update, locations, ready }: Props) {
  const locationValue = state.location ? `${state.location.kind}:${state.location.id}` : "";
  const locationChoices = new Map<string, LocationFilter>();
  for (const country of locations) {
    locationChoices.set(`country:${country.id}`, { kind: "country", id: country.id });
    for (const city of country.cities) {
      locationChoices.set(`city:${city.id}`, { kind: "city", id: city.id });
    }
  }
  const unknownLocation = locationValue !== "" && !locationChoices.has(locationValue);

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
                  checked={state.types.includes(type)} onChange={(event) => update({
                    types: event.target.checked ? [...state.types, type]
                      : state.types.filter((selected) => selected !== type),
                  })} />
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
    </div>
  );
}

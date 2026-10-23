"use client";

import { FacetCount } from "./facet-count";

import { useLayoutEffect, useRef, useState } from "react";

import { filterProviderOptions } from "@/lib/catalog/filter-options";
import type { ProviderOption } from "@/lib/catalog/filter-options";
import type { ExplorerPatch } from "@/lib/explorer-state";

export function ProviderFilter({ providers, selectedIds, update, ready, counts }: {
  providers: ProviderOption[];
  selectedIds: number[];
  update: (patch: ExplorerPatch) => void;
  ready: boolean;
  counts: Map<number, number> | null;
}) {
  const [query, setQuery] = useState("");
  const picker = useRef<HTMLDetailsElement>(null);
  const nextFocus = useRef<number | "search" | null>(null);
  useLayoutEffect(() => {
    if (nextFocus.current === null) return;
    const inputs = picker.current?.querySelectorAll<HTMLInputElement>("input[name='provider']");
    const choice = [...(inputs ?? [])].find((input) => Number(input.value) === nextFocus.current && !input.matches(":disabled"));
    const target = choice ?? picker.current?.querySelector<HTMLInputElement>("#provider-query");
    nextFocus.current = null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [selectedIds]);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const selected = selectedIds.map((id) => byId.get(id) ?? {
    id, name: `${ready ? "Unavailable" : "Selected"} provider #${id}`, location: "",
  });
  const matches = filterProviderOptions(providers, query).filter((provider) => !selectedIds.includes(provider.id));

  function choice(provider: ProviderOption) {
    return (
      <li key={provider.id}>
        <label className="provider-choice">
          <input type="checkbox" name="provider" value={provider.id}
            disabled={counts !== null && !selectedIds.includes(provider.id) && !counts.get(provider.id)} checked={selectedIds.includes(provider.id)} onChange={(event) => {
              nextFocus.current = provider.id;
              update({ providerIds: event.target.checked ? [...selectedIds, provider.id]
                : selectedIds.filter((id) => id !== provider.id) });
            }} />
          <span><span className="provider-choice-name">{provider.name} <FacetCount count={counts ? counts.get(provider.id) ?? 0 : undefined} /></span>
            {provider.location && <span className="provider-choice-location">{provider.location}</span>}
          </span>
        </label>
      </li>
    );
  }

  return (
    <details ref={picker} className="provider-picker">
      <summary><span>Providers</span>{" "}<span className="provider-selection-count">
        {selectedIds.length ? `${selectedIds.length} selected` : "All providers"}
      </span></summary>
      <fieldset className="filter-field" disabled={!ready}>
        <legend className="sr-only">Choose providers</legend>
        <div className="provider-search-row">
          <div>
            <label htmlFor="provider-query">Search providers</label>
            <input id="provider-query" type="search" value={query} autoComplete="off"
              placeholder="Find a provider by name" onChange={(event) => setQuery(event.target.value)}
              aria-describedby="provider-search-help" />
          </div>
          <button type="button" className="secondary-button" disabled={selectedIds.length === 0}
            onClick={() => { nextFocus.current = "search"; update({ providerIds: [] }); }}>Clear provider selection</button>
        </div>
        <p className="filter-help" id="provider-search-help">Choose one or more providers. This search only narrows the provider list.</p>
        <div className="provider-options" role="region" aria-label="Provider choices" tabIndex={0}>
          {selected.length > 0 && <>
            <p className="provider-options-heading">Selected providers</p>
            <ul className="provider-choice-list">{selected.map(choice)}</ul>
          </>}
          <p className="provider-options-heading">{selected.length ? "More providers" : "Available providers"}</p>
          <ul className="provider-choice-list">{matches.map(choice)}</ul>
          {matches.length === 0 && <p className="provider-options-empty" role="status">
            {ready ? selected.length ? "No other providers match this search." : "No providers match this search."
              : "Loading providers…"}
          </p>}
        </div>
      </fieldset>
    </details>
  );
}

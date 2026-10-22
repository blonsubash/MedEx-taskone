"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";

import { getAppliedFilters } from "@/lib/applied-filters";
import type { FilterLabels } from "@/lib/applied-filters";
import { parseExplorerState } from "@/lib/explorer-state";
import type { ExplorerPatch, ExplorerState } from "@/lib/explorer-state";
import { resetCatalogSearch } from "./catalog-search";

export function AppliedFilters({ state, labels, update, clear, resultsHeading }: {
  state: ExplorerState;
  labels: FilterLabels;
  update: (patch: ExplorerPatch) => void;
  clear: () => void;
  resultsHeading: RefObject<HTMLHeadingElement | null>;
}) {
  const filters = useMemo(() => getAppliedFilters(state, labels), [state, labels]);
  const list = useRef<HTMLUListElement>(null);
  const nextFocus = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (nextFocus.current === null) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>("button");
    const target = buttons?.length ? buttons[Math.min(nextFocus.current, buttons.length - 1)] : resultsHeading.current;
    nextFocus.current = null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [filters, resultsHeading]);

  if (filters.length === 0) return null;
  return <section className="applied-filters" aria-labelledby="applied-filters-title">
    <div className="applied-filters-heading">
      <h3 id="applied-filters-title">Applied filters ({filters.length})</h3>
      <button type="button" className="clear-filters-button" onClick={clear}>Clear all filters</button>
    </div>
    <ul ref={list} className="filter-chips" aria-label="Applied filter choices">
      {filters.map((filter, index) => <li key={filter.id}>
        <button type="button" className="filter-chip" aria-label={`Remove ${filter.label}`} onClick={() => {
          // Build array removals from the latest URL when chips are clicked rapidly.
          const latest = parseExplorerState(new URLSearchParams(window.location.search));
          const current = getAppliedFilters(latest, labels).find((choice) => choice.id === filter.id);
          if (!current) return;
          if (filter.id === "query") resetCatalogSearch();
          nextFocus.current = index;
          update(current.remove);
        }}>
          <span className="filter-chip-label">{filter.label}</span><span aria-hidden="true">×</span>
        </button>
      </li>)}
    </ul>
  </section>;
}

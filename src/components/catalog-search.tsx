"use client";

import { useEffect, useMemo, useRef } from "react";

import type { ExplorerPatch } from "@/lib/explorer-state";
import { createSearchScheduler, normalizeSearchQuery } from "@/lib/search";

export function resetCatalogSearch() {
  // Trigger the search form's reset handler, including pending debounce cancellation.
  const form = document.getElementById("catalog-search-form");
  if (form instanceof HTMLFormElement) form.reset();
}

export function CatalogSearch({ query, update, immediate = false }: {
  query: string;
  immediate?: boolean;
  update: (patch: ExplorerPatch) => void;
}) {
  // Keep native draft text so URL normalization does not remove spaces while typing.
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const scheduler = useMemo(() => createSearchScheduler((value) => update({ query: value })), [update]);

  useEffect(() => {
    scheduler.cancel();
    if (input.current && normalizeSearchQuery(input.current.value) !== query) {
      input.current.value = query;
    }
  }, [query, scheduler]);

  useEffect(() => {
    function restoreFromHistory() {
      scheduler.cancel();
      if (input.current) {
        input.current.value = normalizeSearchQuery(new URLSearchParams(window.location.search).get("q") ?? "");
      }
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => {
      window.removeEventListener("popstate", restoreFromHistory);
      scheduler.cancel();
    };
  }, [scheduler]);

  return (
    <form id="catalog-search-form" className="catalog-search" role="search" aria-label="Catalog search"
      onReset={(event) => {
        event.preventDefault();
        scheduler.cancel();
        if (input.current) input.current.value = "";
      }} onSubmit={(event) => {
        event.preventDefault();
        if (!composing.current) scheduler.flush(input.current?.value ?? "");
      }}>
      <label htmlFor="catalog-query">Search services</label>
      <div className="catalog-search-row">
        <input ref={input} id="catalog-query" name="q" type="search" defaultValue={query}
          autoComplete="off" placeholder="Service, provider, or category name"
          aria-describedby="catalog-search-help"
          onCompositionStart={() => { composing.current = true; scheduler.cancel(); }}
          onCompositionEnd={(event) => { composing.current = false;
            if (immediate) scheduler.flush(event.currentTarget.value);
            else scheduler.schedule(event.currentTarget.value); }}
          onChange={(event) => {
            scheduler.cancel();
            if (!composing.current) {
              if (immediate) scheduler.flush(event.currentTarget.value);
              else scheduler.schedule(event.currentTarget.value);
            }
          }} />
        <button className="primary-button" type="submit">Search</button>
        <button className="secondary-button" type="button" aria-label="Clear catalog search" onClick={() => {
          if (input.current) { input.current.value = ""; input.current.focus(); }
          scheduler.flush("");
        }}>Clear</button>
      </div>
      <p className="filter-help" id="catalog-search-help">Search service titles, provider names, and categories.</p>
    </form>
  );
}

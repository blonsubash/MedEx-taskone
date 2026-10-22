"use client";

import { useId } from "react";

import { SORT_ORDERS } from "@/lib/explorer-state";
import type { ExplorerPatch, ExplorerState } from "@/lib/explorer-state";
import type { ProviderPage } from "@/lib/catalog/sorting";

const SORT_LABELS = {
  relevance: "Relevance",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  rating: "Highest rated",
};

export function ResultSort({ state, update, ready }: {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  ready: boolean;
}) {
  const priceSort = state.sort === "price-asc" || state.sort === "price-desc";
  return <div className="result-sort">
    <label htmlFor="result-sort">Sort by</label>
    <select id="result-sort" value={state.sort} disabled={!ready} aria-describedby="sort-help"
      onChange={(event) => update({ sort: SORT_ORDERS.find((sort) => sort === event.target.value) ?? "relevance" })}>
      {SORT_ORDERS.map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
    </select>
    <p className="filter-help" id="sort-help">{priceSort
      ? `${state.sort === "price-asc" ? "Cheapest" : "Most expensive"} matching service per provider. ${state.currency === null ? "Sorted separately within THB, NPR, and INR; no currency conversion. " : ""}Unavailable prices last within each currency. Wellness uses its displayed From price.`
      : state.sort === "rating" ? "Highest provider ratings first; unrated providers last."
        : state.query ? "Title matches first, then provider and category matches." : "Providers are listed alphabetically until you search."}</p>
  </div>;
}

export function ProviderPagination({ result, onPage, position }: {
  result: ProviderPage;
  onPage: (page: number) => void;
  position: "top" | "bottom";
}) {
  const id = useId();
  if (result.totalProviders === 0) return null;
  return <div className="pagination-bar">
    <p className="page-range" role={position === "top" ? "status" : undefined}>Showing providers {result.start}–{result.end} of {result.totalProviders}</p>
    {result.pageCount > 1 && <nav className="pagination" aria-label={`Provider pagination ${position}`}>
      <button className="secondary-button" type="button" disabled={result.page === 1}
        onClick={() => onPage(result.page - 1)}>Previous</button>
      <label className="sr-only" htmlFor={id}>Provider page</label>
      <select id={id} value={result.page} onChange={(event) => onPage(Number(event.target.value))}>
        {Array.from({ length: result.pageCount }, (_, index) => index + 1).map((page) =>
          <option key={page} value={page}>Page {page} of {result.pageCount}</option>)}
      </select>
      <button className="secondary-button" type="button" disabled={result.page === result.pageCount}
        onClick={() => onPage(result.page + 1)}>Next</button>
    </nav>}
  </div>;
}

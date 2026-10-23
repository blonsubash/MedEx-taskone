"use client";

import { useEffect, useRef, useState } from "react";

import { parseExplorerState } from "@/lib/explorer-state";
import type { ExplorerPatch, ExplorerState } from "@/lib/explorer-state";
import { formatFacetCount } from "./facet-count";
import type { FacetCounts } from "@/lib/catalog/facets";
import { CURRENCIES } from "@/lib/pricing";

function PriceRange({ state, update, immediate }: {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  immediate: boolean;
}) {
  const minimum = useRef<HTMLInputElement>(null);
  const maximum = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Draft previews normalize values without interrupting partial decimal entry.
    if (immediate && (document.activeElement === minimum.current || document.activeElement === maximum.current)) return;
    minimum.current!.value = state.minPrice ?? "";
    maximum.current!.value = state.maxPrice ?? "";
  }, [state.minPrice, state.maxPrice, immediate]);

  useEffect(() => {
    const restore = () => {
      const restored = parseExplorerState(new URLSearchParams(window.location.search));
      minimum.current!.value = restored.minPrice ?? "";
      maximum.current!.value = restored.maxPrice ?? "";
      setNotice("");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function applyRange(finishEditing = true) {
    const min = minimum.current!.value.trim();
    const max = maximum.current!.value.trim();
    const params = new URLSearchParams({ currency: state.currency ?? "", min, max });
    const next = parseExplorerState(params);
    const invalid = (min !== "" && !/^\d+(?:\.\d+)?$/.test(min)) ||
      (max !== "" && !/^\d+(?:\.\d+)?$/.test(max));
    if (finishEditing) {
      minimum.current!.value = next.minPrice ?? "";
      maximum.current!.value = next.maxPrice ?? "";
    }
    setNotice(invalid ? `${finishEditing ? "Invalid amounts were cleared. " : ""}Use non-negative numbers, such as 1500.50.` : "");
    update({ minPrice: next.minPrice, maxPrice: next.maxPrice });
  }

  return <form className="price-range" aria-label="Price range"
    onChange={() => { if (immediate) applyRange(false); }}
    onKeyDown={(event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) {
        event.preventDefault();
        applyRange();
      }
    }} onSubmit={(event) => {
      event.preventDefault();
      applyRange();
    }} onBlur={(event) => {
      // Commit both fields together, including before the mobile drawer's Apply action.
      if (!event.currentTarget.contains(event.relatedTarget)) applyRange();
    }}>
    <div className="price-inputs">
      <label htmlFor="minimum-price">Minimum
        <input ref={minimum} id="minimum-price" name="min" type="text" inputMode="decimal"
          autoComplete="off" defaultValue={state.minPrice ?? ""} placeholder="No minimum"
          disabled={state.currency === null} aria-label={`Minimum price${state.currency ? ` in ${state.currency}` : ""}`} aria-describedby="price-range-help price-range-notice" />
      </label>
      <label htmlFor="maximum-price">Maximum
        <input ref={maximum} id="maximum-price" name="max" type="text" inputMode="decimal"
          autoComplete="off" defaultValue={state.maxPrice ?? ""} placeholder="No maximum"
          disabled={state.currency === null} aria-label={`Maximum price${state.currency ? ` in ${state.currency}` : ""}`} aria-describedby="price-range-help price-range-notice" />
      </label>
    </div>
    <div className="price-range-actions">
      {!immediate && <button type="submit" className="secondary-button" disabled={state.currency === null}>Apply range</button>}
      <button type="button" className="secondary-button" disabled={state.currency === null}
        onClick={() => {
          minimum.current!.value = "";
          maximum.current!.value = "";
          setNotice("");
          update({ minPrice: null, maxPrice: null });
        }}>Clear range</button>
    </div>
    <p className="filter-help" id="price-range-help">{immediate
      ? "Bounds are inclusive. Preview updates as you type. Reversed bounds are reordered when you finish editing."
      : "Bounds are inclusive. Edits apply when you leave these fields or press Apply range. Reversed bounds are swapped."}</p>
    <p className="filter-help" id="price-range-notice" role="status">{notice}</p>
  </form>;
}

export function PriceFilter({ state, update, ready, facets, immediate = false }: {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  ready: boolean;
  facets: FacetCounts | null;
  immediate?: boolean;
}) {
  return <fieldset className="filter-field price-filter" disabled={!ready}>
    <legend>Price</legend>
    <label htmlFor="currency-filter">Currency</label>
    <select id="currency-filter" value={state.currency ?? ""} aria-describedby="price-currency-help"
      onChange={(event) => update({ currency: CURRENCIES.find((currency) => currency === event.target.value) ?? null })}>
      <option value="">All currencies ({formatFacetCount(facets?.currencyTotal)})</option>
      {CURRENCIES.map((currency) => <option key={currency} value={currency}
        disabled={facets !== null && state.currency !== currency && !facets.currencies.get(currency)}>
        {currency} ({formatFacetCount(facets ? facets.currencies.get(currency) ?? 0 : undefined)})</option>)}
    </select>
    <p className="filter-help" id="price-currency-help">{state.currency
      ? `${state.currency} prices only. Changing currency clears the range.`
      : "Choose a currency to set a price range. Amounts are not converted."}</p>
    <PriceRange key={state.currency ?? "all"} state={state} update={update} immediate={immediate} />
    <p className="filter-help">Final prices include discounts and service charges. Optional home collection is extra. Unavailable prices are excluded only when a range is set.</p>
    <p className="filter-help">Wellness matches any duration in range and shows the lowest matching price and duration.</p>
  </fieldset>;
}

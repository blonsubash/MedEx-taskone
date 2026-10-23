"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { clearFiltersPatch } from "@/lib/applied-filters";
import { AppliedFilters } from "./applied-filters";
import { resetCatalogSearch } from "./catalog-search";
import { resolveCategoryState } from "@/lib/catalog/category-state";
import type { Category } from "@/lib/catalog/types";
import { getLocationOptions, getProviderOptions } from "@/lib/catalog/filter-options";
import type { LocationCountry, ProviderOption } from "@/lib/catalog/filter-options";
import { loadCatalog, readCatalogSimulation } from "@/lib/catalog/load";
import { createCatalogResource } from "@/lib/catalog/resource";
import type { CatalogResource } from "@/lib/catalog/resource";
import { getProviderGroups, prepareServices } from "@/lib/catalog/results";
import type { PricedService } from "@/lib/catalog/results";
import { paginateProviderGroups, sortProviderGroups } from "@/lib/catalog/sorting";
import { parseExplorerState, serializeExplorerState } from "@/lib/explorer-state";
import { useExplorerState } from "./explorer-state-provider";
import { ExplorerSidebar } from "./explorer-sidebar";
import { ProviderResults } from "./provider-results";
import { LiveStatus } from "./live-status";
import { ProviderPagination, ResultSort } from "./result-controls";

type CatalogState =
  | Exclude<CatalogResource, { status: "ready" }>
  | { status: "ready"; offline: boolean; entries: PricedService[]; locations: LocationCountry[]; categories: Category[]; providers: ProviderOption[] };

export function ServiceExplorer() {
  const { state, update } = useExplorerState();
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading", slow: false });
  const resource = useRef<ReturnType<typeof createCatalogResource> | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    resource.current = createCatalogResource({
      connection: window,
      isOnline: () => navigator.onLine,
      load: (signal, retry) => loadCatalog(signal, readCatalogSimulation(new URLSearchParams(window.location.search), retry)),
      publish: (result) => {
        if (result.status !== "ready") { setCatalog(result); return; }
        // Connection changes retain the prepared catalog instead of recalculating prices.
        setCatalog((previous) => previous.status === "ready" ? { ...previous, offline: result.offline } : {
          status: "ready",
          offline: result.offline,
          entries: prepareServices(result.data.services),
          locations: getLocationOptions(result.data.providersById.values()),
          categories: [...result.data.categoriesById.values()],
          providers: getProviderOptions(result.data.providersById.values()),
        });
      },
    });
    return () => resource.current?.dispose();
  }, []);

  const effectiveState = useMemo(
    () => catalog.status === "ready" ? resolveCategoryState(state, catalog.categories) : state,
    [catalog, state],
  );

  useEffect(() => {
    if (catalog.status !== "ready") return;
    // Read the latest URL so a pending repair cannot overwrite a newer navigation.
    const params = new URLSearchParams(window.location.search);
    const resolved = resolveCategoryState(parseExplorerState(params), catalog.categories);
    if (params.get("category") !== resolved.categoryId || params.get("subcategory") !== resolved.subcategoryId) {
      update({ categoryId: resolved.categoryId, subcategoryId: resolved.subcategoryId }, "replace");
    }
  }, [catalog, state, update]);

  const groups = useMemo(
    () => catalog.status === "ready" ? sortProviderGroups(getProviderGroups(catalog.entries, effectiveState), effectiveState) : [],
    [catalog, effectiveState],
  );
  const serviceCount = groups.reduce((count, group) => count + group.services.length, 0);
  const page = paginateProviderGroups(groups, effectiveState.page);

  useEffect(() => {
    if (catalog.status !== "ready") return;
    const params = new URLSearchParams(window.location.search);
    const latest = parseExplorerState(params);
    // A clamp from an older render must not overwrite newer filter navigation.
    if (serializeExplorerState(latest).toString() !== serializeExplorerState(effectiveState).toString()) return;
    const rawPage = params.get("page");
    if (latest.page !== page.page || (rawPage !== null && rawPage !== String(page.page))) {
      update({ page: page.page }, "replace");
    }
  }, [catalog.status, effectiveState, page.page, update]);

  function changePage(nextPage: number) {
    update({ page: nextPage });
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }

  function clearFilters() {
    resetCatalogSearch();
    update(clearFiltersPatch());
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "nearest" });
  }

  const resultCount = `${serviceCount.toLocaleString("en-US")} ${serviceCount === 1 ? "service" : "services"} across ${groups.length} ${groups.length === 1 ? "provider" : "providers"}`;
  const loadingMessage = catalog.status === "loading" && catalog.slow
    ? "Still loading services… This is taking longer than usual." : "Loading services…";
  const announcement = catalog.status === "loading" ? loadingMessage : catalog.status === "ready"
    ? `${resultCount}.${groups.length ? ` Showing providers ${page.start}–${page.end}. Page ${page.page} of ${page.pageCount}.` : " No services match these filters."}` : "";

  return (
    <section className="explorer" aria-label="Services by provider">
      <ExplorerSidebar state={effectiveState} update={update}
        entries={catalog.status === "ready" ? catalog.entries : []}
        locations={catalog.status === "ready" ? catalog.locations : []}
        categories={catalog.status === "ready" ? catalog.categories : []}
        providers={catalog.status === "ready" ? catalog.providers : []}
        ready={catalog.status === "ready"} />
      <section className="explorer-results" aria-labelledby="explorer-results">
        <LiveStatus message={announcement} />
        <div className="results-heading">
          <h2 id="explorer-results" ref={resultsHeading} tabIndex={-1}>Explore providers</h2>
          <p className="results-count">
            {catalog.status === "loading" ? loadingMessage : catalog.status === "offline" ? "Waiting for a connection"
              : catalog.status === "error" ? "Services could not be loaded" : resultCount}
          </p>
        </div>
        <AppliedFilters state={effectiveState} update={update} clear={clearFilters} resultsHeading={resultsHeading}
          labels={{ categories: catalog.status === "ready" ? catalog.categories : [],
            providers: catalog.status === "ready" ? catalog.providers : [],
            locations: catalog.status === "ready" ? catalog.locations : [], ready: catalog.status === "ready" }} />
        <ResultSort state={effectiveState} update={update} ready={catalog.status === "ready"} />
        {catalog.status === "ready" && catalog.offline && (
          <p className="connection-notice" role="status">You’re offline. You can still search and filter the services already loaded.</p>
        )}
        {catalog.status === "loading" && (
          <div className="provider-grid" aria-hidden="true" aria-busy="true">
            {[0, 1, 2, 3].map((id) => <div className="provider-skeleton" key={id}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              {[0, 1, 2].map((row) => <div className="skeleton-service" key={row}>
                <div className="skeleton-line" /><div className="skeleton-line skeleton-short" />
              </div>)}
            </div>)}
          </div>
        )}
        {(catalog.status === "error" || catalog.status === "offline") && (
          <div className="results-message">
            <div role="alert">
              <h3>{catalog.status === "offline" ? "You’re offline." : catalog.message}</h3>
              <p>{catalog.status === "offline"
                ? "Reconnect to load services. We’ll try again automatically when you’re back online."
                : "Please check your connection and try again. We need all service, provider and category data to show accurate results."}</p>
              <p>Your filters are kept while you reconnect or retry.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => {
              resource.current?.retry();
              resultsHeading.current?.focus({ preventScroll: true });
            }}>Try again</button>
          </div>
        )}
        {catalog.status === "ready" && (groups.length ? (
          <>
            <ProviderPagination result={page} onPage={changePage} position="top" />
            <ProviderResults key={serializeExplorerState(effectiveState).toString()} groups={page.groups}
              separateCurrencies={effectiveState.currency === null &&
                (effectiveState.sort === "price-asc" || effectiveState.sort === "price-desc")} />
            <ProviderPagination result={page} onPage={changePage} position="bottom" />
          </>
        ) : (
          <div className="results-message">
            <h3>No services match these filters.</h3>
            <p>Try a broader search to explore more care options.</p>
            <button type="button" className="primary-button" onClick={clearFilters}>Clear filters</button>
          </div>
        ))}
      </section>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { resolveCategoryState } from "@/lib/catalog/category-state";
import type { Category } from "@/lib/catalog/types";
import { getLocationOptions, getProviderOptions } from "@/lib/catalog/filter-options";
import type { LocationCountry, ProviderOption } from "@/lib/catalog/filter-options";
import { loadCatalog } from "@/lib/catalog/load";
import { getProviderGroups, prepareServices } from "@/lib/catalog/results";
import type { PricedService } from "@/lib/catalog/results";
import { parseExplorerState, serializeExplorerState } from "@/lib/explorer-state";
import { useExplorerState } from "./explorer-state-provider";
import { ExplorerSidebar } from "./explorer-sidebar";
import { ProviderCard } from "./provider-card";

type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: PricedService[]; locations: LocationCountry[]; categories: Category[]; providers: ProviderOption[] };

export function ServiceExplorer() {
  const { state, update } = useExplorerState();
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalog({
            status: "ready",
            entries: prepareServices(data.services),
            locations: getLocationOptions(data.providersById.values()),
            categories: [...data.categoriesById.values()],
            providers: getProviderOptions(data.providersById.values()),
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

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
    () => catalog.status === "ready" ? getProviderGroups(catalog.entries, effectiveState) : [],
    [catalog, effectiveState],
  );
  const serviceCount = groups.reduce((count, group) => count + group.services.length, 0);

  return (
    <section className="explorer" aria-label="Services by provider" aria-busy={catalog.status === "loading"}>
      <ExplorerSidebar state={effectiveState} update={update}
        entries={catalog.status === "ready" ? catalog.entries : []}
        locations={catalog.status === "ready" ? catalog.locations : []}
        categories={catalog.status === "ready" ? catalog.categories : []}
        providers={catalog.status === "ready" ? catalog.providers : []}
        ready={catalog.status === "ready"} />
      <div className="explorer-results">
        <div className="results-heading">
          <h2>Explore providers</h2>
          <p className="results-count" role="status">
            {catalog.status === "loading" ? "Loading services…" : catalog.status === "error"
              ? "Services could not be loaded" : `${serviceCount.toLocaleString("en-US")} ${serviceCount === 1 ? "service" : "services"} across ${groups.length} ${groups.length === 1 ? "provider" : "providers"}`}
          </p>
        </div>
        {catalog.status === "loading" && (
          <div className="provider-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((id) => <div className="provider-skeleton" key={id}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              {[0, 1, 2].map((row) => <div className="skeleton-service" key={row}>
                <div className="skeleton-line" /><div className="skeleton-line skeleton-short" />
              </div>)}
            </div>)}
          </div>
        )}
        {catalog.status === "error" && (
          <div className="results-message">
            <h3>We couldn’t load the services.</h3>
            <p>Please try again in a moment.</p>
            <button type="button" className="primary-button" onClick={() => {
              setCatalog({ status: "loading" });
              setAttempt((value) => value + 1);
            }}>Try again</button>
          </div>
        )}
        {catalog.status === "ready" && (groups.length ? (
          <div className="provider-grid" key={serializeExplorerState(effectiveState).toString()}>
            {groups.map((group) => <ProviderCard key={group.provider.id} group={group} />)}
          </div>
        ) : (
          <div className="results-message">
            <h3>No services match these filters.</h3>
            <p>Try a broader search to explore more care options.</p>
            <button type="reset" form="catalog-search-form" className="primary-button"
              onClick={() => update(parseExplorerState(new URLSearchParams()))}>Clear filters</button>
          </div>
        ))}
      </div>
    </section>
  );
}

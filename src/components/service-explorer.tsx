"use client";

import { useEffect, useMemo, useState } from "react";

import { getLocationOptions } from "@/lib/catalog/filter-options";
import type { LocationCountry } from "@/lib/catalog/filter-options";
import { loadCatalog } from "@/lib/catalog/load";
import { getProviderGroups, prepareServices } from "@/lib/catalog/results";
import type { PricedService } from "@/lib/catalog/results";
import { parseExplorerState, serializeExplorerState } from "@/lib/explorer-state";
import { useExplorerState } from "./explorer-state-provider";
import { ExplorerFilters } from "./explorer-filters";
import { ProviderCard } from "./provider-card";

type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: PricedService[]; locations: LocationCountry[] };

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
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const groups = useMemo(
    () => catalog.status === "ready" ? getProviderGroups(catalog.entries, state) : [],
    [catalog, state],
  );
  const serviceCount = groups.reduce((count, group) => count + group.services.length, 0);

  return (
    <section className="explorer" aria-label="Services by provider" aria-busy={catalog.status === "loading"}>
      <ExplorerFilters state={state} update={update}
        locations={catalog.status === "ready" ? catalog.locations : []}
        ready={catalog.status === "ready"} />
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
        <div className="provider-grid" key={serializeExplorerState(state).toString()}>
          {groups.map((group) => <ProviderCard key={group.provider.id} group={group} />)}
        </div>
      ) : (
        <div className="results-message">
          <h3>No services match these filters.</h3>
          <p>Try a broader search to explore more care options.</p>
          <button type="button" className="primary-button"
            onClick={() => update(parseExplorerState(new URLSearchParams()))}>Clear filters</button>
        </div>
      ))}
    </section>
  );
}

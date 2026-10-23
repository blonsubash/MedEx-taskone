import { normalizeCatalog } from "./normalize";
import type { Catalog, RawCatalog } from "./types";

const endpoints = {
  categories: "/api/category/active",
  providers: "/api/providers",
  services: "/api/service",
} as const;

type Collection = keyof typeof endpoints;
export interface CatalogSimulation { fail?: Collection; delay?: number }

// Optional, deterministic demo controls. Retrying removes only the forced failure.
export function readCatalogSimulation(params: URLSearchParams, retry = false): CatalogSimulation {
  const fail = params.get("mockFail");
  const delay = params.get("mockDelay");
  return {
    ...(!retry && (fail === "categories" || fail === "providers" || fail === "services") ? { fail } : {}),
    ...(delay !== null && /^\d+$/.test(delay) && Number(delay) <= 5000 ? { delay: Number(delay) } : {}),
  };
}

export class CatalogLoadError extends Error {
  constructor(readonly collection: Collection, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CatalogLoadError";
  }
}

export async function loadCatalog(signal: AbortSignal, simulation: CatalogSimulation = {}): Promise<Catalog> {
  const entries = await Promise.all(
    Object.entries(endpoints).map(async ([name, endpoint]) => {
      const key = name as Collection;
      const params = new URLSearchParams();
      if (simulation.delay !== undefined) params.set("delay", String(simulation.delay));
      if (simulation.fail === key) params.set("fail", "true");
      const url = params.size ? `${endpoint}?${params}` : endpoint;
      try {
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load ${key} (${response.status})`);
        const collection: unknown = await response.json();
        if (!Array.isArray(collection)) throw new Error(`Invalid ${key} response`);
        return [key, collection] as const;
      } catch (error) {
        if (signal.aborted) throw error;
        throw new CatalogLoadError(key, error instanceof Error ? error.message : `Could not load ${key}`, error);
      }
    }),
  );

  // Provider/category joins and facet counts require all three collections.
  return normalizeCatalog(Object.fromEntries(entries) as unknown as RawCatalog);
}

import { normalizeCatalog } from "./normalize";
import type { Catalog, RawCatalog } from "./types";

const endpoints = {
  categories: "/api/category/active",
  providers: "/api/providers",
  services: "/api/service",
} as const;

export async function loadCatalog(signal: AbortSignal): Promise<Catalog> {
  const entries = await Promise.all(
    Object.entries(endpoints).map(async ([key, url]) => {
      const response = await fetch(url, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${key} (${response.status})`);
      const collection: unknown = await response.json();
      if (!Array.isArray(collection)) throw new Error(`Invalid ${key} response`);
      return [key, collection] as const;
    }),
  );

  // The mock routes enforce the raw contract; join only after all three succeed.
  return normalizeCatalog(Object.fromEntries(entries) as unknown as RawCatalog);
}

import { CatalogLoadError } from "./load";
import type { Catalog } from "./types";

export type CatalogResource =
  | { status: "loading"; slow: boolean }
  | { status: "offline" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Catalog; offline: boolean };

export const SLOW_LOAD_MS = 2000;
export const LOAD_TIMEOUT_MS = 12000;

// One mounted explorer owns this resource, its requests, timers and connection listeners.
export function createCatalogResource({ connection, isOnline, load, publish }: {
  connection: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  isOnline: () => boolean;
  load: (signal: AbortSignal, retry: boolean) => Promise<Catalog>;
  publish: (state: CatalogResource) => void;
}) {
  let disposed = false;
  let retried = false;
  let data: Catalog | undefined;
  let controller: AbortController | undefined;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(slowTimer);
    clearTimeout(timeout);
    controller?.abort();
    controller = undefined;
  }

  function start() {
    cancel();
    if (disposed) return;
    if (!isOnline()) {
      publish({ status: "offline" });
      return;
    }
    const request = new AbortController();
    controller = request;
    publish({ status: "loading", slow: false });
    slowTimer = setTimeout(() => publish({ status: "loading", slow: true }), SLOW_LOAD_MS);
    timeout = setTimeout(() => {
      cancel();
      publish({ status: "error", message: "The services are taking too long to load." });
    }, LOAD_TIMEOUT_MS);
    load(request.signal, retried).then((catalog) => {
      if (disposed || request.signal.aborted) return;
      cancel();
      data = catalog;
      publish({ status: "ready", data, offline: !isOnline() });
    }).catch((error: unknown) => {
      if (disposed || request.signal.aborted) return;
      cancel();
      publish(isOnline() ? { status: "error", message: error instanceof CatalogLoadError
        ? `We couldn’t load the ${error.collection}.` : "We couldn’t load the services." } : { status: "offline" });
    });
  }

  function connectionChanged() {
    if (data) {
      publish({ status: "ready", data, offline: !isOnline() });
    } else if (!isOnline()) {
      cancel();
      publish({ status: "offline" });
    } else {
      retried = true;
      start();
    }
  }
  connection.addEventListener("online", connectionChanged);
  connection.addEventListener("offline", connectionChanged);
  start();

  return {
    retry() { retried = true; start(); },
    dispose() {
      disposed = true;
      cancel();
      connection.removeEventListener("online", connectionChanged);
      connection.removeEventListener("offline", connectionChanged);
    },
  };
}

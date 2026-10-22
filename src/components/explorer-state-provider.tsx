"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { buildExplorerHref, parseExplorerState } from "@/lib/explorer-state";
import type { ExplorerPatch, ExplorerState } from "@/lib/explorer-state";

type HistoryMode = "push" | "replace";
interface ExplorerContextValue {
  state: ExplorerState;
  update: (patch: ExplorerPatch, mode?: HistoryMode) => void;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerStateProvider({ initialState, children }: {
  initialState: ExplorerState;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const state = useMemo(
    () => searchParams === null ? initialState : parseExplorerState(searchParams),
    [searchParams, initialState],
  );
  const value = useMemo(() => ({ state, update: updateExplorerUrl }), [state]);

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function updateExplorerUrl(patch: ExplorerPatch, mode: HistoryMode = "push"): void {
  // Read the current URL so rapid edits cannot overwrite another pending edit.
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = buildExplorerHref(window.location.href, patch);
  if (next === current) return;
  if (mode === "replace") window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
}

export function useExplorerState(): ExplorerContextValue {
  const value = useContext(ExplorerContext);
  if (value === null) throw new Error("useExplorerState requires ExplorerStateProvider");
  return value;
}

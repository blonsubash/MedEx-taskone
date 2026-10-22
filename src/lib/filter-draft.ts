import { parseExplorerState, serializeExplorerState, updateExplorerQuery } from "./explorer-state";
import type { ExplorerPatch, ExplorerState } from "./explorer-state";
import { resolveCategoryState } from "./catalog/category-state";
import type { Category } from "./catalog/types";

export function createFilterDraft(state: ExplorerState): ExplorerState {
  return parseExplorerState(serializeExplorerState(state));
}

export function updateFilterDraft(state: ExplorerState, patch: ExplorerPatch, categories: Category[]): ExplorerState {
  const next = parseExplorerState(updateExplorerQuery(serializeExplorerState(state), patch));
  return resolveCategoryState(next, categories);
}

import type { ExplorerState } from "@/lib/explorer-state";
import type { Category } from "./types";

// Catalog-aware validation follows structural URL parsing, once active categories are loaded.
export function resolveCategoryState(state: ExplorerState, categories: Category[]): ExplorerState {
  const parent = categories.find((category) => category.id === state.categoryId);
  const categoryId = parent && (state.types.length === 0 || state.types.includes(parent.type))
    ? parent.id : null;
  const subcategoryId = categoryId !== null && parent?.children.some((child) =>
    child.id === state.subcategoryId && child.parentId === categoryId && child.type === parent.type)
    ? state.subcategoryId : null;

  return categoryId === state.categoryId && subcategoryId === state.subcategoryId
    ? state : { ...state, categoryId, subcategoryId };
}

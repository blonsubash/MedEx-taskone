import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { CatalogSearch } from "./catalog-search";

describe("CatalogSearch", () => {
  it("renders the normalized URL query before hydration with a proper search label", () => {
    const state = parseExplorerState(new URLSearchParams("q=++HBA1C++++TEST++"));
    const html = renderToStaticMarkup(<CatalogSearch query={state.query} update={vi.fn()} />);
    expect(html).toContain('role="search"');
    expect(html).toContain('for="catalog-query"');
    expect(html).toContain('value="HBA1C TEST"');
    expect(html).toContain('aria-describedby="catalog-search-help"');
  });

  it("offers explicit Search and Clear actions while leaving focus with the user", () => {
    const html = renderToStaticMarkup(<CatalogSearch query="" update={vi.fn()} />);
    expect(html).toContain('type="submit">Search');
    expect(html).toContain('aria-label="Clear catalog search"');
    expect(html).not.toContain("autofocus");
  });
});

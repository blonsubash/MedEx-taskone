import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import type { ProviderPage } from "@/lib/catalog/sorting";
import { ProviderPagination, ResultSort } from "./result-controls";

const result: ProviderPage = { groups: [], page: 1, pageCount: 3, totalProviders: 14, start: 1, end: 6 };
const sort = (query = "", ready = true) => renderToStaticMarkup(<ResultSort state={parseExplorerState(new URLSearchParams(query))} update={vi.fn()} ready={ready} />);
const pagination = (page = result) => renderToStaticMarkup(<ProviderPagination result={page} onPage={vi.fn()} position="top" />);

describe("result sorting controls", () => {
  it("restores URL sorting and explains currency separation for price order", () => {
    const html = sort("sort=price-desc");
    expect(html).toContain('value="price-desc" selected=""');
    expect(html).toContain("Most expensive matching service per provider.");
    expect(html).toContain("Sorted separately within THB, NPR, and INR; no currency conversion.");
    expect(html).toContain('for="result-sort"');
  });

  it("explains relevance, rating, and currency-specific price ordering", () => {
    expect(sort()).toContain("Providers are listed alphabetically until you search.");
    expect(sort("q=heart")).toContain("Title matches first, then provider and category matches.");
    expect(sort("sort=rating")).toContain("unrated providers last.");
    expect(sort("sort=price-asc&currency=THB")).toContain("Cheapest matching service per provider.");
    expect(sort("sort=price-asc&currency=THB")).not.toContain("Sorted separately");
  });

  it("disables sorting until results can load", () => {
    expect(sort("sort=rating", false)).toMatch(/<select[^>]*disabled=""/);
  });
});

describe("provider page controls", () => {
  it("labels the result range and disables Previous on page one", () => {
    const html = pagination();
    expect(html).toContain("Showing providers 1–6 of 14");
    expect(html).toContain('aria-label="Provider pagination top"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
    expect(html).toContain('value="1" selected="">Page 1 of 3');
  });

  it("disables Next on the last page and keeps Previous available", () => {
    const html = pagination({ ...result, page: 3, start: 13, end: 14 });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  });

  it("omits unnecessary navigation for a single page or empty results", () => {
    const html = pagination({ ...result, pageCount: 1, totalProviders: 4, end: 4 });
    expect(html).toContain("Showing providers 1–4 of 4");
    expect(html).not.toContain("<nav");
    expect(pagination({ ...result, totalProviders: 0 })).toBe("");
  });

  it("uses unique select IDs for top and bottom pagination", () => {
    const html = renderToStaticMarkup(<>
      <ProviderPagination result={result} onPage={vi.fn()} position="top" />
      <ProviderPagination result={result} onPage={vi.fn()} position="bottom" />
    </>);
    const ids = [...html.matchAll(/<select id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
  });
});

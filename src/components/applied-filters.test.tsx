import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { AppliedFilters } from "./applied-filters";

function render(query: string) {
  return renderToStaticMarkup(<AppliedFilters state={parseExplorerState(new URLSearchParams(query))}
    labels={{ categories: [], locations: [], providers: [], ready: false }} update={vi.fn()} clear={vi.fn()}
    resultsHeading={{ current: null }} />);
}

describe("AppliedFilters", () => {
  it("renders labelled removal buttons and a clear-all action", () => {
    const html = render("q=heart&type=lab_test&currency=THB&max=5000&home=true");
    expect(html).toContain('aria-labelledby="applied-filters-title"');
    expect(html).toContain('aria-label="Applied filter choices"');
    expect(html).toContain('aria-label="Remove Search: heart"');
    expect(html).toContain('aria-label="Remove Type: Lab test"');
    expect(html).toContain('aria-label="Remove Maximum: THB 5,000"');
    expect(html).toContain('aria-label="Remove Home test available"');
    expect(html).toContain("Clear all filters");
  });

  it("does not add an empty summary or treat sorting/paging as filters", () => {
    expect(render("sort=rating&page=4")).toBe("");
  });

  it("escapes search content in visible text and accessible labels", () => {
    const html = render(`q=${encodeURIComponent('<script>alert("x")</script>')}`);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

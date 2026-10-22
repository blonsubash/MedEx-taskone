import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getFacetCounts } from "@/lib/catalog/facets";
import { prepareServices } from "@/lib/catalog/results";
import { normalizeCatalog } from "@/lib/catalog/normalize";
import fixture from "../../data/task1-service-explorer.json";
import { parseExplorerState } from "@/lib/explorer-state";
import { PriceFilter } from "./price-filter";

const entries = prepareServices(normalizeCatalog(fixture).services);
function render(query = "", ready = true, immediate = false) {
  const state = parseExplorerState(new URLSearchParams(query));
  return renderToStaticMarkup(<PriceFilter state={state} update={vi.fn()} ready={ready}
    facets={ready ? getFacetCounts(entries, state) : null} immediate={immediate} />);
}

describe("PriceFilter", () => {
  it("requires an explicit currency before enabling range entry", () => {
    const html = render();
    expect(html).toContain('value="" selected=""');
    expect(html).toMatch(/<input(?=[^>]*id="minimum-price")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*id="maximum-price")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toContain("Amounts are not converted.");
  });

  it("restores exact URL bounds, including zero, with labelled decimal fields", () => {
    const html = render("currency=THB&min=0&max=5000.005");
    expect(html).toContain('value="THB" selected=""');
    expect(html).toMatch(/<input(?=[^>]*id="minimum-price")(?=[^>]*value="0")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*id="maximum-price")(?=[^>]*value="5000.005")[^>]*>/);
    expect(html).toContain('for="minimum-price"');
    expect(html).toContain('for="maximum-price"');
    expect(html.match(/inputMode="decimal"/g)).toHaveLength(2);
    expect(html).not.toContain('disabled=""');
  });

  it("explains scope, final-price matching, and wellness duration behavior", () => {
    const html = render("currency=NPR");
    expect(html).toContain("NPR prices only. Changing currency clears the range.");
    expect(html).toContain("Bounds are inclusive.");
    expect(html).toContain("Reversed bounds are swapped.");
    expect(html).toContain("Optional home collection is extra.");
    expect(html).toContain("Unavailable prices are excluded only when a range is set.");
    expect(html).toContain("lowest matching price and duration");
  });

  it("disables the complete price section during loading while preserving selections", () => {
    const html = render("currency=INR&max=900", false);
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain('value="INR" selected=""');
    expect(html).toContain('value="900"');
  });
  it("uses live mobile previews with one final drawer Apply action", () => {
    const mobile = render("currency=THB&max=5000", true, true);
    expect(mobile).toContain("Preview updates as you type.");
    expect(mobile).not.toContain(">Apply range</button>");
    expect(mobile).toContain("Clear range");
    expect(render("currency=THB")).toContain(">Apply range</button>");
  });
});

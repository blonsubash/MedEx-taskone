import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { PriceFilter } from "./price-filter";

const render = (query = "", ready = true) => renderToStaticMarkup(
  <PriceFilter state={parseExplorerState(new URLSearchParams(query))} update={vi.fn()} ready={ready} />,
);

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
});

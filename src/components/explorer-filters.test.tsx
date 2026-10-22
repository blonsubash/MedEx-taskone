import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { ExplorerFilters } from "./explorer-filters";

const locations = [{ id: 1, name: "Thailand", cities: [{ id: "bangkok", name: "Bangkok" }] }];
function render(query = "", ready = true) {
  return renderToStaticMarkup(<ExplorerFilters state={parseExplorerState(new URLSearchParams(query))}
    update={vi.fn()} locations={ready ? locations : []} ready={ready} />);
}

describe("ExplorerFilters", () => {
  it("renders the URL's selected types, city and availability on the first render", () => {
    const html = render("type=package&type=lab_test&city=bangkok&home=true");
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html).toMatch(/<input(?=[^>]*value="package")(?=[^>]*checked="")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*value="lab_test")(?=[^>]*checked="")[^>]*>/);
    expect(html).toContain('value="city:bangkok" selected=""');
    expect(html).toContain('for="location-filter"');
    expect(html).toContain("Country or city");
  });

  it("restores a country selection and leaves all checkboxes clear by default", () => {
    expect(render("country=1")).toContain('value="country:1" selected=""');
    const html = render();
    expect(html).not.toContain('checked=""');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain("Leave unchecked to include all types.");
  });

  it("keeps an unknown URL location visible and removable rather than displaying All locations", () => {
    const html = render("city=removed-city");
    expect(html).toContain('value="city:removed-city" selected=""');
    expect(html).toContain("Unavailable location");
    expect(html).toContain('value="">All locations');
  });

  it("disables controls until the catalog is ready without losing URL selections", () => {
    const html = render("type=wellness&city=bangkok&home=true", false);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('value="city:bangkok" selected=""');
    expect(html).toContain("Selected location");
    expect(html).not.toContain("Unavailable location");
  });
});

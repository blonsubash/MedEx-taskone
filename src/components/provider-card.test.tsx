import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { normalizeCatalog } from "@/lib/catalog/normalize";
import { getProviderGroups, prepareServices } from "@/lib/catalog/results";
import { parseExplorerState } from "@/lib/explorer-state";
import { ProviderCard } from "./provider-card";

const catalog = normalizeCatalog(fixture);
const entries = prepareServices(catalog.services);
const render = (query: string) => renderToStaticMarkup(<ProviderCard group={
  getProviderGroups(entries, parseExplorerState(new URLSearchParams(query)))[0]
} />);

describe("ProviderCard", () => {
  it("renders only three services with the full matching count and an accessible reveal control", () => {
    const html = render("provider=48");
    expect(html.match(/class="service-row"/g)).toHaveLength(3);
    expect(html).toContain("View all 53 services");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="provider-more-48"');
    expect(html).toContain('id="provider-more-48" hidden=""');
    expect(html).toContain("Riverside International Hospital");
  });

  it("uses the matching count and omits expansion for three or fewer services", () => {
    const html = render("provider=48&q=executive+health+check+(male)");
    expect(html.match(/class="service-row"/g)).toHaveLength(1);
    expect(html).not.toContain("View all");
    expect(html).toContain("THB 5,970.60");
    expect(html).toContain("<del");
    expect(html).toContain("THB 6,200.00");
  });

  it("labels the lowest wellness price and its duration with an unrated provider", () => {
    const html = render("provider=61&q=signature+facial");
    expect(html).toContain("No ratings yet");
    expect(html).toContain("From ");
    expect(html).toContain("THB 1,800.00");
    expect(html).toContain("60-minute option");
    expect(html).not.toContain("THB 2,040.00");
  });

  it("displays the qualifying wellness option after a range is applied", () => {
    const html = render("provider=61&q=signature+facial&currency=THB&min=2000");
    expect(html).toContain("THB 2,040.00");
    expect(html).toContain("90-minute option");
    expect(html).toContain("THB 2,400.00");
  });

  it("labels a genuine zero price as free, including a capped discount", () => {
    for (const query of ["free+dental+consultation", "vitamin+d+test"]) {
      const html = render(`q=${query}`);
      expect(html).toContain("Free · ");
      expect(html).toContain("0.00");
      if (query === "vitamin+d+test") expect(html).toContain("<del");
      else expect(html).not.toContain("<del");
    }
  });

  it("distinguishes unavailable prices from free services and treats a zero rating as rated", () => {
    const service = { ...catalog.services[0], price: null,
      provider: { ...catalog.services[0].provider, rating: 0, reviewCount: 1 } };
    const group = getProviderGroups(prepareServices([service]), parseExplorerState(new URLSearchParams()))[0];
    const html = renderToStaticMarkup(<ProviderCard group={group} />);
    expect(html).toContain("Price unavailable");
    expect(html).not.toContain("Free · ");
    expect(html).toContain("0.0 out of 5");
    expect(html).toContain("1 review");
    expect(html).not.toContain("No ratings yet");
  });

  it("keeps optional home collection separate from the final service price", () => {
    const html = render("provider=46&q=basic+blood+panel");
    expect(html).toContain("Home test available");
    expect(html).toContain("Optional home collection: NPR 331.00");
    expect(html).toContain("NPR 3,000.00");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { ProviderFilter } from "./provider-filter";

const providers = [
  { id: 46, name: "Himal Neo Clinic", location: "Kathmandu, Nepal" },
  { id: 48, name: "Riverside International Hospital", location: "Bangkok, Thailand" },
];
function render(query = "", ready = true) {
  return renderToStaticMarkup(<ProviderFilter providers={ready ? providers : []}
    selectedIds={parseExplorerState(new URLSearchParams(query)).providerIds} ready={ready} update={vi.fn()} />);
}

describe("ProviderFilter", () => {
  it("restores repeated provider IDs as checked options and renders each only once", () => {
    const html = render("provider=48&provider=46");
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/Himal Neo Clinic/g)).toHaveLength(1);
    expect(html.match(/Riverside International Hospital/g)).toHaveLength(1);
    expect(html).toContain("2 selected");
    expect(html).toContain("Selected providers");
  });

  it("offers a separately labelled provider search and a clear-selection action", () => {
    const html = render();
    expect(html).toContain("Search providers");
    expect(html).toContain('for="provider-query"');
    expect(html).toContain("This search only narrows the provider list.");
    expect(html).toContain("All providers");
    expect(html).toContain("Clear provider selection");
  });

  it("keeps unavailable IDs visible and selected so they can be removed", () => {
    const html = render("provider=999");
    expect(html).toContain("Unavailable provider #999");
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain("1 selected");
  });

  it("preserves selected IDs while loading and disables selection until ready", () => {
    const html = render("provider=48", false);
    expect(html).toContain("Selected provider #48");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Loading providers…");
  });
});

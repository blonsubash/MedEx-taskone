import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { ExplorerSidebar } from "./explorer-sidebar";

describe("ExplorerSidebar server render", () => {
  it("renders one labelled set of controls without duplicate input IDs", () => {
    const html = renderToStaticMarkup(<ExplorerSidebar state={parseExplorerState(new URLSearchParams("q=heart&provider=48"))}
      update={vi.fn()} entries={[]} locations={[]} categories={[]} providers={[]} ready={false} />);
    expect(html).toContain('aria-label="Search and filters"');
    expect(html.match(/id="catalog-query"/g)).toHaveLength(1);
    expect(html.match(/id="category-filter"/g)).toHaveLength(1);
    expect(html).toContain('value="heart"');
    expect(html).not.toContain("<dialog");
  });

  it("includes an accessible mobile trigger while the closed drawer is unmounted", () => {
    const html = renderToStaticMarkup(<ExplorerSidebar state={parseExplorerState(new URLSearchParams())}
      update={vi.fn()} entries={[]} locations={[]} categories={[]} providers={[]} ready />);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('id="mobile-filters"');
  });
});

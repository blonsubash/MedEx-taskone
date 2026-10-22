import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseExplorerState } from "@/lib/explorer-state";
import { ExplorerStateProvider, updateExplorerUrl, useExplorerState } from "./explorer-state-provider";

const router = vi.hoisted(() => ({ params: null as URLSearchParams | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => router.params }));

let url: URL;
function setUrl(href: string) {
  url = new URL(href, "http://localhost");
  router.params = url.searchParams;
}
const pushState = vi.fn((_data: unknown, _title: string, href: string) => setUrl(href));
const replaceState = vi.fn((_data: unknown, _title: string, href: string) => setUrl(href));

function Probe() {
  const { state } = useExplorerState();
  return <span>{state.query}|{state.page}|{state.maxPrice ?? "none"}</span>;
}
function render(initialState = parseExplorerState(new URLSearchParams())) {
  return renderToStaticMarkup(
    <ExplorerStateProvider initialState={initialState}><Probe /></ExplorerStateProvider>,
  );
}

beforeEach(() => {
  pushState.mockClear();
  replaceState.mockClear();
  setUrl("http://localhost/?q=initial&page=4#results");
  vi.stubGlobal("window", {
    get location() { return url; },
    history: { pushState, replaceState },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ExplorerStateProvider", () => {
  it("renders the server-provided state without waiting for an effect", () => {
    router.params = null;
    const initial = parseExplorerState(new URLSearchParams("q=shared&currency=THB&max=5000&page=2"));
    expect(render(initial)).toBe("<span>shared|2|5000</span>");
  });

  it("uses the current URL over a stale initial prop", () => {
    const initial = parseExplorerState(new URLSearchParams("q=stale"));
    expect(render(initial)).toBe("<span>initial|4|none</span>");
  });

  it("merges rapid updates against the latest URL rather than captured state", () => {
    render();
    const update = updateExplorerUrl;
    update({ types: ["package"] });
    update({ providerIds: [48] });
    expect(parseExplorerState(url.searchParams))
      .toMatchObject({ query: "initial", types: ["package"], providerIds: [48], page: 1 });
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(url.hash).toBe("#results");
  });

  it("skips no-op navigation and supports replacing an entry", () => {
    render();
    updateExplorerUrl({ query: "initial" });
    expect(pushState).not.toHaveBeenCalled();
    updateExplorerUrl({ query: "changed" }, "replace");
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(url.searchParams.get("q")).toBe("changed");
  });

  it("follows router snapshots for back and forward URL states", () => {
    render();
    const first = url.href;
    updateExplorerUrl({ query: "second" });
    const second = url.href;
    expect(render()).toBe("<span>second|1|none</span>");
    setUrl(first);
    expect(render()).toBe("<span>initial|4|none</span>");
    setUrl(second);
    expect(render()).toBe("<span>second|1|none</span>");
  });

  it("requires consumers to be inside the provider", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow("requires ExplorerStateProvider");
  });
});

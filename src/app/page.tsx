import { ExplorerStateProvider } from "@/components/explorer-state-provider";
import { parseExplorerState, toSearchParams } from "@/lib/explorer-state";
import type { PageSearchParams } from "@/lib/explorer-state";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const initialState = parseExplorerState(toSearchParams(await searchParams));
  return (
    <ExplorerStateProvider initialState={initialState}>
      <header className="site-header">
        <span className="brand">MedEx</span>
        <span className="site-label">Service Explorer</span>
      </header>
      <main className="page-content">
        <p className="eyebrow">Healthcare, with a little more clarity</p>
        <h1>Find care that fits your needs.</h1>
        <p className="intro">
          Explore health packages, lab tests, and wellness services from
          healthcare providers.
        </p>
        <p className="placeholder">Service browsing is coming next.</p>
      </main>
    </ExplorerStateProvider>
  );
}

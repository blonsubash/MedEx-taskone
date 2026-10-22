"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";

import type { LocationCountry, ProviderOption } from "@/lib/catalog/filter-options";
import type { Category } from "@/lib/catalog/types";
import { resolveCategoryState } from "@/lib/catalog/category-state";
import { getFacetCounts } from "@/lib/catalog/facets";
import type { FacetCounts } from "@/lib/catalog/facets";
import type { PricedService } from "@/lib/catalog/results";
import { serializeExplorerState } from "@/lib/explorer-state";
import type { ExplorerPatch, ExplorerState } from "@/lib/explorer-state";
import { createFilterDraft, updateFilterDraft } from "@/lib/filter-draft";
import { CatalogSearch } from "./catalog-search";
import { ExplorerFilters } from "./explorer-filters";

const MOBILE_QUERY = "(max-width: 760px)";
function subscribeToViewport(notify: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const mobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const serverSnapshot = () => false;

interface SidebarProps {
  state: ExplorerState;
  update: (patch: ExplorerPatch) => void;
  entries: PricedService[];
  locations: LocationCountry[];
  categories: Category[];
  providers: ProviderOption[];
  ready: boolean;
}

type FilterControlProps = SidebarProps & { facets: FacetCounts | null };

function FilterControls({ state, update, locations, categories, providers, ready, facets, draft = false }: FilterControlProps & { draft?: boolean }) {
  return <>
    <CatalogSearch query={state.query} update={update} immediate={draft} />
    <ExplorerFilters state={state} update={update} locations={locations}
      categories={categories} providers={providers} ready={ready} facets={facets} immediate={draft} />
  </>;
}

function DesktopFilters(props: FilterControlProps) {
  const sidebar = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = sidebar.current!;
    const layout = element.parentElement!;
    let frame = 0;
    const resize = () => {
      frame = 0;
      const gap = parseFloat(getComputedStyle(element).top);
      // The heading takes up viewport space until the sidebar becomes sticky.
      const top = Math.max(gap, layout.getBoundingClientRect().top);
      element.style.setProperty("--sidebar-available-height", `${Math.max(0, window.innerHeight - top - gap)}px`);
    };
    const scheduleResize = () => {
      if (!frame) frame = requestAnimationFrame(resize);
    };
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(layout);
    observer.observe(document.body);
    window.addEventListener("resize", scheduleResize);
    window.addEventListener("scroll", scheduleResize, { passive: true });
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("scroll", scheduleResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <aside ref={sidebar} className="explorer-sidebar" aria-label="Search and filters">
    <FilterControls {...props} />
  </aside>;
}

function FilterDrawer({ children, count, ready, cancel, apply, trigger, baseline, appliedKey }: {
  children: ReactNode;
  count: number;
  ready: boolean;
  cancel: () => void;
  apply: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  baseline: string;
  appliedKey: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const returnFocus = trigger.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const restoreFromHistory = () => cancel();
    window.addEventListener("popstate", restoreFromHistory);
    return () => {
      window.removeEventListener("popstate", restoreFromHistory);
      if (element.open) element.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [cancel, trigger]);

  useEffect(() => {
    if (appliedKey !== baseline) dialog.current?.close();
  }, [appliedKey, baseline]);

  return (
    <dialog ref={dialog} id="mobile-filters" className="mobile-filter-drawer" aria-labelledby="drawer-title" aria-describedby="drawer-description"
      onCancel={(event) => { event.preventDefault(); cancel(); }}
      onClose={(event) => {
        // React's development effect replay can queue a close event before reopening.
        if (!event.currentTarget.open) cancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          cancel();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, a[href], summary, [tabindex]",
        )].filter((element) => !element.matches(":disabled, [tabindex='-1'], input[type='hidden']") &&
          element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) cancel();
      }}>
      <header className="drawer-header">
        <div>
          <h2 id="drawer-title">Filters</h2>
          <p id="drawer-description" className="filter-help">Preview changes, then show services to apply.</p>
        </div>
        <button type="button" className="drawer-close" aria-label="Close filters" autoFocus onClick={cancel}>×</button>
      </header>
      <div className="drawer-body">{children}</div>
      <footer className="drawer-footer">
        <button type="button" className="secondary-button" onClick={cancel}>Cancel</button>
        <button type="button" className="primary-button" disabled={!ready} onClick={apply}>
          {ready ? `Show ${count.toLocaleString("en-US")} ${count === 1 ? "service" : "services"}` : "Loading…"}
        </button>
      </footer>
    </dialog>
  );
}

function ResponsiveFilters({ mobile, ...props }: SidebarProps & { mobile: boolean }) {
  const [draft, setDraft] = useState<ExplorerState | null>(null);
  const [baseline, setBaseline] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useCallback(() => setDraft(null), []);
  const updateDraft = useCallback((patch: ExplorerPatch) => {
    setDraft((current) => current ? updateFilterDraft(current, patch, props.categories) : current);
  }, [props.categories]);
  const effectiveDraft = useMemo(() => draft ? resolveCategoryState(draft, props.categories) : null,
    [draft, props.categories]);
  const facetState = mobile ? effectiveDraft : props.state;
  const facets = useMemo(() => props.ready && facetState ? getFacetCounts(props.entries, facetState) : null,
    [facetState, props.entries, props.ready]);
  const appliedKey = serializeExplorerState(props.state).toString();

  return <>
    {!mobile && <DesktopFilters {...props} facets={facets} />}
    <div className="mobile-filter-toolbar">
      <button ref={trigger} type="button" className="filter-trigger" aria-haspopup="dialog"
        aria-expanded={draft !== null} aria-controls={draft ? "mobile-filters" : undefined} disabled={!props.ready}
        onClick={() => { setBaseline(appliedKey); setDraft(createFilterDraft(props.state)); }}>
        <span aria-hidden="true">☰</span> Filters
      </button>
    </div>
    {mobile && effectiveDraft && <FilterDrawer count={facets?.total ?? 0} ready={props.ready} cancel={cancel}
      trigger={trigger} baseline={baseline} appliedKey={appliedKey} apply={() => {
        props.update({ ...effectiveDraft, page: 1 });
        cancel();
      }}>
      <FilterControls {...props} state={effectiveDraft} update={updateDraft} facets={facets} draft />
    </FilterDrawer>}
  </>;
}

export function ExplorerSidebar(props: SidebarProps) {
  const mobile = useSyncExternalStore(subscribeToViewport, mobileSnapshot, serverSnapshot);
  // Crossing the breakpoint discards any uncommitted mobile draft.
  return <ResponsiveFilters key={mobile ? "mobile" : "desktop"} {...props} mobile={mobile} />;
}

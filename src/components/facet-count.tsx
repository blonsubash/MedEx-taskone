export function formatFacetCount(count: number | undefined): string {
  return count === undefined ? "—" : count.toLocaleString("en-US");
}

export function FacetCount({ count }: { count: number | undefined }) {
  return <span className="facet-count">({formatFacetCount(count)})<span className="sr-only"> matching services</span></span>;
}

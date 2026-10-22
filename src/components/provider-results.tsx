import type { ProviderGroup } from "@/lib/catalog/results";
import { ProviderCard } from "./provider-card";

export function ProviderResults({ groups, separateCurrencies }: {
  groups: ProviderGroup[];
  separateCurrencies: boolean;
}) {
  if (!separateCurrencies) return <div className="provider-grid">
    {groups.map((group) => <ProviderCard key={group.provider.id} group={group} />)}
  </div>;

  const currencies = new Map<string, ProviderGroup[]>();
  for (const group of groups) {
    const currency = group.provider.currency;
    if (!currencies.has(currency)) currencies.set(currency, []);
    currencies.get(currency)!.push(group);
  }
  return <div className="currency-results">
    {[...currencies].map(([currency, providers]) => <section key={currency} aria-label={`${currency} providers`}>
      <h3 className="currency-heading">{currency} providers</h3>
      <div className="provider-grid">
        {providers.map((group) => <ProviderCard key={group.provider.id} group={group} />)}
      </div>
    </section>)}
  </div>;
}

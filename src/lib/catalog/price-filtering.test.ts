import { describe, expect, it } from "vitest";

import fixture from "../../../data/task1-service-explorer.json";
import { parseExplorerState, updateExplorerQuery } from "@/lib/explorer-state";
import { normalizeCatalog } from "./normalize";
import { filterServices, prepareServices } from "./results";
import type { Service } from "./types";

const catalog = normalizeCatalog(fixture);
const base = catalog.services[0];
function fixed(id: string, price: string | null, currency = "THB"): Service {
  return { ...base, id, type: "lab_test", price, discount: "0", discountType: "amount",
    serviceCharge: "0", serviceChargeType: "amount", provider: { ...base.provider, currency } };
}
const entries = prepareServices([
  fixed("free", "0"), fixed("below", "99.999"), fixed("exact", "100"),
  fixed("above", "100.001"), fixed("missing", null),
  fixed("nepal", "100", "NPR"), fixed("india", "100", "INR"),
]);
function matches(query: string, source = entries) {
  return filterServices(source, parseExplorerState(new URLSearchParams(query)));
}
const ids = (query: string) => matches(query).map(({ service }) => service.id);

describe("currency-aware price ranges", () => {
  it("does not compare currencies even when their numeric prices fit", () => {
    expect(ids("currency=THB&max=5000")).toEqual(["free", "below", "exact", "above"]);
    expect(ids("currency=NPR&max=5000")).toEqual(["nepal"]);
    expect(ids("currency=INR&max=5000")).toEqual(["india"]);
  });

  it("supports inclusive one-sided and exact ranges without rounding amounts", () => {
    expect(ids("currency=THB&min=100")).toEqual(["exact", "above"]);
    expect(ids("currency=THB&max=100")).toEqual(["free", "below", "exact"]);
    expect(ids("currency=THB&min=100&max=100")).toEqual(["exact"]);
    expect(ids("currency=THB&min=0&max=0")).toEqual(["free"]);
  });

  it("swaps reversed bounds and ignores invalid bounds independently", () => {
    expect(ids("currency=THB&min=100&max=99.999")).toEqual(["below", "exact"]);
    expect(ids("currency=THB&min=-1&max=100")).toEqual(["free", "below", "exact"]);
    expect(ids("currency=THB&min=100&max=NaN")).toEqual(["exact", "above"]);
    expect(ids("currency=THB&min=bad&max=bad")).toContain("missing");
  });

  it("includes unavailable prices for currency-only browsing and ignores unscoped bounds", () => {
    expect(ids("currency=THB")).toContain("missing");
    expect(ids("max=0")).toHaveLength(entries.length);
    expect(ids("currency=USD&max=0")).toHaveLength(entries.length);
  });

  it("filters by final price after discounts and charges, excluding optional collection fees", () => {
    const source = prepareServices([{ ...fixed("charged", "100"), discount: "10", discountType: "percent",
      serviceCharge: "7", serviceChargeType: "percent", testAtHome: true, homeTestCharge: "50" }]);
    expect(matches("currency=THB&min=96.3&max=96.3&home=true", source)).toHaveLength(1);
    expect(matches("currency=THB&max=96.299999", source)).toHaveLength(0);
  });

  it("matches any valid wellness option and displays the cheapest qualifying duration", () => {
    const source = prepareServices([{ ...fixed("wellness", null), type: "wellness", wellnessPricing: [
      { id: "short", durationInMinutes: 30, price: "100", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
      { id: "long", durationInMinutes: 90, price: "300", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
      { id: "middle", durationInMinutes: 60, price: "200", discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
      { id: "unknown", durationInMinutes: 120, price: null, discount: "0", discountType: "amount", serviceCharge: "0", serviceChargeType: "amount" },
    ] }]);
    const before = structuredClone(source);
    const matching = matches("currency=THB&min=150&max=300", source);
    expect(matching).toHaveLength(1);
    expect(matching[0].pricing).toMatchObject({ kind: "wellness", startingOption: {
      id: "middle", durationInMinutes: 60, price: { finalPrice: "200" },
    } });
    expect(matches("currency=THB&min=201&max=299", source)).toEqual([]);
    expect(matches("currency=THB&min=300&max=300", source)[0].pricing).toMatchObject({
      startingOption: { id: "long", price: { finalPrice: "300" } },
    });
    expect(source).toEqual(before);
  });

  it("removes old bounds on currency changes and restores them through a URL round trip", () => {
    const original = new URLSearchParams("currency=THB&min=0&max=100&page=3&note=keep");
    const changed = updateExplorerQuery(original, { currency: "NPR" });
    expect(parseExplorerState(changed)).toMatchObject({ currency: "NPR", minPrice: null, maxPrice: null, page: 1 });
    expect(changed.get("note")).toBe("keep");
    expect(matches(original.toString()).map(({ service }) => service.id)).toEqual(["free", "below", "exact"]);
    expect(matches(changed.toString()).map(({ service }) => service.id)).toEqual(["nepal"]);
  });
});

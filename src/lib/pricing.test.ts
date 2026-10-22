import { describe, expect, it } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { normalizeCatalog } from "./catalog/normalize";
import type { RawPricing, Service } from "./catalog/types";
import { calculatePrice, formatMoney, getServicePricing } from "./pricing";
import type { AvailablePrice } from "./pricing";

function pricing(overrides: Partial<RawPricing> = {}): RawPricing {
  return {
    price: "100.00",
    discount: "0.00",
    discountType: "amount",
    serviceCharge: "0.00",
    serviceChargeType: "amount",
    ...overrides,
  };
}

function available(raw: RawPricing, currency = "THB"): AvailablePrice {
  const result = calculatePrice(raw, currency);
  if (result.status !== "available") throw new Error(result.reason);
  return result;
}

const catalog = normalizeCatalog(fixture);
function serviceWithSuffix(suffix: string): Service {
  const service = catalog.services.find((entry) => entry.id.endsWith(suffix));
  if (!service) throw new Error(`Missing fixture service ${suffix}`);
  return structuredClone(service);
}

function wellness(service = serviceWithSuffix("000000000003"), optionId?: string) {
  const result = getServicePricing(service, optionId);
  if (result.kind !== "wellness") throw new Error("Expected wellness pricing");
  return result;
}

describe("calculatePrice", () => {
  it("prices the executive health check at 5,970.60 THB with charges on the discounted amount", () => {
    const service = serviceWithSuffix("000000000001");
    const result = calculatePrice(service, service.provider.currency);
    expect(result).toEqual({
      status: "available", currency: "THB", originalPrice: "6200",
      discountAmount: "620", afterDiscount: "5580", chargeAmount: "390.6",
      finalPrice: "5970.6", hasDiscount: true, discountCapped: false, isFree: false,
    });
    expect(formatMoney("5970.6", "THB")).toBe("THB 5,970.60");
  });

  it.each([
    { discount: "20", discountType: "amount", serviceCharge: "5", serviceChargeType: "amount", expected: "85" },
    { discount: "10", discountType: "percent", serviceCharge: "5", serviceChargeType: "amount", expected: "95" },
    { discount: "10", discountType: "amount", serviceCharge: "10", serviceChargeType: "percent", expected: "99" },
    { discount: "10", discountType: "percent", serviceCharge: "10", serviceChargeType: "percent", expected: "99" },
    { discount: "0", discountType: "amount", serviceCharge: "7", serviceChargeType: "percent", expected: "107" },
  ])("calculates $discountType discounts and $serviceChargeType charges to $expected", (row) => {
    expect(available(pricing(row)).finalPrice).toBe(row.expected);
  });

  it("caps the fixture's excessive amount discount without changing the input", () => {
    const service = serviceWithSuffix("000000000005");
    const before = structuredClone(service);
    expect(available(service)).toMatchObject({
      originalPrice: "450", discountAmount: "450", afterDiscount: "0",
      finalPrice: "0", discountCapped: true, hasDiscount: true, isFree: true,
    });
    expect(service).toEqual(before);
    expect(service.discount).toBe("600.00");
  });

  it("caps excessive percentages before applying a fixed service charge", () => {
    expect(available(pricing({
      discount: "150", discountType: "percent", serviceCharge: "10",
    }))).toMatchObject({ discountAmount: "100", afterDiscount: "0", finalPrice: "10", discountCapped: true, isFree: false });
  });

  it("keeps a genuine zero price available and distinct from a missing price", () => {
    const free = serviceWithSuffix("000000000006");
    expect(available(free)).toMatchObject({ finalPrice: "0", hasDiscount: false, isFree: true });
    expect(calculatePrice(pricing({ price: null }), "THB"))
      .toEqual({ status: "unavailable", reason: "missing-price" });
  });

  it("does not round fractional cents between discount and charge calculations", () => {
    const result = available(pricing({
      price: "0.01", discount: "50", discountType: "percent",
      serviceCharge: "100", serviceChargeType: "percent",
    }));
    expect(result.afterDiscount).toBe("0.005");
    expect(result.chargeAmount).toBe("0.005");
    expect(result.finalPrice).toBe("0.01");
  });

  it("retains every decimal place until display rounding", () => {
    const result = available(pricing({
      price: "19.99", discount: "12.5", discountType: "percent",
      serviceCharge: "7", serviceChargeType: "percent",
    }));
    expect(result.afterDiscount).toBe("17.49125");
    expect(result.chargeAmount).toBe("1.2243875");
    expect(result.finalPrice).toBe("18.7156375");
    expect(formatMoney(result.finalPrice, result.currency)).toBe("THB 18.72");
  });

  it("handles amounts smaller than the library's default division precision exactly", () => {
    const result = available(pricing({
      price: `0.${"0".repeat(24)}1`, discount: "50", discountType: "percent",
    }));
    expect(result.finalPrice).toBe(`0.${"0".repeat(25)}5`);
    expect(result.isFree).toBe(false);
    expect(formatMoney(result.finalPrice, result.currency)).toBe("THB 0.00");
  });

  it("does not lose precision above JavaScript's safe integer range", () => {
    const result = available(pricing({ price: "9007199254740993.25", serviceCharge: "0.01" }));
    expect(result.finalPrice).toBe("9007199254740993.26");
    expect(formatMoney(result.finalPrice, result.currency)).toBe("THB 9,007,199,254,740,993.26");
  });

  it("adds decimal amounts without binary floating-point residue", () => {
    expect(available(pricing({ price: "0.1", serviceCharge: "0.2" })).finalPrice).toBe("0.3");
  });

  it.each(["", "abc", "NaN", "Infinity", "-1", "1e3", "1,000.00", "0x10", "10."])(
    "marks malformed base price %j unavailable",
    (price) => expect(calculatePrice(pricing({ price }), "THB"))
      .toEqual({ status: "unavailable", reason: "invalid-price" }),
  );

  it.each([
    { raw: { discount: null }, reason: "invalid-discount" },
    { raw: { discount: "-1" }, reason: "invalid-discount" },
    { raw: { discount: "10abc" }, reason: "invalid-discount" },
    { raw: { discountType: null }, reason: "invalid-discount" },
    { raw: { discountType: "coupon" }, reason: "invalid-discount" },
    { raw: { serviceCharge: null }, reason: "invalid-charge" },
    { raw: { serviceCharge: "-1" }, reason: "invalid-charge" },
    { raw: { serviceCharge: "NaN" }, reason: "invalid-charge" },
    { raw: { serviceChargeType: null }, reason: "invalid-charge" },
    { raw: { serviceChargeType: "unknown" }, reason: "invalid-charge" },
  ])("rejects incomplete or invalid modifier $raw", ({ raw, reason }) => {
    expect(calculatePrice(pricing(raw), "THB")).toEqual({ status: "unavailable", reason });
  });

  it.each(["USD", "", "thb"])("does not guess or convert currency %j", (currency) => {
    expect(calculatePrice(pricing(), currency))
      .toEqual({ status: "unavailable", reason: "unsupported-currency" });
  });

  it("uses the provider currency and leaves optional home collection fees separate", () => {
    const service = serviceWithSuffix("000000000002");
    expect(service.homeTestCharge).toBe("331.00");
    const result = getServicePricing(service);
    expect(result).toMatchObject({ kind: "fixed", price: { currency: "NPR", finalPrice: "3000" } });
  });
});

describe("wellness pricing", () => {
  it("offers a labelled starting option without assuming the customer selected it", () => {
    const result = wellness();
    expect(result.startingOption).toMatchObject({ durationInMinutes: 60, price: { finalPrice: "1800", currency: "THB" } });
    expect(result.selectedOption).toBeNull();
  });

  it("calculates the chosen duration with the same discount formula", () => {
    const service = serviceWithSuffix("000000000003");
    const result = wellness(service, service.wellnessPricing[1].id);
    expect(result.selectedOption).toMatchObject({ durationInMinutes: 90, price: { originalPrice: "2400", finalPrice: "2040", hasDiscount: true } });
  });

  it("chooses the starting option by final price, including charges", () => {
    const service = serviceWithSuffix("000000000003");
    service.wellnessPricing[0] = {
      ...service.wellnessPricing[0], ...pricing({ serviceCharge: "100", serviceChargeType: "percent" }),
    };
    service.wellnessPricing[1] = { ...service.wellnessPricing[1], ...pricing({ price: "150" }) };
    expect(wellness(service).startingOption?.durationInMinutes).toBe(90);
  });

  it("keeps an invalid option unavailable and does not select it silently", () => {
    const service = serviceWithSuffix("000000000003");
    service.wellnessPricing[0].price = null;
    const result = wellness(service, service.wellnessPricing[0].id);
    expect(result.options[0].price).toEqual({ status: "unavailable", reason: "missing-price" });
    expect(result.startingOption?.durationInMinutes).toBe(90);
    expect(result.selectedOption).toBeNull();
  });

  it.each([0, -30, 1.5, NaN])("rejects an invalid duration %j", (duration) => {
    const service = serviceWithSuffix("000000000003");
    service.wellnessPricing[0].durationInMinutes = duration;
    expect(wellness(service).options[0].price).toEqual({ status: "unavailable", reason: "invalid-duration" });
  });

  it("does not invent a price when all options are invalid", () => {
    const service = serviceWithSuffix("000000000003");
    service.wellnessPricing.forEach((option) => { option.price = null; });
    expect(wellness(service)).toMatchObject({ startingOption: null, selectedOption: null });
  });

  it("does not fall back to a top-level price when options are missing", () => {
    const service = serviceWithSuffix("000000000003");
    service.price = "1.00";
    service.wellnessPricing = [];
    expect(wellness(service)).toEqual({ kind: "wellness", options: [], startingOption: null, selectedOption: null });
  });

  it("does not replace an unknown selection with the starting option", () => {
    expect(wellness(undefined, "missing").selectedOption).toBeNull();
  });

  it("keeps a free duration eligible as the starting and selected option", () => {
    const service = serviceWithSuffix("000000000003");
    service.wellnessPricing[1].price = "0.00";
    const result = wellness(service, service.wellnessPricing[1].id);
    expect(result.startingOption?.price).toMatchObject({ finalPrice: "0", isFree: true });
    expect(result.selectedOption?.id).toBe(service.wellnessPricing[1].id);
  });

  it("leaves the input unchanged and returns JSON-serializable values", () => {
    const service = serviceWithSuffix("000000000003");
    const before = structuredClone(service);
    const result = wellness(service);
    expect(service).toEqual(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("formatMoney", () => {
  it.each([
    { amount: "5970.6", currency: "THB", expected: "THB 5,970.60" },
    { amount: "3000", currency: "NPR", expected: "NPR 3,000.00" },
    { amount: "123456.789", currency: "INR", expected: "INR 123,456.79" },
    { amount: "0", currency: "THB", expected: "THB 0.00" },
    { amount: "1.005", currency: "THB", expected: "THB 1.01" },
    { amount: "999.995", currency: "THB", expected: "THB 1,000.00" },
    { amount: " 001.50 ", currency: "NPR", expected: "NPR 1.50" },
  ])("formats $amount $currency as $expected", ({ amount, currency, expected }) => {
    expect(formatMoney(amount, currency)).toBe(expected);
  });

  it.each(["-1", "1e3", "NaN", ""])("does not format invalid amount %j as free", (amount) => {
    expect(formatMoney(amount, "THB")).toBeNull();
  });

  it("does not substitute a currency when the currency is unsupported", () => {
    expect(formatMoney("100", "USD")).toBeNull();
  });
});

it("can price every visible fixture service or its wellness options", () => {
  for (const service of catalog.services) {
    const result = getServicePricing(service);
    if (result.kind === "fixed") {
      expect(result.price.status).toBe("available");
    } else {
      expect(result.startingOption).not.toBeNull();
      expect(result.selectedOption).toBeNull();
      expect(result.options.every((option) => option.price.status === "available")).toBe(true);
    }
  }
});

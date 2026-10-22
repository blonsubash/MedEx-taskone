import Big from "big.js";

import type { RawPricing, Service } from "./catalog/types";

export const CURRENCIES = ["THB", "NPR", "INR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface AvailablePrice {
  status: "available";
  currency: Currency;
  originalPrice: string;
  discountAmount: string;
  afterDiscount: string;
  chargeAmount: string;
  finalPrice: string;
  hasDiscount: boolean;
  discountCapped: boolean;
  isFree: boolean;
}

export interface UnavailablePrice {
  status: "unavailable";
  reason:
    | "missing-price"
    | "invalid-price"
    | "invalid-discount"
    | "invalid-charge"
    | "unsupported-currency"
    | "invalid-duration";
}

export type PriceResult = AvailablePrice | UnavailablePrice;

export interface WellnessOptionPrice {
  id: string;
  durationInMinutes: number;
  price: PriceResult;
}

type AvailableWellnessOption = WellnessOptionPrice & { price: AvailablePrice };

export type ServicePricing =
  | { kind: "fixed"; price: PriceResult }
  | {
      kind: "wellness";
      options: WellnessOptionPrice[];
      startingOption: AvailableWellnessOption | null;
      selectedOption: AvailableWellnessOption | null;
    };

function isCurrency(value: string): value is Currency {
  return CURRENCIES.some((currency) => currency === value);
}

function parseAmount(value: string | null): Big | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  return new Big(text);
}

export function calculatePrice(raw: RawPricing, currency: string): PriceResult {
  if (!isCurrency(currency)) {
    return { status: "unavailable", reason: "unsupported-currency" };
  }
  if (raw.price === null) {
    return { status: "unavailable", reason: "missing-price" };
  }

  const base = parseAmount(raw.price);
  if (base === null) {
    return { status: "unavailable", reason: "invalid-price" };
  }

  const discount = parseAmount(raw.discount);
  if (
    discount === null ||
    (raw.discountType !== "percent" && raw.discountType !== "amount")
  ) {
    return { status: "unavailable", reason: "invalid-discount" };
  }

  const charge = parseAmount(raw.serviceCharge);
  if (
    charge === null ||
    (raw.serviceChargeType !== "percent" && raw.serviceChargeType !== "amount")
  ) {
    return { status: "unavailable", reason: "invalid-charge" };
  }

  // Multiplying by 0.01 avoids division precision limits and intermediate rounding.
  const requestedDiscount = raw.discountType === "percent"
    ? base.times(discount).times("0.01")
    : discount;
  const discountCapped = requestedDiscount.gt(base);
  const discountAmount = discountCapped ? base : requestedDiscount;
  const afterDiscount = base.minus(discountAmount);
  const chargeAmount = raw.serviceChargeType === "percent"
    ? afterDiscount.times(charge).times("0.01")
    : charge;
  const finalPrice = afterDiscount.plus(chargeAmount);

  return {
    status: "available",
    currency,
    originalPrice: base.toFixed(),
    discountAmount: discountAmount.toFixed(),
    afterDiscount: afterDiscount.toFixed(),
    chargeAmount: chargeAmount.toFixed(),
    finalPrice: finalPrice.toFixed(),
    hasDiscount: discountAmount.gt("0"),
    discountCapped,
    isFree: finalPrice.eq("0"),
  };
}

export function getServicePricing(
  service: Service,
  selectedWellnessOptionId?: string,
): ServicePricing {
  const currency = service.provider.currency;
  if (service.type !== "wellness") {
    return { kind: "fixed", price: calculatePrice(service, currency) };
  }

  const options: WellnessOptionPrice[] = service.wellnessPricing.map((option) => ({
    id: option.id,
    durationInMinutes: option.durationInMinutes,
    price: Number.isInteger(option.durationInMinutes) && option.durationInMinutes > 0
      ? calculatePrice(option, currency)
      : { status: "unavailable", reason: "invalid-duration" },
  }));
  const available = options.filter(
    (option): option is AvailableWellnessOption => option.price.status === "available",
  );
  const startingOption = available.reduce<AvailableWellnessOption | null>(
    (lowest, option) => lowest === null ||
      new Big(option.price.finalPrice).lt(lowest.price.finalPrice)
      ? option
      : lowest,
    null,
  );

  return {
    kind: "wellness",
    options,
    startingOption,
    selectedOption: available.find((option) => option.id === selectedWellnessOptionId) ?? null,
  };
}

export function formatMoney(amount: string, currency: string): string | null {
  const parsed = parseAmount(amount);
  if (parsed === null || !isCurrency(currency)) return null;

  const [whole, fraction] = parsed.toFixed(2, Big.roundHalfUp).split(".");
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format the whole number exactly as BigInt, then insert the rounded fraction.
  return formatter.formatToParts(BigInt(whole))
    .map((part) => part.type === "fraction" ? fraction : part.value)
    .join("")
    .replace(/\u00a0/g, " ");
}

import { bpsOf } from "@/lib/money";
import type { PlatformSettings } from "../settings";

export interface PriceBreakdown {
  subtotalMinor: number;
  discountMinor: number;
  platformFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** Fee is charged on the discounted amount, and VAT on the fee. A fully discounted order is free. */
export function priceOrder(
  subtotalMinor: number,
  discountMinor: number,
  settings: Pick<PlatformSettings, "platformFeeBps" | "platformFeeFlatMinor" | "taxBps">,
): PriceBreakdown {
  const discount = Math.min(discountMinor, subtotalMinor);
  const payable = subtotalMinor - discount;
  const platformFeeMinor = payable > 0 ? bpsOf(payable, settings.platformFeeBps) + settings.platformFeeFlatMinor : 0;
  const taxMinor = bpsOf(platformFeeMinor, settings.taxBps);
  return {
    subtotalMinor,
    discountMinor: discount,
    platformFeeMinor,
    taxMinor,
    totalMinor: payable + platformFeeMinor + taxMinor,
  };
}

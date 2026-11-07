// Money is stored as integer minor units (poisha). These helpers are the only conversion points.

const SYMBOLS: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€", GBP: "£", INR: "₹" };

/** "৳1,25,000" or "৳1,250.50". Uses South Asian digit grouping. */
export function formatMoney(minor: number, currency = "BDT"): string {
  const major = minor / 100;
  const body = major.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${SYMBOLS[currency] ?? `${currency} `}${body}`;
}

/** ASCII variant for PDFs, CSVs and plain-text emails, where ৳ may not be encodable. */
export function formatMoneyPlain(minor: number, currency = "BDT"): string {
  const major = minor / 100;
  return `${currency} ${major.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function bpsOf(amountMinor: number, bps: number): number {
  return Math.round((amountMinor * bps) / 10_000);
}

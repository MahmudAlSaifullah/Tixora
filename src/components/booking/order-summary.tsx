import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface SummaryLine {
  name: string;
  quantity: number;
  lineTotalMinor: number;
}

export interface SummaryAmounts {
  subtotalMinor: number;
  discountMinor: number;
  platformFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-4 text-sm", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** The price breakdown, shown the same way at checkout and on order pages. */
export function PriceRows({ amounts, currency, promoCode }: { amounts: SummaryAmounts; currency: string; promoCode?: string | null }) {
  return (
    <dl className="space-y-2">
      <Row label="Ticket subtotal" value={formatMoney(amounts.subtotalMinor, currency)} />
      {amounts.discountMinor > 0 && <Row label={promoCode ? `Discount (${promoCode})` : "Discount"} value={`-${formatMoney(amounts.discountMinor, currency)}`} className="[&>dd]:text-success" />}
      <Row label="Platform fee" value={formatMoney(amounts.platformFeeMinor, currency)} />
      <Row label="VAT" value={formatMoney(amounts.taxMinor, currency)} />
      <div className="perforated !mt-4 flex items-baseline justify-between pt-4 [--notch:var(--background)]">
        <dt className="font-medium">Total</dt>
        <dd className="font-display text-xl font-semibold">{amounts.totalMinor === 0 ? "Free" : formatMoney(amounts.totalMinor, currency)}</dd>
      </div>
    </dl>
  );
}

export function LineRows({ lines, currency }: { lines: SummaryLine[]; currency: string }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {lines.map((line) => (
        <li key={line.name} className="flex justify-between gap-4">
          <span>
            {line.quantity} × {line.name}
          </span>
          <span className="tabular-nums text-muted-foreground">{formatMoney(line.lineTotalMinor, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

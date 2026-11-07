"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export interface SelectableTicket {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  available: number;
  minPerOrder: number;
  maxPerOrder: number;
  perUserLimit: number | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
  saleState: "ON_SALE" | "NOT_STARTED" | "ENDED";
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5">
      <Button type="button" size="icon" variant="ghost" className="size-8" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        <Minus className="size-4" />
      </Button>
      <span className="w-6 text-center text-sm font-medium tabular-nums" aria-live="polite" aria-label={`${label} quantity`}>
        {value}
      </span>
      <Button type="button" size="icon" variant="ghost" className="size-8" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

export function TicketSelector({ eventSlug, tickets, onSale, statusLabel }: { eventSlug: string; tickets: SelectableTicket[]; onSale: boolean; statusLabel: string | null }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Stepping down from the minimum goes to 0; stepping up from 0 goes straight to the minimum.
  function step(ticket: SelectableTicket, next: number) {
    const current = quantities[ticket.id] ?? 0;
    const value = next > current && current === 0 ? ticket.minPerOrder : next < ticket.minPerOrder ? 0 : next;
    setQuantities((q) => ({ ...q, [ticket.id]: value }));
  }

  const { count, total, query } = useMemo(() => {
    const chosen = tickets.filter((t) => (quantities[t.id] ?? 0) > 0);
    return {
      count: chosen.reduce((sum, t) => sum + quantities[t.id], 0),
      total: chosen.reduce((sum, t) => sum + quantities[t.id] * t.priceMinor, 0),
      query: chosen.map((t) => `${t.id}:${quantities[t.id]}`).join(","),
    };
  }, [quantities, tickets]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Tickets</h2>
        {statusLabel && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabel}</span>}
      </div>
      {tickets.length === 0 && <p className="p-5 text-sm text-muted-foreground">Tickets have not been released yet.</p>}
      <ul>
        {tickets.map((ticket) => {
          const purchasable = onSale && ticket.saleState === "ON_SALE" && ticket.available >= ticket.minPerOrder;
          const max = Math.min(ticket.maxPerOrder, ticket.available);
          return (
            <li key={ticket.id} className="border-b p-5 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{ticket.name}</h3>
                  <p className="mt-0.5 font-display text-lg font-semibold">{ticket.priceMinor === 0 ? "Free" : formatMoney(ticket.priceMinor, ticket.currency)}</p>
                </div>
                {purchasable ? (
                  <Stepper label={ticket.name} value={quantities[ticket.id] ?? 0} min={0} max={max} onChange={(next) => step(ticket, next)} />
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {ticket.saleState === "NOT_STARTED" ? "Coming soon" : ticket.saleState === "ENDED" ? "Sale ended" : ticket.available < ticket.minPerOrder ? "Sold out" : "Unavailable"}
                  </span>
                )}
              </div>
              {ticket.description && <p className="mt-2 text-sm text-muted-foreground">{ticket.description}</p>}
              <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <div>
                  <dt className="inline">Available: </dt>
                  <dd className="inline">{ticket.available.toLocaleString("en-IN")}</dd>
                </div>
                <div>
                  <dt className="inline">Limit: </dt>
                  <dd className="inline">
                    {ticket.minPerOrder > 1 ? `${ticket.minPerOrder} to ` : "up to "}
                    {ticket.maxPerOrder} per order{ticket.perUserLimit ? `, ${ticket.perUserLimit} per customer` : ""}
                  </dd>
                </div>
                {ticket.salesStartAt && ticket.saleState === "NOT_STARTED" && (
                  <div>
                    <dt className="inline">Sale starts: </dt>
                    <dd className="inline">{formatDateTime(ticket.salesStartAt)}</dd>
                  </div>
                )}
                {ticket.salesEndAt && ticket.saleState === "ON_SALE" && (
                  <div>
                    <dt className="inline">Sale ends: </dt>
                    <dd className="inline">{formatDateTime(ticket.salesEndAt)}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
      {onSale && tickets.length > 0 && (
        <div className="perforated px-5 py-4 [--notch:var(--background)]">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {count} {count === 1 ? "ticket" : "tickets"}
            </span>
            <span className="font-display text-lg font-semibold">{formatMoney(total)}</span>
          </div>
          <Button size="lg" className="w-full" disabled={count === 0} onClick={() => router.push(`/events/${eventSlug}/book?items=${query}`)}>
            Book Tickets
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Fees are shown before you pay.</p>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, MapPin, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Stepper } from "@/components/events/ticket-selector";
import { Field } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, postJson } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { attendeeSchema, contactSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { LineRows, PriceRows, type SummaryAmounts, type SummaryLine } from "./order-summary";

interface WizardTicket {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  available: number;
  minPerOrder: number;
  maxPerOrder: number;
}

interface WizardEvent {
  id: string;
  slug: string;
  title: string;
  currency: string;
  when: string;
  venue: string;
  coverImageUrl: string | null;
}

const schema = z.object({
  contact: contactSchema,
  attendees: z.array(attendeeSchema.extend({ ticketTypeId: z.string() })),
});
type FormValues = z.input<typeof schema>;

type Quote = SummaryAmounts & { lines: SummaryLine[]; promoCode: string | null };

const STEPS = ["Tickets", "Attendees", "Contact", "Review"];

function newKey() {
  // crypto.randomUUID only exists on https or localhost; getRandomValues works everywhere.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Checkout progress">
      {STEPS.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={index === current ? "step" : undefined}>
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
              index < current && "bg-primary text-primary-foreground",
              index === current && "bg-primary/20 text-brand-glow ring-1 ring-brand-glow",
              index > current && "bg-muted text-muted-foreground",
            )}
          >
            {index < current ? <Check className="size-3.5" aria-hidden /> : index + 1}
          </span>
          <span className={cn("hidden text-sm sm:block", index === current ? "font-medium" : "text-muted-foreground")}>{label}</span>
          {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function AttendeeFields({ index, label, register, errors }: { index: number; label: string; register: UseFormRegister<FormValues>; errors: FieldErrors<FormValues> }) {
  const error = errors.attendees?.[index];
  return (
    <fieldset className="rounded-xl border bg-card p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" htmlFor={`attendee-${index}-name`} error={error?.name?.message}>
          <Input id={`attendee-${index}-name`} autoComplete="name" {...register(`attendees.${index}.name`)} />
        </Field>
        <Field label="Email (optional)" htmlFor={`attendee-${index}-email`} error={error?.email?.message}>
          <Input id={`attendee-${index}-email`} type="email" {...register(`attendees.${index}.email`)} />
        </Field>
      </div>
    </fieldset>
  );
}

function useAttendeeSync(control: Control<FormValues>, getCurrent: () => FormValues["attendees"], quantities: Record<string, number>, tickets: WizardTicket[], defaultName: string) {
  const { fields, replace } = useFieldArray({ control, name: "attendees" });

  // Grow or shrink the attendee list to match quantities, keeping what has been typed.
  const sync = useCallback(() => {
    const current = getCurrent();
    const next: FormValues["attendees"] = [];
    for (const ticket of tickets) {
      const existing = current.filter((f) => f.ticketTypeId === ticket.id);
      for (let i = 0; i < (quantities[ticket.id] ?? 0); i++) {
        next.push(existing[i] ? { ticketTypeId: ticket.id, name: existing[i].name, email: existing[i].email } : { ticketTypeId: ticket.id, name: next.length === 0 ? defaultName : "", email: "" });
      }
    }
    replace(next);
  }, [getCurrent, quantities, tickets, defaultName, replace]);
  return { fields, sync };
}

export function BookingWizard({
  event,
  tickets,
  initialQuantities,
  user,
}: {
  event: WizardEvent;
  tickets: WizardTicket[];
  initialQuantities: Record<string, number>;
  user: { name: string; email: string; phone: string | null } | null;
}) {
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState(initialQuantities);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState("");
  const [latestQuote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt, so a retried request can't create a second order.
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      contact: { name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "" },
      attendees: [],
    },
  });
  const getAttendees = useCallback(() => form.getValues("attendees"), [form]);
  const { fields, sync } = useAttendeeSync(form.control, getAttendees, quantities, tickets, user?.name ?? "");
  const errors = form.formState.errors;

  const items = useMemo(() => Object.entries(quantities).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })), [quantities]);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const quote = count > 0 ? latestQuote : null;

  // Prices always come from the server. The latest request wins if several overlap.
  const quoteSeq = useRef(0);
  const refreshQuote = useCallback(
    async (code: string | null) => {
      if (items.length === 0) return null;
      const seq = ++quoteSeq.current;
      try {
        const data = await postJson<Quote>("/api/bookings/quote", { eventId: event.id, items, promoCode: code });
        if (seq === quoteSeq.current) {
          setQuote(data);
          setQuoteError("");
        }
        return data;
      } catch (error) {
        if (seq === quoteSeq.current && code === null) setQuoteError((error as Error).message);
        throw error;
      }
    },
    [event.id, items],
  );

  useEffect(() => {
    refreshQuote(promo).catch(() => {
      // A promo that no longer fits the selection is dropped, and the price is re-quoted without it.
      if (promo) {
        setPromo(null);
        setPromoError("That promo code no longer applies to your selection.");
      }
    });
  }, [promo, refreshQuote]);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoError("");
    try {
      await refreshQuote(code);
      setPromo(code);
      setPromoInput("");
    } catch (error) {
      setPromoError((error as Error).message);
    }
  }

  async function next() {
    if (step === 0) {
      if (count === 0) return toast.error("Choose at least one ticket.");
      sync();
    }
    if (step === 1 && !(await form.trigger("attendees"))) return;
    if (step === 2 && !(await form.trigger("contact"))) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function reserveAndContinue() {
    const values = form.getValues();
    setSubmitting(true);
    try {
      const payload = {
        eventId: event.id,
        items: items.map((item) => ({
          ...item,
          attendees: values.attendees.filter((a) => a.ticketTypeId === item.ticketTypeId).map(({ name, email }) => ({ name, email })),
        })),
        contact: values.contact,
        promoCode: promo,
        idempotencyKey,
      };
      const result = await postJson<{ reference: string; status: string; guestToken: string | null }>("/api/bookings", payload);
      const guest = result.guestToken ? `?t=${encodeURIComponent(result.guestToken)}` : "";
      window.location.assign(result.status === "CONFIRMED" ? `/orders/${result.reference}${guest}` : `/checkout/${result.reference}${guest}`);
    } catch (error) {
      setSubmitting(false);
      // The order failed, so a changed retry must not collide with this key.
      setIdempotencyKey(newKey());
      const apiError = error as ApiError;
      toast.error(apiError.message);
      if (apiError.code === "SOLD_OUT") setStep(0);
    }
  }

  const attendeeLabel = (index: number) => {
    const ticketId = fields[index]?.ticketTypeId;
    const ticket = tickets.find((t) => t.id === ticketId);
    const position = fields.slice(0, index + 1).filter((f) => f.ticketTypeId === ticketId).length;
    return `${ticket?.name ?? "Ticket"}, attendee ${position}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:pb-10">
      <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to event
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
      <StepIndicator current={step} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="min-w-0">
          {step === 0 && (
            <section className="space-y-3" aria-label="Choose tickets">
              {tickets.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">No tickets are on sale right now.</p>}
              {tickets.map((ticket) => {
                const soldOut = ticket.available < ticket.minPerOrder;
                const current = quantities[ticket.id] ?? 0;
                return (
                  <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{ticket.name}</h2>
                      <p className="font-display font-semibold">{ticket.priceMinor === 0 ? "Free" : formatMoney(ticket.priceMinor, event.currency)}</p>
                      {ticket.description && <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {soldOut ? "Sold out" : `${ticket.available.toLocaleString("en-IN")} available, up to ${ticket.maxPerOrder} per order`}
                      </p>
                    </div>
                    {!soldOut && (
                      <Stepper
                        label={ticket.name}
                        value={current}
                        min={0}
                        max={Math.min(ticket.maxPerOrder, ticket.available)}
                        onChange={(value) =>
                          setQuantities((q) => ({ ...q, [ticket.id]: value > current && current === 0 ? ticket.minPerOrder : value < ticket.minPerOrder ? 0 : value }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {step === 1 && (
            <section className="space-y-3" aria-label="Attendee details">
              <p className="text-sm text-muted-foreground">Each ticket carries one attendee's name. It's shown to staff at the gate.</p>
              {fields.map((field, index) => (
                <AttendeeFields key={field.id} index={index} label={attendeeLabel(index)} register={form.register} errors={errors} />
              ))}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5" aria-label="Contact and promo code">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-1 font-semibold">Contact details</h2>
                <p className="mb-4 text-sm text-muted-foreground">We'll send your tickets and any event updates here.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="contact-name" error={errors.contact?.name?.message} className="sm:col-span-2">
                    <Input id="contact-name" autoComplete="name" {...form.register("contact.name")} />
                  </Field>
                  <Field label="Email" htmlFor="contact-email" error={errors.contact?.email?.message}>
                    <Input id="contact-email" type="email" autoComplete="email" {...form.register("contact.email")} />
                  </Field>
                  <Field label="Mobile number" htmlFor="contact-phone" error={errors.contact?.phone?.message}>
                    <Input id="contact-phone" type="tel" autoComplete="tel" placeholder="01712345678" {...form.register("contact.phone")} />
                  </Field>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 font-semibold">
                  <Tag className="size-4 text-brand-glow" aria-hidden /> Promo code
                </h2>
                {promo ? (
                  <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{quote?.promoCode ?? promo.toUpperCase()}</span> applied
                    </span>
                    <button type="button" onClick={() => setPromo(null)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <X className="size-4" aria-hidden /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyPromo();
                        }
                      }}
                      placeholder="Enter code"
                      aria-label="Promo code"
                      className="uppercase placeholder:normal-case"
                    />
                    <Button type="button" variant="secondary" onClick={applyPromo}>
                      Apply
                    </Button>
                  </div>
                )}
                {promoError && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {promoError}
                  </p>
                )}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4" aria-label="Review your order">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 font-semibold">Attendees</h2>
                <ul className="space-y-2 text-sm">
                  {form.getValues("attendees").map((attendee, index) => (
                    <li key={index} className="flex justify-between gap-4">
                      <span>{attendee.name}</span>
                      <span className="text-right text-muted-foreground">{tickets.find((t) => t.id === attendee.ticketTypeId)?.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border bg-card p-5 text-sm">
                <h2 className="mb-3 font-semibold">Contact</h2>
                <p>{form.getValues("contact.name")}</p>
                <p className="text-muted-foreground">{form.getValues("contact.email")}</p>
                <p className="text-muted-foreground">{form.getValues("contact.phone")}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Continuing holds your tickets for a limited time while you pay. By continuing you accept the event's terms and refund policy.
              </p>
            </section>
          )}

          <div className="mt-6 hidden items-center justify-between lg:flex">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <Button type="button" size="lg" onClick={next} disabled={count === 0}>
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={reserveAndContinue} disabled={submitting || count === 0}>
                {submitting && <Loader2 className="animate-spin" />} {quote?.totalMinor === 0 ? "Confirm booking" : "Continue to payment"}
              </Button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-20">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Order summary</h2>
            <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden /> {event.when}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {event.venue}
              </p>
            </div>
            <div className="my-4 border-t" />
            {quote ? (
              <>
                <LineRows lines={quote.lines} currency={event.currency} />
                <div className="my-4 border-t" />
                <PriceRows amounts={quote} currency={event.currency} promoCode={quote.promoCode} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{quoteError || "Choose your tickets to see the price."}</p>
            )}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        {step > 0 && (
          <Button type="button" variant="ghost" size="icon" onClick={() => setStep((s) => s - 1)} aria-label="Back">
            <ArrowLeft />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="truncate font-display font-semibold">{quote ? formatMoney(quote.totalMinor, event.currency) : "-"}</p>
        </div>
        {step < 3 ? (
          <Button type="button" onClick={next} disabled={count === 0}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={reserveAndContinue} disabled={submitting || count === 0}>
            {submitting && <Loader2 className="animate-spin" />} {quote?.totalMinor === 0 ? "Confirm" : "Pay now"}
          </Button>
        )}
      </div>
    </div>
  );
}

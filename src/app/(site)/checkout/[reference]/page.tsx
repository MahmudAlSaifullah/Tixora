import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { LineRows, PriceRows } from "@/components/booking/order-summary";
import { PaymentPicker } from "@/components/booking/payment-picker";
import { formatDate, formatTime } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { getBookingForViewer } from "@/server/services/booking";
import { availableGateways } from "@/server/payments/registry";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

type Props = { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string }> };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { reference } = await params;
  const { t } = await searchParams;
  const user = await getCurrentUser();
  const guestQuery = t ? `?t=${encodeURIComponent(t)}` : "";

  const booking = await getBookingForViewer(reference, { userId: user?.id, guestToken: t }).catch((error) => {
    if (error instanceof AppError && error.status === 401) redirect(`/login?callbackUrl=/checkout/${reference}`);
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  if (booking.status !== "PENDING") redirect(`/orders/${reference}${guestQuery}`);

  const gateways = availableGateways().map((g) => ({ code: g.code, label: g.label, description: g.description, instruments: g.instruments, isTestOnly: g.isTestOnly }));
  const tz = booking.event.timezone;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">Complete your payment</h1>
      <p className="mt-1 text-sm text-muted-foreground">Order {booking.reference}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <PaymentPicker reference={booking.reference} guestToken={t ?? null} gateways={gateways} expiresAt={booking.expiresAt.toISOString()} eventSlug={booking.event.slug} testMode={env.paymentMode === "sandbox"} />
        <aside className="rounded-xl border bg-card p-5 lg:sticky lg:top-20">
          <h2 className="font-semibold">{booking.event.title}</h2>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden /> {formatDate(booking.event.startsAt, tz)}, {formatTime(booking.event.startsAt, tz)}
            </p>
            {booking.event.venue && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {booking.event.venue.name}, {booking.event.venue.city}
              </p>
            )}
          </div>
          <div className="my-4 border-t" />
          <LineRows lines={booking.items.map((i) => ({ name: i.ticketTypeName, quantity: i.quantity, lineTotalMinor: i.lineTotalMinor }))} currency={booking.currency} />
          <div className="my-4 border-t" />
          <PriceRows amounts={booking} currency={booking.currency} promoCode={booking.promoCode?.code} />
        </aside>
      </div>
    </div>
  );
}

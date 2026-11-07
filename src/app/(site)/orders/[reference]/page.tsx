import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Download, MapPin, QrCode, RotateCcw, XCircle } from "lucide-react";
import { LineRows, PriceRows } from "@/components/booking/order-summary";
import { PaymentStatusWatcher } from "@/components/booking/payment-status-watcher";
import { Panel, StatusBadge } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getCurrentUser } from "@/server/auth/guards";
import { requestOrderRefund } from "@/server/actions/account";
import { AppError } from "@/server/errors";
import { getBookingForViewer } from "@/server/services/booking";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

type Props = { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string; from?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { reference } = await params;
  const { t, from } = await searchParams;
  const user = await getCurrentUser();
  const booking = await getBookingForViewer(reference, { userId: user?.id, isAdmin: user?.role === "SUPER_ADMIN", guestToken: t }).catch((error) => {
    if (error instanceof AppError && error.status === 401) redirect(`/login?callbackUrl=/orders/${reference}`);
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });

  const guest = t ? `?t=${encodeURIComponent(t)}` : "";
  const tz = booking.event.timezone;
  const latest = booking.payments[0];
  const isPaid = booking.status === "CONFIRMED" || booking.status === "PARTIALLY_REFUNDED";
  const stillPending = booking.status === "PENDING" && booking.expiresAt.getTime() > Date.now();
  const justReturned = from === "gateway";
  const openRefund = booking.refunds.find((r) => r.status === "REQUESTED" || r.status === "PROCESSING");
  const eventAhead = booking.event.startsAt ? booking.event.startsAt.getTime() > Date.now() : false;
  const isOwner = Boolean(user && booking.userId === user.id);
  const canRequestRefund = isOwner && isPaid && booking.totalMinor > 0 && eventAhead && !openRefund;
  const inReview = booking.payments.some((p) => p.status === "REVIEW");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {isPaid && justReturned && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-semibold">Payment confirmed. You're going!</p>
            <p className="text-sm text-muted-foreground">Your tickets are ready below and have been emailed to {booking.contactEmail}.</p>
          </div>
        </div>
      )}
      {stillPending && justReturned && latest?.status === "INITIATED" && <PaymentStatusWatcher reference={booking.reference} guestToken={t ?? null} />}
      {stillPending && latest && (latest.status === "FAILED" || latest.status === "CANCELLED") && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold">{latest.status === "CANCELLED" ? "Payment cancelled" : "Payment failed"}</p>
            <p className="text-sm text-muted-foreground">You haven't been charged, and no tickets were issued. Your reservation is still held, so you can try again.</p>
          </div>
        </div>
      )}
      {inReview && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold">We're checking a payment on this order</p>
            <p className="text-sm text-muted-foreground">Our team is reviewing it. If we can't honour it, we'll refund you and let you know by email.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Order {booking.reference}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{booking.event.title}</h1>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Panel>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0" aria-hidden /> {formatDate(booking.event.startsAt, tz)}, {formatTime(booking.event.startsAt, tz)}
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                {booking.event.mode === "ONLINE" ? "Online event" : booking.event.venue ? `${booking.event.venue.name}, ${booking.event.venue.address}, ${booking.event.venue.city}` : "To be announced"}
              </li>
              {booking.event.mode === "ONLINE" && isPaid && booking.event.onlineUrl && (
                <li>
                  <a href={booking.event.onlineUrl} rel="noopener noreferrer nofollow" target="_blank" className="text-brand-glow hover:underline">
                    Join online event
                  </a>
                </li>
              )}
            </ul>
          </Panel>

          {stillPending && (
            <Panel title="Payment needed" description={`Your tickets are held until ${formatDateTime(booking.expiresAt, tz)}. Tickets are issued once payment is confirmed.`}>
              <Button asChild size="lg">
                <Link href={`/checkout/${booking.reference}${guest}`}>
                  <Clock /> Continue to payment
                </Link>
              </Button>
            </Panel>
          )}

          {booking.status === "EXPIRED" && (
            <Panel title="This reservation expired" description="The tickets were released because payment wasn't completed in time.">
              <Button asChild>
                <Link href={`/events/${booking.event.slug}`}>Book again</Link>
              </Button>
            </Panel>
          )}

          {booking.tickets.length > 0 && (
            <Panel
              title="Your tickets"
              actions={
                isPaid && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/bookings/${booking.reference}/pdf${guest}`}>
                      <Download /> Download all
                    </a>
                  </Button>
                )
              }
            >
              <ul className="space-y-2">
                {booking.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link href={`/tickets/${ticket.code}${guest}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
                      <QrCode className="size-5 shrink-0 text-brand-glow" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{ticket.attendee.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {ticket.ticketType.name} · {ticket.code}
                        </span>
                      </span>
                      <StatusBadge status={ticket.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {booking.refunds.length > 0 && (
            <Panel title="Refunds">
              <ul className="space-y-2 text-sm">
                {booking.refunds.map((refund) => (
                  <li key={refund.id} className="flex items-center justify-between gap-3">
                    <span>
                      {formatMoney(refund.amountMinor, booking.currency)}
                      <span className="block text-xs text-muted-foreground">{formatDateTime(refund.createdAt, tz)}</span>
                    </span>
                    <StatusBadge status={refund.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {canRequestRefund && (
            <Panel title="Need a refund?" description={booking.event.refundPolicy ?? "Requests are reviewed by our team against the event's refund policy."}>
              <ActionButton action={requestOrderRefund.bind(null, booking.reference)} label="Request a refund" confirm="Your tickets stay valid until the refund is approved." reasonLabel="Why do you need a refund?" variant="outline" size="default" confirmLabel="Send request" />
            </Panel>
          )}
        </div>

        <aside className="rounded-xl border bg-card p-5 lg:sticky lg:top-20">
          <h2 className="mb-3 font-semibold">Summary</h2>
          <LineRows lines={booking.items.map((i) => ({ name: i.ticketTypeName, quantity: i.quantity, lineTotalMinor: i.lineTotalMinor }))} currency={booking.currency} />
          <div className="my-4 border-t" />
          <PriceRows amounts={booking} currency={booking.currency} promoCode={booking.promoCode?.code} />
          {latest?.status === "SUCCEEDED" && (
            <p className="mt-4 text-xs text-muted-foreground">
              Paid by {latest.method ?? latest.gateway}
              {latest.gatewayTxnId ? ` · ${latest.gatewayTxnId}` : ""}
              {latest.gateway === "test" ? " (test payment, no real money moved)" : ""}
            </p>
          )}
          {openRefund && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5" aria-hidden /> Refund in progress
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

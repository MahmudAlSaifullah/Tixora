import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TestPaymentPanel } from "@/components/booking/test-payment-panel";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { testGateway, verifyTestPageSignature } from "@/server/payments/adapters/test-gateway";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

/** The hosted page of the sandbox test gateway. It does not exist when the gateway is disabled. */
export default async function TestPaymentPage({ params, searchParams }: { params: Promise<{ txn: string }>; searchParams: Promise<{ sig?: string }> }) {
  const { txn } = await params;
  const { sig } = await searchParams;
  if (!testGateway.isAvailable() || !sig || !verifyTestPageSignature(txn, sig)) notFound();
  const payment = await db.payment.findUnique({ where: { merchantTxnId: txn }, include: { booking: { include: { event: { select: { title: true } } } } } });
  if (!payment || payment.gateway !== "test") notFound();

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-warning/40 bg-card">
        <p className="bg-warning px-5 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">Test mode: no real money moves</p>
        <div className="p-6">
          <h1 className="text-xl font-semibold">Tixora test gateway</h1>
          <p className="mt-1 text-sm text-muted-foreground">This page stands in for a real payment provider so the checkout can be tried before merchant credentials are added.</p>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Event</dt>
              <dd className="text-right">{payment.booking.event.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Order</dt>
              <dd>{payment.booking.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Transaction</dt>
              <dd className="font-mono text-xs">{payment.merchantTxnId}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <dt className="font-medium">Amount</dt>
              <dd className="font-display text-lg font-semibold">{formatMoney(payment.amountMinor, payment.currency)}</dd>
            </div>
          </dl>
          <TestPaymentPanel txn={txn} sig={sig} />
        </div>
      </div>
    </div>
  );
}

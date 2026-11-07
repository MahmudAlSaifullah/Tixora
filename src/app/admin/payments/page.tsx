import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleSlash, CreditCard } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, Panel, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { reconcilePaymentAction } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { env } from "@/server/env";
import { gatewayStatuses } from "@/server/payments/registry";
import { PaymentStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Payment Management" };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.PaymentWhereInput = {
    ...(status && status in PaymentStatus ? { status: status as PaymentStatus } : {}),
    ...(q ? { OR: [{ merchantTxnId: { contains: q, mode: "insensitive" } }, { gatewayTxnId: { contains: q, mode: "insensitive" } }, { booking: { reference: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [payments, total] = await Promise.all([
    db.payment.findMany({ where, include: { booking: { select: { reference: true, contactEmail: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.payment.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Payment Management" description="Every payment attempt, with gateway references." />
      <Panel title="Gateways" description={`Running in ${env.paymentMode} mode.`} className="mb-5">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {gatewayStatuses().map((gateway) => (
            <li key={gateway.code} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              {gateway.available ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span>
                <span className="block font-medium">{gateway.label}{gateway.isTestOnly ? " (test only)" : ""}</span>
                <span className="block text-xs text-muted-foreground">{gateway.available ? "Active" : gateway.isTestOnly ? "Disabled" : "Needs credentials"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <ListToolbar path="/admin/payments" q={q} placeholder="Transaction ID or booking" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(PaymentStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={payments}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={CreditCard} title="No payments found" />}
        columns={[
          { header: "Booking", cell: (p) => <Link href={`/orders/${p.booking.reference}`} className="font-medium text-brand-glow hover:underline">{p.booking.reference}</Link> },
          {
            header: "Transaction",
            cell: (p) => (
              <div>
                <p className="font-mono text-xs">{p.merchantTxnId}</p>
                <p className="font-mono text-xs text-muted-foreground">{p.gatewayTxnId ?? "No gateway reference"}</p>
              </div>
            ),
          },
          { header: "Gateway", cell: (p) => <span className="whitespace-nowrap">{p.method ?? p.gateway}{p.mode === "SANDBOX" ? " · sandbox" : ""}</span> },
          { header: "Amount", cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatMoney(p.amountMinor, p.currency)}{p.refundedMinor ? ` (−${formatMoney(p.refundedMinor)})` : ""}</span> },
          { header: "Date", cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</span> },
          {
            header: "Status",
            cell: (p) => (
              <div className="max-w-56">
                <StatusBadge status={p.status} />
                {p.failureReason && <p className="mt-1 text-xs text-muted-foreground">{p.failureReason}</p>}
              </div>
            ),
          },
          { header: "", cell: (p) => (p.status === "INITIATED" ? <ActionButton action={reconcilePaymentAction.bind(null, p.id)} label="Reconcile" variant="ghost" /> : null) },
        ]}
      />
      <Pagination path="/admin/payments" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

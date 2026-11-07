import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { approveRefund, completeRefundManuallyAction, rejectRefundAction } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { RefundStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Refund Management" };

export default async function AdminRefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.RefundWhereInput = {
    ...(status && status in RefundStatus ? { status: status as RefundStatus } : {}),
    ...(q ? { booking: { reference: { contains: q, mode: "insensitive" } } } : {}),
  };
  const [refunds, total] = await Promise.all([
    db.refund.findMany({ where, include: { booking: { select: { reference: true, contactName: true } }, payment: { select: { gateway: true, currency: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.refund.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Refund Management" description="Approving sends the refund to the payment gateway. A full refund also voids the booking's unused tickets." />
      <ListToolbar path="/admin/refunds" q={q} placeholder="Booking reference" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(RefundStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={refunds}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={RotateCcw} title="No refunds found" />}
        columns={[
          {
            header: "Booking",
            cell: (r) => (
              <div>
                <Link href={`/orders/${r.booking.reference}`} className="font-medium text-brand-glow hover:underline">{r.booking.reference}</Link>
                <p className="text-xs text-muted-foreground">{r.booking.contactName}</p>
              </div>
            ),
          },
          { header: "Amount", cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatMoney(r.amountMinor, r.payment.currency)}</span> },
          { header: "Gateway", cell: (r) => r.payment.gateway },
          {
            header: "Reason",
            cell: (r) => (
              <div className="min-w-44 max-w-72">
                <p>{r.reason}</p>
                {r.adminNote && <p className="mt-1 text-xs text-muted-foreground">Note: {r.adminNote}</p>}
              </div>
            ),
          },
          { header: "Requested", cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</span> },
          { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          {
            header: "",
            className: "text-right",
            cell: (r) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {(r.status === "REQUESTED" || r.status === "FAILED") && <ActionButton action={approveRefund.bind(null, r.id)} label={r.status === "FAILED" ? "Retry" : "Approve"} variant="default" confirm={`Send ${formatMoney(r.amountMinor, r.payment.currency)} back through ${r.payment.gateway}.`} confirmLabel="Send refund" />}
                {(r.status === "FAILED" || r.status === "PROCESSING") && <ActionButton action={completeRefundManuallyAction.bind(null, r.id)} label="Mark refunded" confirm="Use this after refunding in the gateway's own portal." reasonLabel="Gateway refund reference" />}
                {(r.status === "REQUESTED" || r.status === "FAILED") && <ActionButton action={rejectRefundAction.bind(null, r.id)} label="Reject" variant="ghost" confirm="The customer's tickets stay valid." reasonLabel="Reason" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/admin/refunds" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

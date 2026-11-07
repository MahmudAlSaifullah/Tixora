import type { Metadata } from "next";
import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { Button } from "@/components/ui/button";
import { EXPORT_URLS } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { adminCancelBooking, openRefund } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { BookingStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Booking Management" };

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.BookingWhereInput = {
    ...(status && status in BookingStatus ? { status: status as BookingStatus } : {}),
    ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { contactEmail: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [bookings, total] = await Promise.all([
    db.booking.findMany({ where, include: { event: { select: { title: true } }, organization: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.booking.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Booking Management"
        description="All orders on the platform."
        actions={
          <Button asChild variant="outline">
            <a href={EXPORT_URLS.sales}>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <ListToolbar path="/admin/bookings" q={q} placeholder="Reference, name or email" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(BookingStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={bookings}
        rowKey={(b) => b.id}
        empty={<EmptyState icon={ReceiptText} title="No bookings found" />}
        columns={[
          { header: "Booking", cell: (b) => <Link href={`/orders/${b.reference}`} className="font-medium text-brand-glow hover:underline">{b.reference}</Link> },
          {
            header: "Customer",
            cell: (b) => (
              <div className="min-w-36">
                <p>{b.contactName}</p>
                <p className="text-xs text-muted-foreground">{b.contactEmail}</p>
              </div>
            ),
          },
          {
            header: "Event",
            cell: (b) => (
              <div className="min-w-36">
                <p className="line-clamp-1">{b.event.title}</p>
                <p className="text-xs text-muted-foreground">{b.organization.name}</p>
              </div>
            ),
          },
          { header: "Total", cell: (b) => <span className="whitespace-nowrap tabular-nums">{formatMoney(b.totalMinor, b.currency)}</span> },
          { header: "Date", cell: (b) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(b.createdAt)}</span> },
          { header: "Status", cell: (b) => <StatusBadge status={b.status} /> },
          {
            header: "",
            className: "text-right",
            cell: (b) => (
              <div className="flex justify-end gap-1.5">
                {["CONFIRMED", "PARTIALLY_REFUNDED"].includes(b.status) && b.totalMinor > 0 && <ActionButton action={openRefund.bind(null, b.id)} label="Refund" confirm="Opens a refund for review under Refunds. Partial refunds keep the tickets valid." amountLabel="Amount in ৳ (leave empty for the full remaining amount)" reasonLabel="Reason" confirmLabel="Open refund" />}
                {["PENDING", "CONFIRMED", "PARTIALLY_REFUNDED"].includes(b.status) && <ActionButton action={adminCancelBooking.bind(null, b.id)} label="Cancel" variant="ghost" confirm="Paid bookings open a refund instead of cancelling straight away." reasonLabel="Reason" confirmLabel="Cancel booking" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/admin/bookings" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

import type { Metadata } from "next";
import { Download, ReceiptText } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { EXPORT_URLS } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { requireOrgPage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { BookingStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Orders" };

export default async function OrganizerOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organization } = await requireOrgPage();
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.BookingWhereInput = {
    organizationId: organization.id,
    ...(status && status in BookingStatus ? { status: status as BookingStatus } : {}),
    ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }, { contactEmail: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.booking.findMany({ where, include: { event: { select: { title: true } }, items: { select: { quantity: true } }, commission: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.booking.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every booking for your events."
        actions={
          <Button asChild variant="outline">
            <a href={EXPORT_URLS.sales}>
              <Download /> Export sales CSV
            </a>
          </Button>
        }
      />
      <ListToolbar path="/organizer/orders" q={q} placeholder="Reference, name or email" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(BookingStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={orders}
        rowKey={(o) => o.id}
        empty={<EmptyState icon={ReceiptText} title="No orders found" />}
        columns={[
          { header: "Order", cell: (o) => <span className="font-medium">{o.reference}</span> },
          { header: "Event", cell: (o) => <span className="line-clamp-1 min-w-36">{o.event.title}</span> },
          {
            header: "Customer",
            cell: (o) => (
              <div className="min-w-36">
                <p>{o.contactName}</p>
                <p className="text-xs text-muted-foreground">{o.contactEmail}</p>
              </div>
            ),
          },
          { header: "Tickets", cell: (o) => o.items.reduce((sum, i) => sum + i.quantity, 0) },
          { header: "Ticket value", cell: (o) => <span className="whitespace-nowrap tabular-nums">{formatMoney(o.subtotalMinor, o.currency)}</span> },
          { header: "Your net", cell: (o) => <span className="whitespace-nowrap tabular-nums">{o.commission ? formatMoney(o.commission.organizerNetMinor, o.currency) : "-"}</span> },
          { header: "Date", cell: (o) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAt)}</span> },
          { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
        ]}
      />
      <Pagination path="/organizer/orders" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

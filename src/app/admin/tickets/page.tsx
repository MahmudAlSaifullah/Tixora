import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { humanize } from "@/lib/utils";
import { voidTicket } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { TicketStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Ticket Management" };

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.TicketWhereInput = {
    ...(status && status in TicketStatus ? { status: status as TicketStatus } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { attendee: { name: { contains: q, mode: "insensitive" } } }, { booking: { reference: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [tickets, total] = await Promise.all([
    db.ticket.findMany({ where, include: { attendee: true, ticketType: { select: { name: true } }, event: { select: { title: true } }, booking: { select: { reference: true } } }, orderBy: { issuedAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.ticket.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Ticket Management" description="Look up any ticket by ID, attendee or booking." />
      <ListToolbar path="/admin/tickets" q={q} placeholder="Ticket ID, attendee or booking" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(TicketStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={tickets}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={Ticket} title="No tickets found" />}
        columns={[
          { header: "Ticket ID", cell: (t) => <Link href={`/tickets/${t.code}`} className="whitespace-nowrap font-mono text-xs text-brand-glow hover:underline">{t.code}</Link> },
          { header: "Attendee", cell: (t) => <span className="font-medium">{t.attendee.name}</span> },
          { header: "Event", cell: (t) => <span className="line-clamp-1 min-w-36">{t.event.title}</span> },
          { header: "Type", cell: (t) => t.ticketType.name },
          { header: "Booking", cell: (t) => <Link href={`/orders/${t.booking.reference}`} className="hover:underline">{t.booking.reference}</Link> },
          { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
          { header: "", cell: (t) => (t.status === "VALID" ? <ActionButton action={voidTicket.bind(null, t.id)} label="Cancel" variant="ghost" confirm="The ticket will no longer admit anyone, and its seat returns to sale. This doesn't refund the customer." reasonLabel="Reason" confirmLabel="Cancel ticket" /> : null) },
        ]}
      />
      <Pagination path="/admin/tickets" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

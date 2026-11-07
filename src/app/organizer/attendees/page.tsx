import type { Metadata } from "next";
import { Download, Users } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { requireOrgPage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";

export const metadata: Metadata = { title: "Attendees" };

export default async function OrganizerAttendeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organization } = await requireOrgPage();
  const params = await searchParams;
  const q = textParam(params, "q");
  const eventId = textParam(params, "eventId");
  const page = pageOf(params);
  const events = await db.event.findMany({ where: { organizationId: organization.id }, select: { id: true, title: true }, orderBy: { startsAt: "desc" } });
  const where: Prisma.TicketWhereInput = {
    event: { organizationId: organization.id },
    ...(eventId ? { eventId } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { attendee: { name: { contains: q, mode: "insensitive" } } }, { booking: { contactEmail: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [tickets, total] = await Promise.all([
    db.ticket.findMany({
      where,
      include: { attendee: true, ticketType: { select: { name: true } }, event: { select: { title: true } }, booking: { select: { reference: true, contactEmail: true } } },
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * DASH_PAGE_SIZE,
      take: DASH_PAGE_SIZE,
    }),
    db.ticket.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Attendees"
        description="Everyone holding a ticket to your events."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/exports/attendees${eventId ? `?eventId=${eventId}` : ""}`}>
              <Download /> Download attendee list
            </a>
          </Button>
        }
      />
      <ListToolbar path="/organizer/attendees" q={q} placeholder="Name, email or ticket ID" filters={[{ name: "eventId", label: "Event", value: eventId, options: events.map((e) => ({ value: e.id, label: e.title })) }]} />
      <DataTable
        rows={tickets}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={Users} title="No attendees found" />}
        columns={[
          {
            header: "Attendee",
            cell: (t) => (
              <div className="min-w-36">
                <p className="font-medium">{t.attendee.name}</p>
                <p className="text-xs text-muted-foreground">{t.attendee.email ?? t.booking.contactEmail}</p>
              </div>
            ),
          },
          { header: "Event", cell: (t) => <span className="line-clamp-1 min-w-36">{t.event.title}</span> },
          { header: "Ticket", cell: (t) => t.ticketType.name },
          { header: "Ticket ID", cell: (t) => <span className="whitespace-nowrap font-mono text-xs">{t.code}</span> },
          { header: "Booking", cell: (t) => t.booking.reference },
          { header: "Checked in", cell: (t) => <span className="whitespace-nowrap text-muted-foreground">{t.checkedInAt ? formatDateTime(t.checkedInAt) : "-"}</span> },
          { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
        ]}
      />
      <Pagination path="/organizer/attendees" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, CalendarX, Download } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { cancelEventAction, submitEventAction } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "My Events" };

export default async function OrganizerEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organization } = await requireOrgPage();
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.EventWhereInput = {
    organizationId: organization.id,
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(status && status in EventStatus ? { status: status as EventStatus } : {}),
  };
  const [events, total] = await Promise.all([
    db.event.findMany({
      where,
      include: { ticketTypes: { where: { isActive: true }, select: { inventory: true } }, venue: { select: { city: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * DASH_PAGE_SIZE,
      take: DASH_PAGE_SIZE,
    }),
    db.event.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="My Events"
        description="Create, edit and track your events."
        actions={
          <Button asChild>
            <Link href="/organizer/events/new">
              <CalendarPlus /> Create event
            </Link>
          </Button>
        }
      />
      <ListToolbar path="/organizer/events" q={q} placeholder="Search events" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(EventStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={events}
        rowKey={(e) => e.id}
        empty={
          <EmptyState
            icon={CalendarX}
            title="No events found"
            description="Create your first event, or adjust your filters."
            action={
              <Button asChild>
                <Link href="/organizer/events/new">Create event</Link>
              </Button>
            }
          />
        }
        columns={[
          {
            header: "Event",
            cell: (e) => (
              <div className="min-w-44">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(e.startsAt)}
                  {e.venue ? ` · ${e.venue.city}` : ""}
                </p>
                {e.status === "REJECTED" && e.rejectionReason && <p className="mt-1 text-xs text-danger">Reason: {e.rejectionReason}</p>}
              </div>
            ),
          },
          { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
          {
            header: "Sold",
            cell: (e) => {
              const sold = e.ticketTypes.reduce((sum, t) => sum + (t.inventory?.sold ?? 0), 0);
              const capacity = e.ticketTypes.reduce((sum, t) => sum + (t.inventory?.total ?? 0), 0);
              return <span className="whitespace-nowrap tabular-nums">{sold.toLocaleString("en-IN")} / {capacity.toLocaleString("en-IN")}</span>;
            },
          },
          {
            header: "Actions",
            className: "text-right",
            cell: (e) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {!["COMPLETED", "CANCELLED", "SUSPENDED"].includes(e.status) && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/organizer/events/${e.id}/edit`}>Edit</Link>
                  </Button>
                )}
                {(e.status === "DRAFT" || e.status === "REJECTED") && <ActionButton action={submitEventAction.bind(null, e.id)} label="Submit" variant="default" />}
                {["PUBLISHED", "SOLD_OUT", "COMPLETED"].includes(e.status) && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/events/${e.slug}`}>View</Link>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/exports/attendees?eventId=${e.id}`}>
                    <Download /> Attendees
                  </a>
                </Button>
                {["PUBLISHED", "SOLD_OUT", "PENDING_APPROVAL", "DRAFT"].includes(e.status) && (
                  <ActionButton action={cancelEventAction.bind(null, e.id)} label="Cancel" variant="destructive" confirm="This voids all tickets, emails ticket holders and opens refunds. It can't be undone." reasonLabel="Reason, shared with ticket holders" confirmLabel="Cancel event" />
                )}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/organizer/events" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { adminCancelEvent, suspendEvent, toggleEventFeatured, unsuspendEvent } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Event Management" };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.EventWhereInput = {
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(status && status in EventStatus ? { status: status as EventStatus } : {}),
  };
  const [events, total] = await Promise.all([
    db.event.findMany({ where, include: { organization: { select: { name: true } }, ticketTypes: { select: { inventory: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.event.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Event Management" description="Every event on the platform, whoever runs it." />
      <ListToolbar path="/admin/events" q={q} placeholder="Event title" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(EventStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={events}
        rowKey={(e) => e.id}
        empty={<EmptyState icon={CalendarX} title="No events found" />}
        columns={[
          {
            header: "Event",
            cell: (e) => (
              <div className="min-w-44">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{e.organization.name}</p>
              </div>
            ),
          },
          { header: "Date", cell: (e) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(e.startsAt)}</span> },
          { header: "Sold", cell: (e) => <span className="tabular-nums">{e.ticketTypes.reduce((sum, t) => sum + (t.inventory?.sold ?? 0), 0).toLocaleString("en-IN")}</span> },
          { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
          {
            header: "",
            className: "text-right",
            cell: (e) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {["PUBLISHED", "SOLD_OUT", "COMPLETED"].includes(e.status) && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/events/${e.slug}`}>View</Link>
                  </Button>
                )}
                {["PUBLISHED", "SOLD_OUT"].includes(e.status) && <ActionButton action={toggleEventFeatured.bind(null, e.id)} label={e.isFeatured ? "Unfeature" : "Feature"} variant="outline" />}
                {["PUBLISHED", "SOLD_OUT", "PENDING_APPROVAL"].includes(e.status) && <ActionButton action={suspendEvent.bind(null, e.id)} label="Suspend" variant="outline" confirm="It will be removed from sale and scanning will stop." reasonLabel="Reason" />}
                {e.status === "SUSPENDED" && <ActionButton action={unsuspendEvent.bind(null, e.id)} label="Restore" />}
                {!["CANCELLED", "COMPLETED"].includes(e.status) && <ActionButton action={adminCancelEvent.bind(null, e.id)} label="Cancel" variant="destructive" confirm="This voids all tickets, emails ticket holders and opens refunds. It can't be undone." reasonLabel="Reason, shared with ticket holders" confirmLabel="Cancel event" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/admin/events" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

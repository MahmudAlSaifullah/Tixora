import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { humanize } from "@/lib/utils";
import { setOrganizationStatus } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { OrganizationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Organizer Management" };

export default async function AdminOrganizersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.OrganizationWhereInput = {
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(status && status in OrganizationStatus ? { status: status as OrganizationStatus } : {}),
  };
  const [organizations, total] = await Promise.all([
    db.organization.findMany({ where, include: { _count: { select: { events: true, members: true } }, members: { where: { role: "OWNER" }, take: 1, include: { user: { select: { email: true } } } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.organization.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Organizer Management" description="Approve new organizers, and suspend accounts when needed." />
      <ListToolbar path="/admin/organizers" q={q} placeholder="Organization name" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(OrganizationStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={organizations}
        rowKey={(o) => o.id}
        empty={<EmptyState icon={Building2} title="No organizers found" />}
        columns={[
          {
            header: "Organization",
            cell: (o) => (
              <div className="min-w-40">
                <p className="font-medium">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.members[0]?.user.email ?? o.email}</p>
              </div>
            ),
          },
          { header: "City", cell: (o) => o.city ?? "-" },
          { header: "Events", cell: (o) => o._count.events },
          { header: "Team", cell: (o) => o._count.members },
          { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
          {
            header: "",
            className: "text-right",
            cell: (o) => (
              <div className="flex justify-end gap-1.5">
                {o.status !== "APPROVED" && <ActionButton action={setOrganizationStatus.bind(null, o.id, "APPROVED")} label="Approve" variant="default" />}
                {o.status === "PENDING" && <ActionButton action={setOrganizationStatus.bind(null, o.id, "REJECTED")} label="Reject" variant="outline" reasonLabel="Reason, shared with the organizer" />}
                {o.status === "APPROVED" && <ActionButton action={setOrganizationStatus.bind(null, o.id, "SUSPENDED")} label="Suspend" variant="destructive" confirm="Their live events come off sale, and they can't manage events. To reinstate, approve them, then restore each event under Events." reasonLabel="Reason, shared with the organizer" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/admin/organizers" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, pageOf, pagesOf, textParam } from "@/components/kit";
import { formatDateTime } from "@/lib/dates";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";

export const metadata: Metadata = { title: "Audit Logs" };

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const page = pageOf(params);
  const where: Prisma.AuditLogWhereInput = q
    ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entity: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }, { actor: { email: { contains: q, mode: "insensitive" } } }] }
    : {};
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Audit Logs" description="An append-only record of sensitive actions." />
      <ListToolbar path="/admin/audit-logs" q={q} placeholder="Action, entity or actor email" />
      <DataTable
        rows={logs}
        rowKey={(l) => l.id}
        empty={<EmptyState icon={ScrollText} title="No log entries found" />}
        columns={[
          { header: "When", cell: (l) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt)}</span> },
          { header: "Actor", cell: (l) => l.actor?.email ?? "System" },
          { header: "Action", cell: (l) => <span className="font-mono text-xs">{l.action}</span> },
          { header: "Entity", cell: (l) => <span className="whitespace-nowrap text-xs">{l.entity}{l.entityId ? ` · ${l.entityId.slice(0, 10)}` : ""}</span> },
          { header: "Details", cell: (l) => <span className="line-clamp-2 max-w-md break-all font-mono text-xs text-muted-foreground">{l.metadata ? JSON.stringify(l.metadata) : "-"}</span> },
          { header: "IP", cell: (l) => <span className="text-xs text-muted-foreground">{l.ip ?? "-"}</span> },
        ]}
      />
      <Pagination path="/admin/audit-logs" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

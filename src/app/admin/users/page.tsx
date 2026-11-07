import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, NativeSelect, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { setUserRole, setUserStatus } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { RoleKey, UserStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "User Management" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const q = textParam(params, "q");
  const role = textParam(params, "role");
  const status = textParam(params, "status");
  const page = pageOf(params);
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(role && role in RoleKey ? { role: { key: role as RoleKey } } : {}),
    ...(status && status in UserStatus ? { status: status as UserStatus } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({ where, include: { role: true, _count: { select: { bookings: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="User Management" description="Change roles, and suspend or reinstate accounts." />
      <ListToolbar
        path="/admin/users"
        q={q}
        placeholder="Name or email"
        filters={[
          { name: "role", label: "Role", value: role, options: Object.keys(RoleKey).map((r) => ({ value: r, label: humanize(r) })) },
          { name: "status", label: "Status", value: status, options: Object.keys(UserStatus).map((s) => ({ value: s, label: humanize(s) })) },
        ]}
      />
      <DataTable
        rows={users}
        rowKey={(u) => u.id}
        empty={<EmptyState icon={Users} title="No users found" />}
        columns={[
          {
            header: "User",
            cell: (u) => (
              <div className="min-w-40">
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            ),
          },
          {
            header: "Role",
            cell: (u) =>
              u.id === admin.id ? (
                humanize(u.role.key)
              ) : (
                <ActionForm action={setUserRole.bind(null, u.id)} submitLabel="Set" submitProps={{ variant: "ghost", size: "sm" }} className="flex items-center gap-1">
                  <NativeSelect name="role" defaultValue={u.role.key} aria-label={`Role for ${u.name}`} className="h-8 w-36">
                    {Object.keys(RoleKey).map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </NativeSelect>
                </ActionForm>
              ),
          },
          { header: "Orders", cell: (u) => u._count.bookings },
          { header: "Joined", cell: (u) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(u.createdAt)}</span> },
          { header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
          {
            header: "",
            cell: (u) =>
              u.id === admin.id ? null : u.status === "ACTIVE" ? (
                <ActionButton action={setUserStatus.bind(null, u.id, "SUSPENDED")} label="Suspend" variant="destructive" confirm={`${u.name} will be logged out and unable to log in.`} reasonLabel="Reason" />
              ) : (
                <ActionButton action={setUserStatus.bind(null, u.id, "ACTIVE")} label="Reinstate" />
              ),
          },
        ]}
      />
      <Pagination path="/admin/users" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

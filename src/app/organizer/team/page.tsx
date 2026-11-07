import type { Metadata } from "next";
import { ScanLine, UserCog } from "lucide-react";
import { DataTable, EmptyState, Field, NativeSelect, PageHeader, Panel } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { humanize } from "@/lib/utils";
import { addTeamMember, assignStaff, removeStaffAssignment, removeTeamMember } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Team Management" };

export default async function OrganizerTeamPage() {
  const { organization, memberRole } = await requireOrgPage();
  const [members, events, assignments] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: organization.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    db.event.findMany({ where: { organizationId: organization.id, status: { in: ["PUBLISHED", "SOLD_OUT"] } }, select: { id: true, title: true }, orderBy: { startsAt: "asc" } }),
    db.staffAssignment.findMany({ where: { event: { organizationId: organization.id } }, include: { user: { select: { name: true, email: true } }, event: { select: { title: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const isOwner = memberRole === "OWNER";
  return (
    <>
      <PageHeader title="Team Management" description="Managers help run events. Staff can only scan tickets at events they're assigned to." />
      {isOwner && (
        <Panel title="Add a team member" description="New people get an email to set their password." className="mb-6">
          <ActionForm action={addTeamMember} submitLabel="Add member" resetOnSuccess className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_auto]">
            <Field label="Name" htmlFor="member-name">
              <Input id="member-name" name="name" required />
            </Field>
            <Field label="Email" htmlFor="member-email">
              <Input id="member-email" name="email" type="email" required />
            </Field>
            <Field label="Role" htmlFor="member-role">
              <NativeSelect id="member-role" name="role">
                <option value="STAFF">Scanner staff</option>
                <option value="MANAGER">Manager</option>
              </NativeSelect>
            </Field>
          </ActionForm>
        </Panel>
      )}
      <DataTable
        rows={members}
        rowKey={(m) => m.id}
        empty={<EmptyState icon={UserCog} title="No team members" />}
        columns={[
          { header: "Name", cell: (m) => <span className="font-medium">{m.user.name}</span> },
          { header: "Email", cell: (m) => <span className="text-muted-foreground">{m.user.email}</span> },
          { header: "Role", cell: (m) => humanize(m.role) },
          { header: "", cell: (m) => (isOwner && m.role !== "OWNER" ? <ActionButton action={removeTeamMember.bind(null, m.id)} label="Remove" variant="ghost" confirm={`${m.user.name} will lose access to this organization.`} /> : null) },
        ]}
      />

      <Panel title="Assign scanner staff" description="Staff see only the events you assign here." className="my-6">
        <ActionForm action={assignStaff} submitLabel="Assign" resetOnSuccess className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_auto]">
          <Field label="Event" htmlFor="assign-event">
            <NativeSelect id="assign-event" name="eventId" required>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Person" htmlFor="assign-user">
            <NativeSelect id="assign-user" name="userId" required>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Gate" htmlFor="assign-gate">
            <Input id="assign-gate" name="gate" placeholder="Gate A" />
          </Field>
        </ActionForm>
      </Panel>
      <DataTable
        rows={assignments}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={ScanLine} title="No staff assigned yet" />}
        columns={[
          { header: "Staff", cell: (a) => <span className="font-medium">{a.user.name}</span> },
          { header: "Event", cell: (a) => <span className="line-clamp-1 min-w-36">{a.event.title}</span> },
          { header: "Gate", cell: (a) => a.gate ?? "-" },
          { header: "", cell: (a) => <ActionButton action={removeStaffAssignment.bind(null, a.id)} label="Remove" variant="ghost" /> },
        ]}
      />
    </>
  );
}

import type { Metadata } from "next";
import { ScanLine, Smartphone } from "lucide-react";
import { DataTable, EmptyState, Field, NativeSelect, PageHeader, Panel } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { adminAssignStaff, adminRemoveStaff } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Scanner and Staff Management" };

export default async function AdminStaffPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const [assignments, devices, events] = await Promise.all([
    db.staffAssignment.findMany({ include: { user: { select: { name: true, email: true } }, event: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.scannerDevice.findMany({ include: { user: { select: { name: true } }, event: { select: { title: true } }, _count: { select: { checkIns: true } } }, orderBy: { lastSeenAt: "desc" }, take: 100 }),
    db.event.findMany({ where: { status: { in: ["PUBLISHED", "SOLD_OUT"] } }, select: { id: true, title: true }, orderBy: { startsAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Scanner and Staff Management" description="Who can scan which event, and the devices they've used." />
      <Panel title="Assign staff to an event" description="New people get an email to set their password." className="mb-5">
        <ActionForm action={adminAssignStaff} submitLabel="Assign" resetOnSuccess className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_120px_auto]">
          <Field label="Event" htmlFor="staff-event">
            <NativeSelect id="staff-event" name="eventId" required>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Name" htmlFor="staff-name">
            <Input id="staff-name" name="name" required />
          </Field>
          <Field label="Email" htmlFor="staff-email">
            <Input id="staff-email" name="email" type="email" required />
          </Field>
          <Field label="Gate" htmlFor="staff-gate">
            <Input id="staff-gate" name="gate" />
          </Field>
        </ActionForm>
      </Panel>
      <DataTable
        rows={assignments}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={ScanLine} title="No staff assigned" />}
        columns={[
          {
            header: "Staff",
            cell: (a) => (
              <div>
                <p className="font-medium">{a.user.name}</p>
                <p className="text-xs text-muted-foreground">{a.user.email}</p>
              </div>
            ),
          },
          { header: "Event", cell: (a) => <span className="line-clamp-1 min-w-36">{a.event.title}</span> },
          { header: "Gate", cell: (a) => a.gate ?? "-" },
          { header: "", cell: (a) => <ActionButton action={adminRemoveStaff.bind(null, a.id)} label="Remove" variant="ghost" /> },
        ]}
      />
      <h2 className="mb-3 mt-6 text-base font-semibold">Scanner devices</h2>
      <DataTable
        rows={devices}
        rowKey={(d) => d.id}
        empty={<EmptyState icon={Smartphone} title="No devices have scanned yet" />}
        columns={[
          { header: "Device", cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: "Last user", cell: (d) => d.user.name },
          { header: "Event", cell: (d) => <span className="line-clamp-1 min-w-36">{d.event?.title ?? "-"}</span> },
          { header: "Scans", cell: (d) => d._count.checkIns },
          { header: "Last seen", cell: (d) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(d.lastSeenAt)}</span> },
        ]}
      />
    </>
  );
}

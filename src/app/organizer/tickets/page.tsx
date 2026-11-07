import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { DataTable, EmptyState, PageHeader, StatusBadge } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { setTicketTotal, toggleTicketType } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Ticket Management" };

export default async function OrganizerTicketsPage() {
  const { organization } = await requireOrgPage();
  const types = await db.ticketType.findMany({
    where: { event: { organizationId: organization.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } },
    include: { inventory: true, event: { select: { title: true, status: true } } },
    orderBy: [{ event: { startsAt: "asc" } }, { sortOrder: "asc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader title="Ticket Management" description="Live inventory across your active events. Prices and sale dates are edited on the event." />
      <DataTable
        rows={types}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={Ticket} title="No ticket categories yet" description="Create an event to add ticket categories." />}
        columns={[
          {
            header: "Ticket",
            cell: (t) => (
              <div className="min-w-40">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.event.title}</p>
              </div>
            ),
          },
          { header: "Price", cell: (t) => <span className="whitespace-nowrap tabular-nums">{t.priceMinor === 0 ? "Free" : formatMoney(t.priceMinor, t.currency)}</span> },
          { header: "Sold", cell: (t) => <span className="tabular-nums">{t.inventory?.sold ?? 0}</span> },
          { header: "Held", cell: (t) => <span className="tabular-nums">{t.inventory?.reserved ?? 0}</span> },
          {
            header: "Total inventory",
            cell: (t) => (
              <ActionForm action={setTicketTotal.bind(null, t.id)} submitLabel="Set" submitProps={{ variant: "outline", size: "sm" }} className="flex items-center gap-1.5">
                <Input name="total" type="number" min={0} defaultValue={t.inventory?.total ?? 0} aria-label={`Total inventory for ${t.name}`} className="h-8 w-24" />
              </ActionForm>
            ),
          },
          { header: "Sale", cell: (t) => <StatusBadge status={t.isActive ? "ACTIVE" : "DRAFT"} /> },
          { header: "", cell: (t) => <ActionButton action={toggleTicketType.bind(null, t.id)} label={t.isActive ? "Hide" : "Show"} variant="ghost" /> },
        ]}
      />
    </>
  );
}

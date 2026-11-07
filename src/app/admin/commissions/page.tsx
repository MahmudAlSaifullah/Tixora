import type { Metadata } from "next";
import { DataTable, PageHeader, StatTile } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { setOrganizationCommission } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Commission Management" };

export default async function AdminCommissionsPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const [settings, organizations, totals, byOrganization] = await Promise.all([
    getSettings(),
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, commissionBps: true } }),
    db.platformCommission.aggregate({ _sum: { amountMinor: true, grossMinor: true, organizerNetMinor: true } }),
    db.platformCommission.groupBy({ by: ["organizationId"], _sum: { amountMinor: true, grossMinor: true } }),
  ]);
  return (
    <>
      <PageHeader title="Commission Management" description={`The platform default is ${settings.commissionBps / 100}%, set under Settings. Overrides apply to new bookings only.`} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Commission earned" value={formatMoney(totals._sum.amountMinor ?? 0)} />
        <StatTile label="Commissionable sales" value={formatMoney(totals._sum.grossMinor ?? 0)} />
        <StatTile label="Owed to organizers" value={formatMoney(totals._sum.organizerNetMinor ?? 0)} hint="Before payouts" />
      </div>
      <DataTable
        rows={organizations}
        rowKey={(o) => o.id}
        columns={[
          { header: "Organizer", cell: (o) => <span className="font-medium">{o.name}</span> },
          { header: "Sales", cell: (o) => <span className="tabular-nums">{formatMoney(byOrganization.find((b) => b.organizationId === o.id)?._sum.grossMinor ?? 0)}</span> },
          { header: "Commission", cell: (o) => <span className="tabular-nums">{formatMoney(byOrganization.find((b) => b.organizationId === o.id)?._sum.amountMinor ?? 0)}</span> },
          {
            header: "Rate override (%)",
            cell: (o) => (
              <ActionForm action={setOrganizationCommission.bind(null, o.id)} submitLabel="Save" submitProps={{ variant: "outline", size: "sm" }} className="flex items-center gap-1.5">
                <Input name="percent" type="number" min={0} max={50} step="0.1" defaultValue={o.commissionBps === null ? "" : o.commissionBps / 100} placeholder={`${settings.commissionBps / 100} (default)`} aria-label={`Commission override for ${o.name}`} className="h-8 w-32" />
              </ActionForm>
            ),
          },
        ]}
      />
    </>
  );
}

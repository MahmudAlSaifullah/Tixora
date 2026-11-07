import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { DataTable, EmptyState, Field, PageHeader, Panel, StatTile, StatusBadge } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requestPayout } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";
import { organizerBalance } from "@/server/services/commission";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Payouts" };

export default async function OrganizerPayoutsPage() {
  const { organization, memberRole } = await requireOrgPage();
  const [balance, payouts, settings] = await Promise.all([organizerBalance(organization.id), db.payout.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "desc" } }), getSettings()]);
  const hasDetails = organization.payoutMethod && organization.payoutAccountName && organization.payoutAccountNumber;
  return (
    <>
      <PageHeader title="Payouts" description="What you've earned, after commission and refunds." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Available" value={formatMoney(balance.availableMinor)} />
        <StatTile label="Pending" value={formatMoney(balance.pendingMinor)} />
        <StatTile label="Paid out" value={formatMoney(balance.paidMinor)} />
        <StatTile label="Total earned" value={formatMoney(balance.earnedMinor)} />
      </div>
      {memberRole === "OWNER" && (
        <Panel title="Request a payout" description={`The minimum is ${formatMoney(settings.minPayoutMinor)}.`} className="my-6">
          {hasDetails ? (
            <ActionForm action={requestPayout} submitLabel="Request payout" resetOnSuccess className="grid items-end gap-4 sm:grid-cols-[180px_1fr_auto]">
              <Field label="Amount (৳)" htmlFor="amount">
                <Input id="amount" name="amount" type="number" min={1} step="0.01" required />
              </Field>
              <Field label="Note (optional)" htmlFor="note">
                <Input id="note" name="note" maxLength={240} />
              </Field>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your payout details under{" "}
              <Link href="/organizer/settings" className="text-brand-glow hover:underline">
                Organization Settings
              </Link>{" "}
              first.
            </p>
          )}
          {hasDetails && (
            <p className="mt-3 text-xs text-muted-foreground">
              Paid to {organization.payoutMethod}, {organization.payoutAccountName}, {organization.payoutAccountNumber}.
            </p>
          )}
        </Panel>
      )}
      <h2 className="mb-3 mt-6 text-base font-semibold">Payout history</h2>
      <DataTable
        rows={payouts}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={Banknote} title="No payouts yet" />}
        columns={[
          { header: "Requested", cell: (p) => <span className="whitespace-nowrap">{formatDateTime(p.createdAt)}</span> },
          { header: "Amount", cell: (p) => <span className="tabular-nums">{formatMoney(p.amountMinor, p.currency)}</span> },
          { header: "Method", cell: (p) => p.method },
          { header: "Reference", cell: (p) => p.reference ?? "-" },
          { header: "Note", cell: (p) => <span className="text-muted-foreground">{p.note ?? "-"}</span> },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
        ]}
      />
    </>
  );
}

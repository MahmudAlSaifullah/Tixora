import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { DataTable, EmptyState, PageHeader, StatusBadge } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { PromoForm } from "@/components/kit/promo-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { createPromoCode, togglePromoCode } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Promo Codes" };

export default async function OrganizerPromoPage() {
  const { organization } = await requireOrgPage();
  const [promos, events, types] = await Promise.all([
    db.promoCode.findMany({ where: { organizationId: organization.id }, include: { event: { select: { title: true } }, ticketType: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.event.findMany({ where: { organizationId: organization.id }, select: { id: true, title: true }, orderBy: { startsAt: "desc" } }),
    db.ticketType.findMany({ where: { event: { organizationId: organization.id } }, select: { id: true, name: true, event: { select: { title: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Promo Codes" description="Discounts you offer are funded from your ticket revenue." />
      <PromoForm action={createPromoCode} title="New promo code" events={events.map((e) => ({ value: e.id, label: e.title }))} ticketTypes={types.map((t) => ({ value: t.id, label: `${t.name} (${t.event.title})` }))} />
      <DataTable
        rows={promos}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={BadgePercent} title="No promo codes yet" />}
        columns={[
          {
            header: "Code",
            cell: (p) => (
              <div>
                <p className="font-mono font-medium">{p.code}</p>
                <p className="text-xs text-muted-foreground">{p.name}</p>
              </div>
            ),
          },
          { header: "Discount", cell: (p) => (p.discountType === "PERCENT" ? `${p.discountValue / 100}%` : formatMoney(p.discountValue)) },
          { header: "Applies to", cell: (p) => <span className="line-clamp-1 min-w-32">{p.ticketType?.name ?? p.event?.title ?? "All events"}</span> },
          { header: "Used", cell: (p) => <span className="tabular-nums">{p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""}</span> },
          { header: "Expires", cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{p.expiresAt ? formatDateTime(p.expiresAt) : "Never"}</span> },
          { header: "Status", cell: (p) => <StatusBadge status={p.isActive ? "ACTIVE" : "DRAFT"} /> },
          { header: "", cell: (p) => <ActionButton action={togglePromoCode.bind(null, p.id)} label={p.isActive ? "Deactivate" : "Activate"} variant="ghost" /> },
        ]}
      />
    </>
  );
}

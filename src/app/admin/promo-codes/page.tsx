import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { DataTable, EmptyState, PageHeader, StatusBadge } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { PromoForm } from "@/components/kit/promo-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { adminTogglePromo, createCampaignPromo } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Promo Code Management" };

export default async function AdminPromoPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const [promos, categories] = await Promise.all([
    db.promoCode.findMany({ include: { organization: { select: { name: true } }, event: { select: { title: true } }, category: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Promo Code Management" description="Platform campaigns are funded by Tixora and work across organizers. Organizer codes are shown below too." />
      <PromoForm action={createCampaignPromo} title="New platform campaign" categories={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <DataTable
        rows={promos}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={Tags} title="No promo codes yet" />}
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
          { header: "Funded by", cell: (p) => p.organization?.name ?? "Tixora" },
          { header: "Scope", cell: (p) => <span className="line-clamp-1 min-w-28">{p.event?.title ?? p.category?.name ?? "All events"}</span> },
          { header: "Used", cell: (p) => <span className="tabular-nums">{p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""}</span> },
          { header: "Expires", cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{p.expiresAt ? formatDateTime(p.expiresAt) : "Never"}</span> },
          { header: "Status", cell: (p) => <StatusBadge status={p.isActive ? "ACTIVE" : "DRAFT"} /> },
          { header: "", cell: (p) => <ActionButton action={adminTogglePromo.bind(null, p.id)} label={p.isActive ? "Deactivate" : "Activate"} variant="ghost" /> },
        ]}
      />
    </>
  );
}

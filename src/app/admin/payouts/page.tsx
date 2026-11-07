import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { DASH_PAGE_SIZE, DataTable, EmptyState, ListToolbar, PageHeader, Pagination, StatusBadge, pageOf, pagesOf, textParam } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { updatePayout } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db, Prisma } from "@/server/db";
import { PayoutStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Payout Management" };

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRolePage(["SUPER_ADMIN"]);
  const params = await searchParams;
  const status = textParam(params, "status");
  const q = textParam(params, "q");
  const page = pageOf(params);
  const where: Prisma.PayoutWhereInput = {
    ...(status && status in PayoutStatus ? { status: status as PayoutStatus } : {}),
    ...(q ? { organization: { name: { contains: q, mode: "insensitive" } } } : {}),
  };
  const [payouts, total] = await Promise.all([
    db.payout.findMany({ where, include: { organization: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DASH_PAGE_SIZE, take: DASH_PAGE_SIZE }),
    db.payout.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Payout Management" description="Tixora doesn't send money automatically. Make the transfer, then record its reference here." />
      <ListToolbar path="/admin/payouts" q={q} placeholder="Organizer" filters={[{ name: "status", label: "Status", value: status, options: Object.keys(PayoutStatus).map((s) => ({ value: s, label: humanize(s) })) }]} />
      <DataTable
        rows={payouts}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={Banknote} title="No payouts found" />}
        columns={[
          { header: "Organizer", cell: (p) => <span className="font-medium">{p.organization.name}</span> },
          { header: "Amount", cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatMoney(p.amountMinor, p.currency)}</span> },
          {
            header: "Pay to",
            cell: (p) => (
              <div className="min-w-36">
                <p>{p.method}</p>
                <p className="text-xs text-muted-foreground">
                  {p.accountName}, {p.accountNumber}
                </p>
              </div>
            ),
          },
          { header: "Requested", cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</span> },
          { header: "Reference", cell: (p) => p.reference ?? p.note ?? "-" },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          {
            header: "",
            className: "text-right",
            cell: (p) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {p.status === "REQUESTED" && <ActionButton action={updatePayout.bind(null, p.id, "APPROVED")} label="Approve" />}
                {(p.status === "REQUESTED" || p.status === "APPROVED") && <ActionButton action={updatePayout.bind(null, p.id, "PAID")} label="Mark paid" variant="default" confirm="Only do this once the money has been sent." reasonLabel="Transfer reference" />}
                {(p.status === "REQUESTED" || p.status === "APPROVED") && <ActionButton action={updatePayout.bind(null, p.id, "REJECTED")} label="Reject" variant="ghost" confirm="The amount returns to the organizer's balance." reasonLabel="Reason" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination path="/admin/payouts" params={params} page={page} pages={pagesOf(total)} />
    </>
  );
}

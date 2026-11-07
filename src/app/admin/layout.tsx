import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Tixora Admin" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRolePage(["SUPER_ADMIN"], "/admin");
  const [approvals, refunds, payouts, reviewPayments] = await Promise.all([
    db.event.count({ where: { status: "PENDING_APPROVAL" } }),
    db.refund.count({ where: { status: { in: ["REQUESTED", "FAILED"] } } }),
    db.payout.count({ where: { status: "REQUESTED" } }),
    db.payment.count({ where: { status: "REVIEW" } }),
  ]);
  return (
    <DashboardShell variant="admin" title="Platform admin" subtitle="Tixora admin" user={{ name: user.name, email: user.email }} badges={{ "/admin/approvals": approvals, "/admin/refunds": refunds, "/admin/payouts": payouts, "/admin/payments": reviewPayments }}>
      {children}
    </DashboardShell>
  );
}

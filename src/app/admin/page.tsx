import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, Building2, CalendarDays, ClipboardCheck, Landmark, RotateCcw, Ticket, Users, Wallet } from "lucide-react";
import { ColumnChart } from "@/components/charts/charts";
import { DataTable, PageHeader, Panel, StatTile, StatusBadge } from "@/components/kit";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireRolePage } from "@/server/auth/guards";
import { adminOverview, monthlyRevenue } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Dashboard" };

function QueueLink({ href, icon: Icon, label, count }: { href: string; icon: typeof Users; label: string; count: number }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-white/20 hover:bg-accent">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-display text-xl font-semibold">{count}</span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const [overview, monthly] = await Promise.all([adminOverview(), monthlyRevenue()]);
  return (
    <>
      <PageHeader title="Dashboard" description="The whole platform at a glance." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total users" value={overview.users} icon={Users} />
        <StatTile label="Total organizers" value={overview.organizers} icon={Building2} />
        <StatTile label="Total events" value={overview.events} icon={CalendarDays} />
        <StatTile label="Tickets sold" value={overview.tickets} icon={Ticket} />
        <StatTile label="Gross booking value" value={formatMoney(overview.grossMinor)} icon={Wallet} />
        <StatTile label="Platform revenue" value={formatMoney(overview.platformRevenueMinor)} hint={`${formatMoney(overview.feesMinor)} fees + ${formatMoney(overview.commissionsMinor)} commission`} icon={Landmark} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QueueLink href="/admin/approvals" icon={ClipboardCheck} label="Pending event approvals" count={overview.pendingEvents} />
        <QueueLink href="/admin/payouts?status=REQUESTED" icon={Banknote} label="Pending payout requests" count={overview.pendingPayouts} />
        <QueueLink href="/admin/refunds?status=REQUESTED" icon={RotateCcw} label="Refunds to process" count={overview.pendingRefunds} />
        <QueueLink href="/admin/payments?status=REVIEW" icon={AlertTriangle} label="Payments needing review" count={overview.reviewPayments} />
      </div>
      <Panel title="Revenue analytics" description="Ticket revenue per month, last 12 months" className="mt-4">
        <ColumnChart data={monthly.map((d) => ({ label: d.label, value: d.revenueMinor }))} format="money" valueLabel="Revenue" ariaLabel="Monthly ticket revenue across the platform" />
      </Panel>
      <h2 className="mb-3 mt-6 text-base font-semibold">Recent transactions</h2>
      <DataTable
        rows={overview.recentTransactions}
        rowKey={(p) => p.id}
        columns={[
          { header: "Booking", cell: (p) => <Link href={`/orders/${p.booking.reference}`} className="font-medium text-brand-glow hover:underline">{p.booking.reference}</Link> },
          { header: "Event", cell: (p) => <span className="line-clamp-1 min-w-36">{p.booking.event.title}</span> },
          { header: "Amount", cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatMoney(p.amountMinor, p.currency)}</span> },
          { header: "Method", cell: (p) => p.method ?? p.gateway },
          { header: "Date", cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</span> },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
        ]}
      />
    </>
  );
}

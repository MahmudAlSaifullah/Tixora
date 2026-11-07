import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus, Clock, ReceiptText, Ticket, Users, Wallet } from "lucide-react";
import { LineChart, RankedBars } from "@/components/charts/charts";
import { DataTable, EmptyState, PageHeader, Panel, StatTile, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireOrgPage } from "@/server/auth/guards";
import { dailySales, organizerOverview, ticketTypePerformance } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Overview" };

export default async function OrganizerDashboardPage() {
  const { organization } = await requireOrgPage();
  const [overview, daily, types] = await Promise.all([organizerOverview(organization.id), dailySales(organization.id), ticketTypePerformance(organization.id, 6)]);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`How ${organization.name} is doing.`}
        actions={
          <Button asChild>
            <Link href="/organizer/events/new">
              <CalendarPlus /> Create event
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total events" value={overview.events} icon={CalendarDays} />
        <StatTile label="Tickets sold" value={overview.tickets} icon={Ticket} />
        <StatTile label="Total revenue" value={formatMoney(overview.grossMinor)} hint={`${formatMoney(overview.netMinor)} after commission`} icon={Wallet} />
        <StatTile label="Attendees checked in" value={overview.attendees} icon={Users} />
        <StatTile label="Pending payments" value={overview.pendingPayments} icon={Clock} />
        <StatTile label="Upcoming events" value={overview.upcoming.length} icon={ReceiptText} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Sales performance" description="Ticket revenue per day, last 30 days">
          <LineChart data={daily.map((d) => ({ label: d.label, value: d.revenueMinor }))} format="money" valueLabel="Revenue" ariaLabel="Ticket revenue per day for the last 30 days" />
        </Panel>
        <Panel title="Ticket category performance" description="Revenue by category">
          <RankedBars format="money" rows={types.map((t) => ({ label: t.name, sublabel: t.event, value: t.revenueMinor }))} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Upcoming events">
          {overview.upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No upcoming events" description="Create an event to start selling tickets." />
          ) : (
            <ul className="divide-y">
              {overview.upcoming.map((event) => {
                const sold = event.ticketTypes.reduce((sum, t) => sum + (t.inventory?.sold ?? 0), 0);
                const total = event.ticketTypes.reduce((sum, t) => sum + (t.inventory?.total ?? 0), 0);
                return (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/organizer/events/${event.id}/edit`} className="block truncate text-sm font-medium hover:underline">
                        {event.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(event.startsAt)}
                        {event.venue ? ` · ${event.venue.city}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {sold.toLocaleString("en-IN")}/{total.toLocaleString("en-IN")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <div className="min-w-0">
          <h2 className="mb-3 text-base font-semibold">Recent orders</h2>
          <DataTable
            rows={overview.recentOrders}
            rowKey={(o) => o.id}
            empty={<EmptyState icon={ReceiptText} title="No orders yet" />}
            columns={[
              { header: "Order", cell: (o) => <span className="font-medium">{o.reference}</span> },
              { header: "Event", cell: (o) => <span className="line-clamp-1 min-w-32">{o.event.title}</span> },
              { header: "Total", cell: (o) => <span className="whitespace-nowrap tabular-nums">{formatMoney(o.totalMinor, o.currency)}</span> },
              { header: "Confirmed", cell: (o) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.confirmedAt)}</span> },
              { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
        </div>
      </div>
    </>
  );
}

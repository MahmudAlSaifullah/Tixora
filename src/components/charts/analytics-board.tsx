import { Download } from "lucide-react";
import { Panel, StatTile } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { attendanceRate, conversionFunnel, dailySales, eventPerformance, monthlyRevenue, paymentMethodDistribution, ticketTypePerformance, weeklySales } from "@/server/services/analytics";
import { EXPORT_URLS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { ColumnChart, LineChart, Meter, RankedBars, SegmentedBar } from "./charts";

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** The analytics screen. organizationId scopes every query; omit it only on admin pages. */
export async function AnalyticsBoard({ organizationId }: { organizationId?: string }) {
  const [daily, weekly, monthly, types, events, methods, funnel, attendance] = await Promise.all([
    dailySales(organizationId),
    weeklySales(organizationId),
    monthlyRevenue(organizationId),
    ticketTypePerformance(organizationId),
    eventPerformance(organizationId),
    paymentMethodDistribution(organizationId),
    conversionFunnel(organizationId),
    attendanceRate(organizationId),
  ]);
  const ticketsLast30 = daily.reduce((sum, d) => sum + d.tickets, 0);
  const revenueLast30 = daily.reduce((sum, d) => sum + d.revenueMinor, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={EXPORT_URLS.sales}>
            <Download /> Sales CSV
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={EXPORT_URLS.attendees}>
            <Download /> Attendees CSV
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Tickets, last 30 days" value={ticketsLast30} />
        <StatTile label="Ticket revenue, last 30 days" value={formatMoney(revenueLast30)} />
        <StatTile label="Booking conversion" value={pct(funnel.rate)} hint={`${funnel.confirmed} of ${funnel.started} checkouts`} />
        <StatTile label="Attendance rate" value={pct(attendance.rate)} hint={`${attendance.used} of ${attendance.issued} at completed events`} />
      </div>

      <Panel title="Daily ticket sales" description="Tickets sold per day, last 30 days">
        <LineChart data={daily.map((d) => ({ label: d.label, value: d.tickets }))} format="count" valueLabel="Tickets" ariaLabel={`Daily ticket sales, ${ticketsLast30} tickets in the last 30 days`} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Weekly ticket sales" description="Tickets sold per week, last 12 weeks">
          <ColumnChart data={weekly.map((d) => ({ label: d.label, value: d.tickets }))} format="count" valueLabel="Tickets" ariaLabel="Weekly ticket sales for the last 12 weeks" />
        </Panel>
        <Panel title="Monthly revenue" description="Ticket revenue per month, last 12 months">
          <ColumnChart data={monthly.map((d) => ({ label: d.label, value: d.revenueMinor }))} format="money" valueLabel="Revenue" ariaLabel="Monthly ticket revenue for the last 12 months" />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Ticket category performance" description="Revenue by ticket category">
          <RankedBars format="money" rows={types.map((t) => ({ label: t.name, sublabel: t.event, value: t.revenueMinor, display: `${formatMoney(t.revenueMinor)} · ${t.tickets} sold` }))} />
        </Panel>
        <Panel title="Event performance" description="Revenue by event, with tickets sold against capacity">
          <RankedBars format="money" rows={events.map((e) => ({ label: e.title, value: e.revenueMinor, display: `${formatMoney(e.revenueMinor)} · ${e.tickets}/${e.capacity}` }))} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Payment methods" description="Share of successfully paid amounts">
          <SegmentedBar format="money" parts={methods.map((m) => ({ label: m.method, value: m.amountMinor }))} />
        </Panel>
        <Panel title="Booking conversion" description="From starting checkout to a confirmed booking">
          <RankedBars
            format="count"
            emptyText="No checkouts yet."
            rows={
              funnel.started
                ? [
                    { label: "Checkouts started", value: funnel.started },
                    { label: "Reached payment", value: funnel.paymentStarted },
                    { label: "Confirmed", value: funnel.confirmed },
                  ]
                : []
            }
          />
          <div className="mt-5">
            <p className="mb-1.5 flex justify-between text-sm">
              <span>Attendance at completed events</span>
              <span className="tabular-nums text-muted-foreground">{pct(attendance.rate)}</span>
            </p>
            <Meter ratio={attendance.rate} label="Attendance rate" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

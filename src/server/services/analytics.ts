import { db, Prisma } from "../db";

// All analytics take an optional organizationId. Organizer screens always pass their own, so a
// query cannot reach another organizer's numbers. Day boundaries use Bangladesh time.

const PAID_STATUSES = ["CONFIRMED", "PARTIALLY_REFUNDED"] as const;
const paidSql = Prisma.sql`('CONFIRMED', 'PARTIALLY_REFUNDED')`;

const scoped = (organizationId?: string) =>
  organizationId ? Prisma.sql`AND b."organizationId" = ${organizationId}` : Prisma.empty;

export interface SeriesPoint {
  label: string;
  bucket: string;
  tickets: number;
  revenueMinor: number;
}

async function salesSeries(unit: "day" | "week" | "month", steps: number, organizationId?: string): Promise<SeriesPoint[]> {
  const interval = Prisma.raw(`'1 ${unit}'`);
  const unitSql = Prisma.raw(`'${unit}'`);
  const rows = await db.$queryRaw<{ bucket: Date; tickets: bigint; revenue: bigint }[]>`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${unitSql}, now() AT TIME ZONE 'Asia/Dhaka') - (${steps - 1} * interval ${interval}),
        date_trunc(${unitSql}, now() AT TIME ZONE 'Asia/Dhaka'),
        interval ${interval}
      ) AS bucket
    ),
    sales AS (
      SELECT date_trunc(${unitSql}, b."confirmedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka') AS bucket,
             SUM(i.quantity) AS tickets,
             SUM(i."lineTotalMinor") AS revenue
      FROM "Booking" b JOIN "BookingItem" i ON i."bookingId" = b.id
      WHERE b.status IN ${paidSql} ${scoped(organizationId)}
      GROUP BY 1
    )
    SELECT buckets.bucket, COALESCE(sales.tickets, 0)::bigint AS tickets, COALESCE(sales.revenue, 0)::bigint AS revenue
    FROM buckets LEFT JOIN sales USING (bucket)
    ORDER BY buckets.bucket`;

  const label =
    unit === "month"
      ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
      : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return rows.map((row) => {
    const bucket = new Date(row.bucket);
    return { bucket: bucket.toISOString(), label: label.format(bucket), tickets: Number(row.tickets), revenueMinor: Number(row.revenue) };
  });
}

export const dailySales = (organizationId?: string, days = 30) => salesSeries("day", days, organizationId);
export const weeklySales = (organizationId?: string, weeks = 12) => salesSeries("week", weeks, organizationId);
export const monthlyRevenue = (organizationId?: string, months = 12) => salesSeries("month", months, organizationId);

export async function ticketTypePerformance(organizationId?: string, limit = 8) {
  const rows = await db.$queryRaw<{ name: string; event: string; tickets: bigint; revenue: bigint }[]>`
    SELECT i."ticketTypeName" AS name, e.title AS event, SUM(i.quantity)::bigint AS tickets, SUM(i."lineTotalMinor")::bigint AS revenue
    FROM "BookingItem" i
    JOIN "Booking" b ON b.id = i."bookingId"
    JOIN "Event" e ON e.id = b."eventId"
    WHERE b.status IN ${paidSql} ${scoped(organizationId)}
    GROUP BY 1, 2
    ORDER BY revenue DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, event: r.event, tickets: Number(r.tickets), revenueMinor: Number(r.revenue) }));
}

export async function eventPerformance(organizationId?: string, limit = 8) {
  const rows = await db.$queryRaw<{ id: string; title: string; tickets: bigint; revenue: bigint; capacity: bigint; used: bigint }[]>`
    SELECT e.id, e.title,
      COALESCE(s.tickets, 0)::bigint AS tickets,
      COALESCE(s.revenue, 0)::bigint AS revenue,
      COALESCE(c.capacity, 0)::bigint AS capacity,
      (SELECT COUNT(*) FROM "Ticket" t WHERE t."eventId" = e.id AND t.status = 'USED')::bigint AS used
    FROM "Event" e
    LEFT JOIN LATERAL (
      SELECT SUM(i.quantity) AS tickets, SUM(i."lineTotalMinor") AS revenue
      FROM "Booking" b JOIN "BookingItem" i ON i."bookingId" = b.id
      WHERE b."eventId" = e.id AND b.status IN ${paidSql}
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT SUM(inv.total) AS capacity FROM "TicketType" t JOIN "TicketInventory" inv ON inv."ticketTypeId" = t.id
      WHERE t."eventId" = e.id AND t."isActive" = true
    ) c ON true
    WHERE e.status IN ('PUBLISHED', 'SOLD_OUT', 'COMPLETED')
      ${organizationId ? Prisma.sql`AND e."organizationId" = ${organizationId}` : Prisma.empty}
    ORDER BY revenue DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, title: r.title, tickets: Number(r.tickets), revenueMinor: Number(r.revenue), capacity: Number(r.capacity), used: Number(r.used) }));
}

export async function paymentMethodDistribution(organizationId?: string) {
  const rows = await db.$queryRaw<{ method: string; count: bigint; amount: bigint }[]>`
    SELECT COALESCE(p.method, p.gateway) AS method, COUNT(*)::bigint AS count, SUM(p."amountMinor")::bigint AS amount
    FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId"
    WHERE p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED') ${scoped(organizationId)}
    GROUP BY 1
    ORDER BY amount DESC`;
  return rows.map((r) => ({ method: r.method, count: Number(r.count), amountMinor: Number(r.amount) }));
}

export async function conversionFunnel(organizationId?: string) {
  const where = organizationId ? { organizationId } : {};
  const [started, paymentStarted, confirmed] = await Promise.all([
    db.booking.count({ where }),
    db.booking.count({ where: { ...where, payments: { some: {} } } }),
    db.booking.count({ where: { ...where, status: { in: [...PAID_STATUSES, "REFUNDED"] } } }),
  ]);
  return { started, paymentStarted, confirmed, rate: started ? confirmed / started : 0 };
}

export async function attendanceRate(organizationId?: string) {
  const where = {
    status: { in: ["VALID", "USED"] as ("VALID" | "USED")[] },
    event: { status: "COMPLETED" as const, ...(organizationId ? { organizationId } : {}) },
  };
  const [issued, used] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.count({ where: { ...where, status: "USED" } }),
  ]);
  return { issued, used, rate: issued ? used / issued : 0 };
}

export async function organizerOverview(organizationId: string) {
  const now = new Date();
  const [events, tickets, revenue, attendees, pendingPayments, upcoming, recentOrders] = await Promise.all([
    db.event.count({ where: { organizationId } }),
    db.ticket.count({ where: { event: { organizationId }, status: { in: ["VALID", "USED"] } } }),
    db.platformCommission.aggregate({ _sum: { grossMinor: true, organizerNetMinor: true }, where: { organizationId } }),
    db.ticket.count({ where: { event: { organizationId }, status: "USED" } }),
    db.booking.count({ where: { organizationId, status: "PENDING", expiresAt: { gt: now } } }),
    db.event.findMany({
      where: { organizationId, status: { in: ["PUBLISHED", "SOLD_OUT"] }, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { venue: { select: { city: true } }, ticketTypes: { select: { inventory: true } } },
    }),
    db.booking.findMany({
      where: { organizationId, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      orderBy: { confirmedAt: "desc" },
      take: 6,
      include: { event: { select: { title: true } }, items: { select: { quantity: true } } },
    }),
  ]);
  return {
    events,
    tickets,
    grossMinor: revenue._sum.grossMinor ?? 0,
    netMinor: revenue._sum.organizerNetMinor ?? 0,
    attendees,
    pendingPayments,
    upcoming,
    recentOrders,
  };
}

export async function adminOverview() {
  const [users, organizers, events, tickets, totals, commission, pendingEvents, pendingPayouts, pendingRefunds, reviewPayments, recentTransactions] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.event.count(),
    db.ticket.count({ where: { status: { in: ["VALID", "USED"] } } }),
    db.booking.aggregate({ _sum: { totalMinor: true, platformFeeMinor: true }, where: { status: { in: [...PAID_STATUSES] } } }),
    db.platformCommission.aggregate({ _sum: { amountMinor: true } }),
    db.event.count({ where: { status: "PENDING_APPROVAL" } }),
    db.payout.count({ where: { status: "REQUESTED" } }),
    db.refund.count({ where: { status: { in: ["REQUESTED", "FAILED"] } } }),
    db.payment.count({ where: { status: "REVIEW" } }),
    db.payment.findMany({
      where: { status: { not: "INITIATED" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { booking: { select: { reference: true, event: { select: { title: true } } } } },
    }),
  ]);
  const fees = totals._sum.platformFeeMinor ?? 0;
  const commissions = commission._sum.amountMinor ?? 0;
  return {
    users,
    organizers,
    events,
    tickets,
    grossMinor: totals._sum.totalMinor ?? 0,
    platformRevenueMinor: fees + commissions,
    feesMinor: fees,
    commissionsMinor: commissions,
    pendingEvents,
    pendingPayouts,
    pendingRefunds,
    reviewPayments,
    recentTransactions,
  };
}

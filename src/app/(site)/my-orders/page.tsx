import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { DataTable, EmptyState, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireUserPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "My Orders" };

export default async function MyOrdersPage() {
  const user = await requireUserPage("/my-orders");
  const bookings = await db.booking.findMany({
    where: { userId: user.id },
    include: { event: { select: { title: true } }, items: { select: { quantity: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-3xl font-semibold">My Orders</h1>
      <DataTable
        rows={bookings}
        rowKey={(b) => b.id}
        empty={
          <EmptyState
            icon={ReceiptText}
            title="No orders yet"
            description="Your booking history will appear here."
            action={
              <Button asChild>
                <Link href="/events">Explore events</Link>
              </Button>
            }
          />
        }
        columns={[
          {
            header: "Order",
            cell: (b) => (
              <Link href={`/orders/${b.reference}`} className="font-medium text-brand-glow hover:underline">
                {b.reference}
              </Link>
            ),
          },
          { header: "Event", cell: (b) => <span className="line-clamp-1 min-w-40">{b.event.title}</span> },
          { header: "Tickets", cell: (b) => b.items.reduce((sum, i) => sum + i.quantity, 0) },
          { header: "Total", cell: (b) => <span className="whitespace-nowrap tabular-nums">{b.totalMinor === 0 ? "Free" : formatMoney(b.totalMinor, b.currency)}</span> },
          { header: "Date", cell: (b) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(b.createdAt)}</span> },
          { header: "Status", cell: (b) => <StatusBadge status={b.status} /> },
        ]}
      />
    </div>
  );
}

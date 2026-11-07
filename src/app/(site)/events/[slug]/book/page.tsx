import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { getCurrentUser } from "@/server/auth/guards";
import { availableOf } from "@/server/services/booking";
import { getPublicEvent } from "@/server/services/catalog";
import { formatDate, formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Book tickets" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ items?: string }> };

export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { items } = await searchParams;
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  if (event.status !== "PUBLISHED") redirect(`/events/${slug}`);

  const user = await getCurrentUser();
  if (!user && !event.guestCheckout) {
    const back = `/events/${slug}/book${items ? `?items=${encodeURIComponent(items)}` : ""}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const now = Date.now();
  const tickets = event.ticketTypes
    .filter((t) => (!t.salesStartAt || t.salesStartAt.getTime() <= now) && (!t.salesEndAt || t.salesEndAt.getTime() >= now))
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      priceMinor: t.priceMinor,
      available: availableOf(t.inventory),
      minPerOrder: t.minPerOrder,
      maxPerOrder: t.maxPerOrder,
    }));

  const initial: Record<string, number> = {};
  for (const pair of (items ?? "").split(",")) {
    const [id, quantity] = pair.split(":");
    const ticket = tickets.find((t) => t.id === id);
    const value = Number(quantity);
    if (ticket && Number.isInteger(value) && value > 0) initial[id] = Math.min(value, ticket.maxPerOrder, ticket.available);
  }

  return (
    <BookingWizard
      event={{
        id: event.id,
        slug: event.slug,
        title: event.title,
        currency: event.currency,
        when: `${formatDate(event.startsAt, event.timezone)}, ${formatTime(event.startsAt, event.timezone)}`,
        venue: event.mode === "ONLINE" ? "Online event" : event.venue ? `${event.venue.name}, ${event.venue.city}` : "To be announced",
        coverImageUrl: event.coverImageUrl,
      }}
      tickets={tickets}
      initialQuantities={initial}
      user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
    />
  );
}

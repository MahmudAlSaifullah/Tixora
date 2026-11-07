import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Ticket as TicketIcon } from "lucide-react";
import { Cover } from "@/components/events/cover";
import { EmptyState, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { dateParts, formatTime } from "@/lib/dates";
import { requireUserPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "My Tickets" };

export default async function MyTicketsPage() {
  const user = await requireUserPage("/my-tickets");
  const tickets = await db.ticket.findMany({
    where: { booking: { userId: user.id } },
    include: { attendee: true, ticketType: true, event: { include: { venue: true } } },
    orderBy: { event: { startsAt: "asc" } },
  });
  const now = Date.now();
  const isLive = (t: (typeof tickets)[number]) => (t.event.endsAt?.getTime() ?? t.event.startsAt?.getTime() ?? 0) >= now && t.status === "VALID";
  const upcoming = tickets.filter(isLive);
  const past = tickets.filter((t) => !isLive(t)).reverse();

  const renderList = (items: typeof tickets) => (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((ticket) => {
        const date = dateParts(ticket.event.startsAt, ticket.event.timezone);
        return (
          <li key={ticket.id} className="min-w-0">
            <Link href={`/tickets/${ticket.code}`} className="flex min-w-0 overflow-hidden rounded-xl border bg-card transition hover:border-white/20">
              <div className="relative w-24 shrink-0 sm:w-28">
                <Cover src={ticket.event.coverImageUrl} alt="" sizes="112px" />
                <div className="absolute inset-0 grid place-items-center bg-background/55 text-center leading-none">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider">{date.month}</p>
                    <p className="font-display text-2xl font-semibold">{date.day}</p>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{ticket.event.title}</h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatTime(ticket.event.startsAt, ticket.event.timezone)} · {ticket.event.venue?.name ?? "Online"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {ticket.attendee.name} · {ticket.ticketType.name}
                  </p>
                  <StatusBadge status={ticket.status} className="mt-2" />
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold">My Tickets</h1>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Upcoming</h2>
      {upcoming.length ? (
        renderList(upcoming)
      ) : (
        <EmptyState
          icon={TicketIcon}
          title="No upcoming tickets"
          description="When you book an event, your tickets will show up here."
          action={
            <Button asChild>
              <Link href="/events">Explore events</Link>
            </Button>
          }
        />
      )}
      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-semibold">Past and inactive</h2>
          {renderList(past)}
        </>
      )}
    </div>
  );
}

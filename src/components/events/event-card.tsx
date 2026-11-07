import Link from "next/link";
import { CalendarDays, FlaskConical, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateParts, formatDate, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { EventCard as Card } from "@/server/services/catalog";
import { Cover } from "./cover";

function priceLabel(event: Card) {
  if (event.startingPriceMinor === null) return "TBA";
  return event.startingPriceMinor === 0 ? "Free" : formatMoney(event.startingPriceMinor, event.currency);
}

function DemoTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur" title="Sample data for demonstration">
      <FlaskConical className="size-3" aria-hidden /> Demo
    </span>
  );
}

function Availability({ event }: { event: Card }) {
  if (event.status === "COMPLETED") return <span className="text-xs text-muted-foreground">Event ended</span>;
  if (event.status === "SOLD_OUT" || event.available === 0) return <span className="text-xs font-medium text-warning">Sold out</span>;
  if (event.almostGone) return <span className="text-xs font-medium text-warning">Almost gone</span>;
  return null;
}

/** The grid card: photo on top, a perforated tear line, and a price stub below. */
export function EventCard({ event, priority }: { event: Card; priority?: boolean }) {
  const date = dateParts(event.startsAt, event.timezone);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-white/20">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Cover src={event.coverImageUrl} alt="" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" priority={priority} className="transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute left-3 top-3 grid w-12 place-items-center rounded-lg bg-background/85 py-1.5 leading-none backdrop-blur">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-glow">{date.month}</span>
          <span className="mt-0.5 font-display text-lg font-semibold">{date.day}</span>
        </div>
        <div className="absolute right-3 top-3 flex gap-1.5">{event.isDemo && <DemoTag />}</div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-brand-glow">{event.category}</p>
        <h3 className="mt-1 line-clamp-2 text-[1.02rem] font-semibold leading-snug">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0">
            {event.title}
          </Link>
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          {date.weekday}, {formatTime(event.startsAt, event.timezone)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {event.venue}
            {event.city ? `, ${event.city}` : ""}
          </span>
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">By {event.organizer}</p>
      </div>
      <div className="perforated flex items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-[11px] text-muted-foreground">From</p>
          <p className="font-display font-semibold">{priceLabel(event)}</p>
        </div>
        <Availability event={event} />
      </div>
    </article>
  );
}

/** The wide stub used for Featured Events: photo left, details and action right. */
export function FeaturedEventCard({ event, priority }: { event: Card; priority?: boolean }) {
  const soldOut = event.status === "SOLD_OUT" || event.available === 0;
  return (
    <article className="flex w-[86vw] max-w-[640px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card sm:w-[600px] sm:flex-row">
      <div className="relative aspect-[16/9] sm:aspect-auto sm:w-[46%]">
        <Cover src={event.coverImageUrl} alt="" sizes="(min-width: 640px) 280px, 86vw" priority={priority} />
        <div className="absolute left-3 top-3">{event.isDemo && <DemoTag />}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <p className="text-xs font-medium text-brand-glow">{event.category}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">
          <Link href={`/events/${event.slug}`} className="hover:underline">
            {event.title}
          </Link>
        </h3>
        <dl className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <dd>
              {formatDate(event.startsAt, event.timezone)}, {formatTime(event.startsAt, event.timezone)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <dd className="truncate">
              {event.venue}
              {event.city ? `, ${event.city}` : ""}
            </dd>
          </div>
        </dl>
        <p className="mt-2 truncate text-xs text-muted-foreground">By {event.organizer}</p>
        <div className={cn("perforated mt-auto flex items-center justify-between gap-3 pt-4 [--notch:var(--background)] sm:mt-4 sm:[&::before]:hidden")}>
          <div>
            <p className="text-[11px] text-muted-foreground">From</p>
            <p className="font-display text-lg font-semibold">{priceLabel(event)}</p>
          </div>
          <Button asChild variant={soldOut ? "secondary" : "default"}>
            <Link href={`/events/${event.slug}`}>{soldOut ? "View event" : "Book Now"}</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function EventGrid({ events }: { events: Card[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((event, index) => (
        <EventCard key={event.id} event={event} priority={index < 4} />
      ))}
    </div>
  );
}

export function EventGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="aspect-[16/10] animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

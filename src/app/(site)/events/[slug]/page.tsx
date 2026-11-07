import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Baby, CalendarDays, Clock, FlaskConical, Globe, MapPin, Star, Users } from "lucide-react";
import { Cover } from "@/components/events/cover";
import { EventCard } from "@/components/events/event-card";
import { ReviewForm } from "@/components/events/review-form";
import { ShareButtons } from "@/components/events/share-buttons";
import { TicketSelector, type SelectableTicket } from "@/components/events/ticket-selector";
import { formatDate, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { initials } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { availableOf } from "@/server/services/booking";
import { getPublicEvent, getRelatedEvents } from "@/server/services/catalog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug);
  if (!event) return { title: "Event not found" };
  return {
    title: event.title,
    description: event.shortDescription,
    openGraph: { title: event.title, description: event.shortDescription, images: event.coverImageUrl ? [event.coverImageUrl] : undefined },
  };
}

/** Plain text, split into paragraphs. React escapes it, so no organizer text can inject markup. */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function InfoRow({ icon: Icon, title, children }: { icon: typeof CalendarDays; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand-glow">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function EventDetailPage({ params }: Props) {
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();

  const [related, user] = await Promise.all([getRelatedEvents(event), getCurrentUser()]);
  // A view count is a popularity hint and may safely be lost.
  void db.event.update({ where: { id: event.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);

  const tz = event.timezone;
  const now = Date.now();
  const tickets: SelectableTicket[] = event.ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    description: t.description,
    priceMinor: t.priceMinor,
    currency: t.currency,
    available: availableOf(t.inventory),
    minPerOrder: t.minPerOrder,
    maxPerOrder: t.maxPerOrder,
    perUserLimit: t.perUserLimit,
    salesStartAt: t.salesStartAt?.toISOString() ?? null,
    salesEndAt: t.salesEndAt?.toISOString() ?? null,
    saleState: t.salesStartAt && t.salesStartAt.getTime() > now ? "NOT_STARTED" : t.salesEndAt && t.salesEndAt.getTime() < now ? "ENDED" : "ON_SALE",
  }));
  const prices = tickets.map((t) => t.priceMinor);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const isEnded = event.status === "COMPLETED" || (event.endsAt ? event.endsAt.getTime() < now : false);
  const isCancelled = event.status === "CANCELLED";
  const onSale = event.status === "PUBLISHED" && !isEnded;
  const schedule = (event.schedule as { time: string; title: string }[]) ?? [];

  const averageRating = event.reviews.length ? event.reviews.reduce((sum, r) => sum + r.rating, 0) / event.reviews.length : null;
  const canReview = user && isEnded
    ? (await db.ticket.count({ where: { eventId: event.id, status: "USED", booking: { userId: user.id } } })) > 0 && !event.reviews.some((r) => r.userId === user.id)
    : false;

  return (
    <article>
      <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden sm:h-[52vh] lg:h-[56vh]">
        <Cover src={event.coverImageUrl} alt={event.title} sizes="100vw" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="relative mx-auto -mt-28 max-w-7xl px-4 sm:-mt-36 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events?category=${event.category.slug}`} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            {event.category.name}
          </Link>
          {event.isDemo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-medium backdrop-blur">
              <FlaskConical className="size-3" aria-hidden /> Demo event: sample data
            </span>
          )}
        </div>
        <h1 className="mt-3 max-w-4xl text-balance text-3xl font-bold leading-tight sm:text-5xl">{event.title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground sm:text-lg">{event.shortDescription}</p>

        {isCancelled && (
          <div role="alert" className="mt-5 flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
            <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
            This event has been cancelled. Ticket holders are being refunded and will be notified by email.
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px] lg:items-start">
          <div className="min-w-0 space-y-10">
            <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2">
              <InfoRow icon={CalendarDays} title={formatDate(event.startsAt, tz)}>
                {event.endsAt && formatDate(event.endsAt, tz) !== formatDate(event.startsAt, tz) ? `Until ${formatDate(event.endsAt, tz)}` : "Bangladesh time"}
              </InfoRow>
              <InfoRow icon={Clock} title={`${formatTime(event.startsAt, tz)}${event.endsAt ? ` to ${formatTime(event.endsAt, tz)}` : ""}`}>
                Doors and schedule below
              </InfoRow>
              {event.mode === "ONLINE" ? (
                <InfoRow icon={Globe} title="Online event">
                  The link is shared with ticket holders
                </InfoRow>
              ) : (
                <InfoRow icon={MapPin} title={event.venue?.name ?? "Venue to be announced"}>
                  {event.venue ? `${event.venue.address}, ${event.venue.city}` : "Details coming soon"}
                </InfoRow>
              )}
              <InfoRow icon={Users} title={`Organized by ${event.organizerName ?? event.organization.name}`}>
                <Link href={`/organizers/${event.organization.slug}`} className="hover:text-foreground hover:underline">
                  View organizer
                </Link>
              </InfoRow>
              {event.ageRestriction && (
                <InfoRow icon={Baby} title="Age restriction">
                  {event.ageRestriction}
                </InfoRow>
              )}
            </section>

            <div className="lg:hidden" id="tickets-mobile">
              <TicketSelector eventSlug={event.slug} tickets={tickets} onSale={onSale} statusLabel={isCancelled ? "Cancelled" : isEnded ? "Event ended" : event.status === "SOLD_OUT" ? "Sold out" : null} />
            </div>

            <section>
              <h2 className="mb-3 text-xl font-semibold">About this event</h2>
              <Prose text={event.description} />
            </section>

            {event.images.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Gallery</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {event.images.map((image) => (
                    <div key={image.id} className="relative aspect-[4/3] overflow-hidden rounded-lg">
                      <Cover src={image.url} alt={image.alt ?? event.title} sizes="(min-width: 640px) 240px, 45vw" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {schedule.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Schedule</h2>
                <ol className="overflow-hidden rounded-xl border bg-card">
                  {schedule.map((item, index) => (
                    <li key={index} className="flex gap-4 border-b p-4 last:border-b-0">
                      <span className="w-20 shrink-0 text-sm font-medium text-brand-glow">{item.time}</span>
                      <span className="text-sm">{item.title}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(event.rules || event.instructions) && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Event rules</h2>
                <Prose text={[event.rules, event.instructions].filter(Boolean).join("\n\n")} />
              </section>
            )}

            {(event.terms || event.refundPolicy) && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Terms and conditions</h2>
                {event.refundPolicy && (
                  <div className="mb-3">
                    <h3 className="mb-1 text-sm font-semibold">Refund policy</h3>
                    <Prose text={event.refundPolicy} />
                  </div>
                )}
                {event.terms && <Prose text={event.terms} />}
              </section>
            )}

            {(event.reviews.length > 0 || canReview) && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                  Reviews
                  {averageRating !== null && (
                    <span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                      <Star className="size-4 fill-warning text-warning" aria-hidden /> {averageRating.toFixed(1)} from {event.reviews.length}
                    </span>
                  )}
                </h2>
                {canReview && <ReviewForm eventId={event.id} />}
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {event.reviews.map((review) => (
                    <li key={review.id} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">{initials(review.user.name)}</span>
                        <span className="text-sm font-medium">{review.user.name}</span>
                        <span className="ml-auto inline-flex items-center gap-1 text-sm">
                          <Star className="size-3.5 fill-warning text-warning" aria-hidden /> {review.rating}
                        </span>
                      </div>
                      {review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="hidden lg:sticky lg:top-20 lg:block">
            <TicketSelector eventSlug={event.slug} tickets={tickets} onSale={onSale} statusLabel={isCancelled ? "Cancelled" : isEnded ? "Event ended" : event.status === "SOLD_OUT" ? "Sold out" : null} />
            <div className="mt-4 rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Share this event</p>
              <ShareButtons url={`${env.appUrl}/events/${event.slug}`} title={event.title} />
            </div>
          </aside>
        </div>

        <div className="mt-8 rounded-xl border bg-card p-4 lg:hidden">
          <p className="mb-2 text-sm font-medium">Share this event</p>
          <ShareButtons url={`${env.appUrl}/events/${event.slug}`} title={event.title} />
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 text-2xl font-semibold">You might also like</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <EventCard key={item.id} event={item} />
              ))}
            </div>
          </section>
        )}
      </div>

      {onSale && startingPrice !== null && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <p className="text-[11px] text-muted-foreground">From</p>
            <p className="font-display font-semibold">{startingPrice === 0 ? "Free" : formatMoney(startingPrice, event.currency)}</p>
          </div>
          <a href="#tickets-mobile" className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">
            Book Tickets
          </a>
        </div>
      )}
    </article>
  );
}

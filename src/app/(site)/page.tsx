import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, QrCode, ScanLine, ShieldCheck, Smartphone, Ticket, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/events/category-icon";
import { EventCard, FeaturedEventCard } from "@/components/events/event-card";
import { EventsNearYou } from "@/components/site/events-near-you";
import { HeroSearch } from "@/components/site/hero-search";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { EmptyState } from "@/components/kit";
import { getEventCities, getEventsNear, getHomepageData } from "@/server/services/catalog";

function SectionHeading({ title, description, href }: { title: string; description?: string; href?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="hidden shrink-0 items-center gap-1 text-sm font-medium text-brand-glow hover:underline sm:inline-flex">
          View all <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

const STEPS = [
  { icon: Ticket, title: "Find your event", text: "Search by city, date, category or price, and see what is on near you." },
  { icon: CreditCard, title: "Book in minutes", text: "Your seats are held while you check out with a card, bKash or Nagad." },
  { icon: QrCode, title: "Get your QR ticket", text: "Tickets arrive by email and stay in your account, ready to download." },
  { icon: ScanLine, title: "Scan and walk in", text: "Show the code at the gate. It works once, so your ticket stays yours." },
];

const REASONS = [
  { icon: ShieldCheck, title: "Payment you can trust", text: "Every payment is verified directly with the gateway before a ticket is issued." },
  { icon: Zap, title: "No overselling", text: "Live inventory holds your seats while you pay. If it says available, it is." },
  { icon: Smartphone, title: "Built for your phone", text: "Book, pay and carry your tickets from any phone, with or without printing." },
  { icon: BadgeCheck, title: "Reviewed events", text: "Our team reviews events before they go on sale, so you know who you are buying from." },
];

export default async function HomePage() {
  const [data, cities, nearDhaka] = await Promise.all([getHomepageData(), getEventCities(), getEventsNear("Dhaka")]);

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Image src="/demo/covers/concert1.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
        <div className="hero-grain absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:pt-36">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            {data.liveEventCount} {data.liveEventCount === 1 ? "event" : "events"} on sale across Bangladesh
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-[2.6rem] font-bold leading-[1.05] sm:text-6xl lg:text-7xl">Find Your Next Experience.</h1>
          <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg">From stadium nights to weekend workshops, discover what is happening near you and book your place in minutes.</p>
          <HeroSearch categories={data.categories.map((c) => ({ value: c.slug, label: c.name }))} cities={cities} />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 pt-6 sm:space-y-20 sm:px-6">
        {data.featured.length > 0 && (
          <section aria-labelledby="featured">
            <SectionHeading title="Featured Events" description="Hand-picked by the Tixora team." href="/events" />
            <div className="scroll-rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
              {data.featured.map((event, index) => (
                <FeaturedEventCard key={event.id} event={event} priority={index === 0} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="categories">
          <SectionHeading title="Browse by Category" href="/categories" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.categories.map((category) => (
              <Link key={category.id} href={`/events?category=${category.slug}`} className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-white/20 hover:bg-accent">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand-glow">
                  <CategoryIcon name={category.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{category.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {category.eventCount} {category.eventCount === 1 ? "event" : "events"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="trending">
          <SectionHeading title="Trending Events" description="What people are booking right now." href="/events?sort=popular" />
          {data.trending.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.trending.slice(0, 4).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Ticket} title="No events yet" description="New events are added all the time. Check back soon." />
          )}
        </section>

        <section aria-labelledby="upcoming">
          <SectionHeading title="Upcoming Events" description="Coming up soon. Get in early." href="/events" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {data.upcoming.slice(0, 4).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>

        <EventsNearYou initialCity="Dhaka" initialEvents={nearDhaka} cities={cities} />

        <section aria-labelledby="how">
          <SectionHeading title="How Tixora Works" />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between">
                  <step.icon className="size-6 text-brand-glow" aria-hidden />
                  <span className="font-display text-3xl font-semibold text-white/10">{index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="why" className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Why Choose Tixora</h2>
            <p className="mt-2 text-muted-foreground">Ticketing should be the easy part of going out.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="size-4" aria-hidden /> Cards, bKash and Nagad
            </div>
          </div>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {REASONS.map((reason) => (
              <div key={reason.title} className="flex gap-3">
                <reason.icon className="mt-0.5 size-5 shrink-0 text-brand-glow" aria-hidden />
                <div>
                  <h3 className="font-semibold">{reason.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{reason.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="relative isolate overflow-hidden rounded-2xl border" aria-labelledby="organizer-cta">
          <Image src="/demo/covers/conf1.jpg" alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-primary/30" />
          <div className="max-w-xl p-7 sm:p-12">
            <h2 id="organizer-cta" className="text-2xl font-semibold sm:text-4xl">Running an event? Sell out with Tixora.</h2>
            <p className="mt-3 text-muted-foreground">Create your event, set your ticket categories, track sales live and check guests in with any phone.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/organizers">Start selling tickets</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid items-center gap-6 rounded-2xl border bg-card p-7 sm:p-10 lg:grid-cols-2" aria-labelledby="newsletter">
          <div>
            <h2 id="newsletter" className="text-2xl font-semibold">Hear about events first</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Early-bird releases and new events, a few times a month. Unsubscribe any time.</p>
          </div>
          <NewsletterForm />
        </section>
      </div>
    </>
  );
}

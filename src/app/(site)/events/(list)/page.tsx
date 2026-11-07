import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { EventGrid, EventGridSkeleton } from "@/components/events/event-card";
import { EventFiltersForm } from "@/components/events/event-filters";
import { EmptyState, Pagination } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { getCategories, getEventCities, parseEventFilters, searchEvents, type EventFilters } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Explore Events" };

type Params = Record<string, string | string[] | undefined>;

async function Results({ filters, params }: { filters: EventFilters; params: Params }) {
  const result = await searchEvents(filters);
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground" role="status">
        {result.total} {result.total === 1 ? "event" : "events"} found
      </p>
      {result.events.length ? (
        <EventGrid events={result.events} />
      ) : (
        <EmptyState
          icon={SearchX}
          title="No events match your filters"
          description="Try removing a filter or searching for something else."
          action={
            <Button asChild variant="secondary">
              <Link href="/events">Clear all filters</Link>
            </Button>
          }
        />
      )}
      <Pagination path="/events" params={params} page={result.page} pages={result.pages} />
    </>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filters = parseEventFilters(params);
  const [categories, cities] = await Promise.all([getCategories(), getEventCities()]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold sm:text-4xl">Explore Events</h1>
      <p className="mt-2 text-muted-foreground">Concerts, marathons, festivals, workshops and more across Bangladesh.</p>
      <EventFiltersForm filters={filters} categories={categories.map((c) => ({ value: c.slug, label: c.name }))} cities={cities} />
      {/* Keyed on the query, so each new search shows skeletons instead of stale results. */}
      <Suspense key={JSON.stringify(filters)} fallback={<EventGridSkeleton />}>
        <Results filters={filters} params={params} />
      </Suspense>
    </div>
  );
}

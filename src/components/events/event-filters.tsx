import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Field, NativeSelect } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventFilters } from "@/server/services/catalog";

/** A GET form using a native disclosure, so every filter is a shareable URL with no JavaScript needed. */
export function EventFiltersForm({ filters, categories, cities }: { filters: EventFilters; categories: { value: string; label: string }[]; cities: string[] }) {
  const advancedOpen = Boolean(filters.from || filters.to || filters.minPrice !== undefined || filters.maxPrice !== undefined);
  return (
    <form action="/events" role="search" className="my-6 rounded-xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px_150px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="Search by title or organizer" aria-label="Search by title" className="pl-9" />
        </div>
        <NativeSelect name="category" defaultValue={filters.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="city" defaultValue={filters.city ?? ""} aria-label="Location">
          <option value="">All locations</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="when" defaultValue={filters.when ?? "upcoming"} aria-label="Status">
          <option value="upcoming">Upcoming</option>
          <option value="ongoing">Happening now</option>
          <option value="completed">Completed</option>
          <option value="all">All events</option>
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={filters.sort ?? "date"} aria-label="Sort by">
          <option value="date">Sort: date</option>
          <option value="popular">Sort: popular</option>
          <option value="newest">Sort: newest</option>
        </NativeSelect>
      </div>
      <details className="group mt-3" open={advancedOpen}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <SlidersHorizontal className="size-4" aria-hidden /> Date and price
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="From" htmlFor="from">
            <Input id="from" type="date" name="from" defaultValue={filters.from} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" type="date" name="to" defaultValue={filters.to} />
          </Field>
          <Field label="Min price (৳)" htmlFor="minPrice">
            <Input id="minPrice" type="number" min={0} name="minPrice" defaultValue={filters.minPrice} inputMode="numeric" />
          </Field>
          <Field label="Max price (৳)" htmlFor="maxPrice">
            <Input id="maxPrice" type="number" min={0} name="maxPrice" defaultValue={filters.maxPrice} inputMode="numeric" />
          </Field>
        </div>
      </details>
      <div className="mt-3 flex gap-2">
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="ghost">
          <Link href="/events">Reset</Link>
        </Button>
      </div>
    </form>
  );
}

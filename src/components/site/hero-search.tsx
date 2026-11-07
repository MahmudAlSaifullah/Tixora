import { MapPin, Search, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";

const selectClass = "h-12 w-full appearance-none rounded-lg bg-transparent pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&>option]:bg-popover";

/** A plain GET form, so search works before JavaScript has loaded. */
export function HeroSearch({ categories, cities }: { categories: { value: string; label: string }[]; cities: string[] }) {
  return (
    <form action="/events" role="search" className="mt-8 grid max-w-4xl gap-1 rounded-2xl border border-white/15 bg-card/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl md:grid-cols-[1fr_170px_170px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input name="q" placeholder="Search events, artists, organizers" aria-label="Search events" className="h-12 w-full rounded-lg bg-transparent pl-9 pr-3 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="relative border-t border-white/10 md:border-l md:border-t-0">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <select name="city" aria-label="Location" defaultValue="" className={selectClass}>
          <option value="">All locations</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>
      <div className="relative border-t border-white/10 md:border-l md:border-t-0">
        <Shapes className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <select name="category" aria-label="Category" defaultValue="" className={selectClass}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="lg" className="h-12 rounded-xl px-6">
        Explore Events
      </Button>
    </form>
  );
}

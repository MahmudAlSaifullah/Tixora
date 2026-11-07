"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { EventCard } from "@/components/events/event-card";
import { EmptyState, NativeSelect } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { CITY_COORDS } from "@/lib/constants";
import { getJson } from "@/lib/client-api";
import type { EventCard as Card } from "@/server/services/catalog";

function nearestCity(latitude: number, longitude: number) {
  let best = "Dhaka";
  let bestDistance = Infinity;
  for (const [city, [lat, lng]] of Object.entries(CITY_COORDS)) {
    const distance = (lat - latitude) ** 2 + (lng - longitude) ** 2;
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

export function EventsNearYou({ initialCity, initialEvents, cities }: { initialCity: string; initialEvents: Card[]; cities: string[] }) {
  const [city, setCity] = useState(initialCity);
  const [events, setEvents] = useState(initialEvents);
  const [pending, startTransition] = useTransition();
  const options = [...new Set([initialCity, ...cities])].sort();

  function load(next: string) {
    setCity(next);
    startTransition(async () => {
      try {
        const data = await getJson<{ events: Card[] }>(`/api/events/near?city=${encodeURIComponent(next)}`);
        setEvents(data.events);
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  function locate() {
    if (!navigator.geolocation) return toast.error("Your browser cannot share your location.");
    navigator.geolocation.getCurrentPosition(
      (position) => load(nearestCity(position.coords.latitude, position.coords.longitude)),
      () => toast.error("We couldn't get your location. Please choose a city instead."),
      { timeout: 8000 },
    );
  }

  return (
    <section aria-label="Events near you">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">Events Near You</h2>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">Happening in {city}.</p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect value={city} onChange={(e) => load(e.target.value)} aria-label="Choose a city" className="w-40">
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" onClick={locate}>
            <LocateFixed /> <span className="hidden sm:inline">Use my location</span>
          </Button>
        </div>
      </div>
      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {events.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={MapPin}
            title={`Nothing on in ${city} right now`}
            description="Try another city, or browse everything on sale."
            action={
              <Button asChild variant="secondary">
                <Link href="/events">
                  Browse all events <ArrowRight />
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}

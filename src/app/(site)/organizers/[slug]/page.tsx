import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarX, ExternalLink } from "lucide-react";
import { EventGrid } from "@/components/events/event-card";
import { Cover } from "@/components/events/cover";
import { EmptyState } from "@/components/kit";
import { initials } from "@/lib/utils";
import { getOrganizerProfile } from "@/server/services/catalog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getOrganizerProfile((await params).slug);
  return { title: profile?.name ?? "Organizer" };
}

export default async function OrganizerProfilePage({ params }: Props) {
  const profile = await getOrganizerProfile((await params).slug);
  if (!profile) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="relative grid size-16 place-items-center overflow-hidden rounded-xl bg-primary/20 font-display text-xl font-semibold">
          {profile.logoUrl ? <Cover src={profile.logoUrl} alt="" sizes="64px" /> : initials(profile.name)}
        </span>
        <div>
          <h1 className="text-3xl font-semibold">{profile.name}</h1>
          <p className="text-sm text-muted-foreground">{profile.city}</p>
        </div>
        {profile.website && (
          <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="ml-auto inline-flex items-center gap-1 text-sm text-brand-glow hover:underline">
            Website <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      {profile.description && <p className="mt-4 max-w-3xl text-muted-foreground">{profile.description}</p>}
      <h2 className="mb-4 mt-10 text-xl font-semibold">Events</h2>
      {profile.events.length ? <EventGrid events={profile.events} /> : <EmptyState icon={CalendarX} title="No public events yet" />}
    </div>
  );
}

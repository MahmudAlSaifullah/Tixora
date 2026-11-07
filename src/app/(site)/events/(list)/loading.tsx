import { EventGridSkeleton } from "@/components/events/event-card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-3 h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="mb-8 h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
      <EventGridSkeleton />
    </div>
  );
}

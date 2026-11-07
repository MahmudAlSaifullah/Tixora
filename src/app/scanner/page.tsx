import { CalendarOff } from "lucide-react";
import { EmptyState } from "@/components/kit";
import { ScannerApp } from "@/components/scanner/scanner-app";
import { formatDateTime } from "@/lib/dates";
import { requireRolePage } from "@/server/auth/guards";
import { scannableEvents } from "@/server/services/checkin";

export default async function ScannerPage() {
  const user = await requireRolePage(["SCANNER", "ORGANIZER", "SUPER_ADMIN"], "/scanner");
  const events = await scannableEvents({ id: user.id, role: user.role });
  if (events.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={CalendarOff} title="No events assigned" description="When an organizer assigns you to an event, it will appear here." />
      </div>
    );
  }
  return (
    <ScannerApp
      events={events.map((event) => ({
        id: event.id,
        title: event.title,
        when: formatDateTime(event.startsAt),
        place: event.venue ? `${event.venue.name}, ${event.venue.city}` : "Online",
        gate: event.staff[0]?.gate ?? "",
      }))}
    />
  );
}

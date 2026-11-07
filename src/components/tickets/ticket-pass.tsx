import { CalendarDays, Clock, Download, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TicketWithRelations } from "@/server/services/tickets";
import { ticketToken } from "@/server/services/tickets";
import { qrSvg } from "@/server/tickets/qr";

const VOID_MESSAGE: Record<string, string> = {
  CANCELLED: "This ticket has been cancelled and can't be used for entry.",
  REFUNDED: "This ticket was refunded and can't be used for entry.",
  PENDING: "This ticket isn't active yet.",
};

/** The digital ticket: event details, a tear line, and the QR stub. */
export async function TicketPass({ ticket, guestToken }: { ticket: TicketWithRelations; guestToken?: string | null }) {
  const event = ticket.event;
  const tz = event.timezone;
  const showQr = ticket.status === "VALID" || ticket.status === "USED";
  // The SVG comes from our own QR library and contains no user text, so it is safe to inline.
  const svg = showQr ? await qrSvg(ticketToken(ticket)) : null;
  const guest = guestToken ? `?t=${encodeURIComponent(guestToken)}` : "";

  return (
    <article className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border bg-card [--notch:var(--background)]">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-sm font-bold tracking-[0.2em]">TIXORA</p>
          <StatusBadge status={ticket.status} />
        </div>
        <h1 className="mt-4 text-xl font-semibold leading-snug">{event.title}</h1>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden /> {formatDate(event.startsAt, tz)}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden /> {formatTime(event.startsAt, tz)}
          </li>
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {event.mode === "ONLINE" ? "Online event" : event.venue ? `${event.venue.name}, ${event.venue.city}` : "To be announced"}
          </li>
        </ul>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Attendee</dt>
            <dd className="font-medium">{ticket.attendee.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ticket</dt>
            <dd className="font-medium">{ticket.ticketType.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Booking reference</dt>
            <dd className="font-medium">{ticket.booking.reference}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ticket ID</dt>
            <dd className="font-medium">{ticket.code}</dd>
          </div>
        </dl>
      </div>
      <div className="perforated p-6">
        {svg ? (
          <>
            <div className={cn("qr-frame mx-auto aspect-square w-full max-w-[250px] rounded-2xl bg-white p-3", ticket.status === "USED" && "opacity-30")} role="img" aria-label="Ticket QR code" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-3 text-center text-xs text-muted-foreground">{ticket.status === "USED" ? "This ticket has already been used for entry." : "Turn up your screen brightness at the gate. Each code admits one person, once."}</p>
            <Button asChild variant="outline" className="no-print mt-4 w-full">
              <a href={`/api/tickets/${ticket.code}/pdf${guest}`}>
                <Download /> Download PDF
              </a>
            </Button>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{VOID_MESSAGE[ticket.status]}</p>
        )}
      </div>
    </article>
  );
}

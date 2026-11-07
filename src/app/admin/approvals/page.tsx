import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { Cover } from "@/components/events/cover";
import { EmptyState, PageHeader } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { approveEvent, rejectEvent } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Event Approval" };

export default async function AdminApprovalsPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const events = await db.event.findMany({
    where: { status: "PENDING_APPROVAL" },
    include: { organization: { select: { name: true, status: true } }, category: { select: { name: true } }, venue: true, ticketTypes: { where: { isActive: true }, include: { inventory: true } } },
    orderBy: { submittedAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Event Approval" description="Events go on sale only after they're approved here." />
      {events.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="The queue is clear" description="New submissions will appear here." />
      ) : (
        <ul className="space-y-4">
          {events.map((event) => (
            <li key={event.id} className="overflow-hidden rounded-xl border bg-card md:flex">
              <div className="relative aspect-[16/9] md:aspect-auto md:w-72 md:shrink-0">
                <Cover src={event.coverImageUrl} alt="" sizes="288px" />
              </div>
              <div className="min-w-0 flex-1 p-5">
                <p className="text-xs text-brand-glow">{event.category.name}</p>
                <h2 className="mt-0.5 text-lg font-semibold">{event.title}</h2>
                <p className="text-sm text-muted-foreground">
                  By {event.organization.name} · {formatDateTime(event.startsAt)} · {event.mode === "ONLINE" ? "Online" : `${event.venue?.name}, ${event.venue?.city}`}
                </p>
                <p className="mt-2 text-sm">{event.shortDescription}</p>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Full description and policies</summary>
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">{event.description}</p>
                  {event.rules && <p className="mt-2 whitespace-pre-line text-muted-foreground">Rules: {event.rules}</p>}
                  {event.refundPolicy && <p className="mt-2 whitespace-pre-line text-muted-foreground">Refunds: {event.refundPolicy}</p>}
                </details>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                  {event.ticketTypes.map((t) => (
                    <li key={t.id} className="rounded-full bg-muted px-2.5 py-1">
                      {t.name}: {t.priceMinor === 0 ? "Free" : formatMoney(t.priceMinor)} × {t.inventory?.total ?? 0}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton action={approveEvent.bind(null, event.id)} label="Approve and publish" variant="default" size="default" />
                  <ActionButton action={rejectEvent.bind(null, event.id)} label="Reject" variant="outline" size="default" confirm="The organizer can edit and resubmit." reasonLabel="What needs to change?" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import { db, TX_OPTIONS, type Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { audit } from "../audit";
import { env } from "../env";
import { randomCode } from "../crypto";
import { getSettings } from "../settings";
import { sendEmail } from "../email";
import { eventDraftSchema, eventSubmissionProblems, type EventDraft, type EventDraftInput } from "@/lib/validation";
import { fromDhakaInput, toLocalInput } from "@/lib/dates";
import { toMajor, toMinor } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { notifyAdmins, notifyOrganization } from "./notifications";
import { voidBookingTickets } from "./booking";
import { syncSoldOut } from "./inventory";

async function uniqueSlug(tx: Tx, title: string): Promise<string> {
  const base = slugify(title) || "event";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomCode(4).toLowerCase()}`;
    if (!(await tx.event.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${randomCode(8).toLowerCase()}`;
}

async function syncTicketTypes(tx: Tx, eventId: string, types: EventDraft["ticketTypes"], currency: string) {
  const existing = await tx.ticketType.findMany({ where: { eventId }, include: { inventory: true, _count: { select: { bookingItems: true } } } });
  const keepIds = new Set(types.map((t) => t.id).filter(Boolean));

  for (const old of existing) {
    if (keepIds.has(old.id)) continue;
    // A category with orders is hidden rather than deleted, so order history stays intact.
    if (old._count.bookingItems > 0) await tx.ticketType.update({ where: { id: old.id }, data: { isActive: false } });
    else await tx.ticketType.delete({ where: { id: old.id } });
  }

  for (const [index, input] of types.entries()) {
    const data = {
      name: input.name,
      kind: input.kind,
      description: input.description,
      priceMinor: toMinor(input.price),
      currency,
      salesStartAt: fromDhakaInput(input.salesStartAt),
      salesEndAt: fromDhakaInput(input.salesEndAt),
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      perUserLimit: input.perUserLimit ?? null,
      sortOrder: index,
      isActive: true,
    };
    const current = input.id ? existing.find((t) => t.id === input.id) : undefined;
    if (current) {
      const committed = (current.inventory?.sold ?? 0) + (current.inventory?.reserved ?? 0);
      if (input.total < committed) {
        throw badRequest(`${input.name}: quantity cannot go below the ${committed} tickets already sold or held.`, "INVENTORY_TOO_LOW");
      }
      await tx.ticketType.update({ where: { id: current.id }, data });
      await tx.ticketInventory.upsert({
        where: { ticketTypeId: current.id },
        update: { total: input.total },
        create: { ticketTypeId: current.id, total: input.total },
      });
    } else {
      await tx.ticketType.create({ data: { ...data, eventId, inventory: { create: { total: input.total } } } });
    }
  }
}

/** Creates or updates an event. The organization comes from the caller's verified membership. */
export async function saveEvent(organizationId: string, actorId: string, rawInput: EventDraftInput, eventId?: string) {
  const input = eventDraftSchema.parse(rawInput);
  const category = await db.eventCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
  if (!category) throw badRequest("Choose a valid category.");

  return db.$transaction(async (tx) => {
    const existing = eventId ? await tx.event.findFirst({ where: { id: eventId, organizationId } }) : null;
    if (eventId && !existing) throw notFound("Event not found.");
    if (existing && (existing.status === "COMPLETED" || existing.status === "CANCELLED" || existing.status === "SUSPENDED")) {
      throw conflict("This event can no longer be edited.");
    }

    let venueId: string | null = null;
    if (input.mode === "OFFLINE" && input.venueName && input.venueCity) {
      const venueData = { name: input.venueName, address: input.venueAddress ?? "", city: input.venueCity, organizationId };
      venueId = existing?.venueId
        ? (await tx.venue.update({ where: { id: existing.venueId }, data: venueData })).id
        : (await tx.venue.create({ data: venueData })).id;
    }

    const data = {
      title: input.title,
      categoryId: input.categoryId,
      shortDescription: input.shortDescription,
      description: input.description,
      organizerName: input.organizerName,
      coverImageUrl: input.coverImageUrl,
      organizerLogoUrl: input.organizerLogoUrl,
      mode: input.mode,
      onlineUrl: input.mode === "ONLINE" ? input.onlineUrl : null,
      startsAt: fromDhakaInput(input.startsAt),
      endsAt: fromDhakaInput(input.endsAt),
      venueId,
      schedule: input.schedule,
      rules: input.rules,
      terms: input.terms,
      refundPolicy: input.refundPolicy,
      ageRestriction: input.ageRestriction,
      instructions: input.instructions,
      guestCheckout: input.guestCheckout,
    };

    const event = existing
      ? await tx.event.update({ where: { id: existing.id }, data })
      : await tx.event.create({ data: { ...data, slug: await uniqueSlug(tx, input.title), organizationId, status: "DRAFT" } });

    await tx.eventImage.deleteMany({ where: { eventId: event.id } });
    if (input.galleryUrls.length) {
      await tx.eventImage.createMany({ data: input.galleryUrls.map((url, sortOrder) => ({ eventId: event.id, url, sortOrder, alt: input.title })) });
    }
    await syncTicketTypes(tx, event.id, input.ticketTypes, event.currency);
    await syncSoldOut(tx, event.id);
    await audit({ actorId, action: existing ? "event.update" : "event.create", entity: "Event", entityId: event.id }, tx);
    return event;
  }, TX_OPTIONS);
}

/** Converts a stored event back into wizard form values. */
export async function eventToDraft(organizationId: string, eventId: string): Promise<(EventDraftInput & { id: string; status: string; slug: string; rejectionReason: string | null }) | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId },
    include: { venue: true, images: { orderBy: { sortOrder: "asc" } }, ticketTypes: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { inventory: true } } },
  });
  if (!event) return null;
  return {
    id: event.id,
    slug: event.slug,
    status: event.status,
    rejectionReason: event.rejectionReason,
    title: event.title,
    categoryId: event.categoryId,
    shortDescription: event.shortDescription,
    description: event.description,
    organizerName: event.organizerName,
    coverImageUrl: event.coverImageUrl,
    organizerLogoUrl: event.organizerLogoUrl,
    galleryUrls: event.images.map((image) => image.url),
    mode: event.mode,
    onlineUrl: event.onlineUrl,
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    venueName: event.venue?.name ?? "",
    venueAddress: event.venue?.address ?? "",
    venueCity: event.venue?.city ?? "Dhaka",
    schedule: event.schedule as { time: string; title: string }[],
    rules: event.rules,
    terms: event.terms,
    refundPolicy: event.refundPolicy,
    ageRestriction: event.ageRestriction,
    instructions: event.instructions,
    guestCheckout: event.guestCheckout,
    ticketTypes: event.ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      description: t.description,
      price: toMajor(t.priceMinor),
      total: t.inventory?.total ?? 0,
      salesStartAt: toLocalInput(t.salesStartAt) || null,
      salesEndAt: toLocalInput(t.salesEndAt) || null,
      minPerOrder: t.minPerOrder,
      maxPerOrder: t.maxPerOrder,
      perUserLimit: t.perUserLimit,
    })),
  };
}

/** Sends a complete draft to the approval queue, or publishes it if approval is switched off. */
export async function submitEvent(organizationId: string, actorId: string, eventId: string) {
  const draft = await eventToDraft(organizationId, eventId);
  if (!draft) throw notFound("Event not found.");
  if (draft.status !== "DRAFT" && draft.status !== "REJECTED") throw conflict("Only drafts and rejected events can be submitted.");
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (organization.status !== "APPROVED") {
    throw conflict("Your organizer account must be approved before you can publish events.", "ORG_NOT_APPROVED");
  }
  const problems = eventSubmissionProblems(eventDraftSchema.parse(draft));
  const startsAt = fromDhakaInput(draft.startsAt);
  if (startsAt && startsAt.getTime() < Date.now()) problems.push("The start date must be in the future.");
  if (problems.length) throw new (await import("../errors")).AppError(422, "EVENT_INCOMPLETE", problems[0], problems);

  const { requireEventApproval } = await getSettings();
  const now = new Date();
  await db.event.update({
    where: { id: eventId },
    data: requireEventApproval
      ? { status: "PENDING_APPROVAL", submittedAt: now, rejectionReason: null }
      : { status: "PUBLISHED", submittedAt: now, publishedAt: now, rejectionReason: null },
  });
  await audit({ actorId, action: "event.submit", entity: "Event", entityId: eventId });
  if (requireEventApproval) {
    await notifyAdmins({ type: "EVENT", title: "Event awaiting approval", body: draft.title, link: "/admin/approvals" });
  }
  return requireEventApproval ? "PENDING_APPROVAL" : "PUBLISHED";
}

async function emailOrganizerOwners(organizationId: string, send: (owner: { name: string; email: string }) => Promise<void>) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ["OWNER", "MANAGER"] } },
    select: { user: { select: { name: true, email: true } } },
  });
  for (const member of members) await send(member.user);
}

export async function reviewEvent(adminId: string, eventId: string, decision: { approve: boolean; reason?: string | null }) {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found.");
  const gate = await db.event.updateMany({
    where: { id: eventId, status: "PENDING_APPROVAL" },
    data: decision.approve
      ? { status: "PUBLISHED", publishedAt: new Date(), approvedById: adminId, rejectionReason: null }
      : { status: "REJECTED", rejectionReason: decision.reason ?? "Needs changes" },
  });
  if (gate.count !== 1) throw conflict("This event is no longer awaiting approval.");
  await audit({ actorId: adminId, action: decision.approve ? "event.approve" : "event.reject", entity: "Event", entityId: eventId, metadata: { reason: decision.reason } });
  await notifyOrganization(event.organizationId, {
    type: "EVENT",
    title: decision.approve ? "Event approved" : "Event needs changes",
    body: decision.approve ? `${event.title} is now live.` : `${event.title}: ${decision.reason ?? "Please review and resubmit."}`,
    link: decision.approve ? `/events/${event.slug}` : `/organizer/events/${event.id}/edit`,
  });
  await emailOrganizerOwners(event.organizationId, (owner) =>
    sendEmail("eventApproval", owner.email, {
      name: owner.name,
      event: event.title,
      approved: decision.approve,
      reason: decision.reason,
      url: decision.approve ? `${env.appUrl}/events/${event.slug}` : `${env.appUrl}/organizer/events/${event.id}/edit`,
    }),
  );
}

export async function setEventSuspended(adminId: string, eventId: string, suspended: boolean, reason?: string) {
  const gate = await db.event.updateMany({
    where: { id: eventId, status: suspended ? { in: ["PUBLISHED", "SOLD_OUT", "PENDING_APPROVAL"] } : "SUSPENDED" },
    data: { status: suspended ? "SUSPENDED" : "PUBLISHED", rejectionReason: suspended ? reason ?? null : null },
  });
  if (gate.count !== 1) throw conflict("This event cannot change to that status.");
  await audit({ actorId: adminId, action: suspended ? "event.suspend" : "event.unsuspend", entity: "Event", entityId: eventId, metadata: { reason } });
}

/**
 * Cancels an event: voids all tickets, releases unpaid holds, and opens a refund for every paid
 * booking, which admins then process. Emails go out after the transaction commits.
 */
export async function cancelEvent(actorId: string, eventId: string, reason: string, scope?: { organizationId: string }) {
  const affected = await db.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id: eventId, ...(scope ? { organizationId: scope.organizationId } : {}) } });
    if (!event) throw notFound("Event not found.");
    if (event.status === "CANCELLED" || event.status === "COMPLETED") throw conflict("This event cannot be cancelled.");
    await tx.event.update({ where: { id: eventId }, data: { status: "CANCELLED" } });

    const { releaseBooking } = await import("./booking");
    const pending = await tx.booking.findMany({ where: { eventId, status: "PENDING" }, select: { id: true } });
    for (const booking of pending) await releaseBooking(tx, booking.id, "CANCELLED");

    const confirmed = await tx.booking.findMany({
      where: { eventId, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
      include: { payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } }, refunds: { where: { status: { in: ["REQUESTED", "PROCESSING"] } } } },
    });
    for (const booking of confirmed) {
      await voidBookingTickets(tx, booking.id, "CANCELLED");
      const payment = booking.payments[0];
      if (!payment) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      } else if (booking.refunds.length === 0 && payment.amountMinor > payment.refundedMinor) {
        await tx.refund.create({
          data: { paymentId: payment.id, bookingId: booking.id, amountMinor: payment.amountMinor - payment.refundedMinor, reason: `Event cancelled: ${reason}`, requestedById: actorId },
        });
      }
    }
    await audit({ actorId, action: "event.cancel", entity: "Event", entityId: eventId, metadata: { reason, bookings: confirmed.length } }, tx);
    return { event, bookings: confirmed };
  }, TX_OPTIONS);

  for (const booking of affected.bookings) {
    await sendEmail("eventCancellation", booking.contactEmail, { name: booking.contactName, event: affected.event.title, reference: booking.reference, reason });
    if (booking.userId) {
      await db.notification.create({
        data: { userId: booking.userId, type: "EVENT", title: "Event cancelled", body: `${affected.event.title} was cancelled.`, link: `/orders/${booking.reference}` },
      });
    }
  }
}

/** Marks events past their end date as completed. Run from cron. */
export async function completeFinishedEvents() {
  const result = await db.event.updateMany({
    where: { status: { in: ["PUBLISHED", "SOLD_OUT"] }, endsAt: { lt: new Date() } },
    data: { status: "COMPLETED" },
  });
  return result.count;
}

/** Sends one reminder per booking for events starting in the next 24-48 hours. */
export async function sendEventReminders() {
  const now = Date.now();
  const events = await db.event.findMany({
    where: { status: { in: ["PUBLISHED", "SOLD_OUT"] }, startsAt: { gte: new Date(now + 24 * 3_600_000), lte: new Date(now + 48 * 3_600_000) } },
    include: { venue: true },
  });
  const { formatDateTime } = await import("@/lib/dates");
  const { orderUrl, venueLine } = await import("./booking-messages");
  let sent = 0;
  for (const event of events) {
    const bookings = await db.booking.findMany({
      where: { eventId: event.id, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
      include: { user: { select: { notifyReminders: true } } },
    });
    for (const booking of bookings) {
      if (booking.user && !booking.user.notifyReminders) continue;
      // The dedupe key makes reruns of this job harmless.
      const key = `reminder:${booking.id}`;
      const claimed = await db.rateLimit.createMany({ data: [{ key, count: 1, resetAt: new Date(now + 30 * 86_400_000) }], skipDuplicates: true });
      if (claimed.count === 0) continue;
      await sendEmail("eventReminder", booking.contactEmail, {
        name: booking.contactName,
        event: event.title,
        when: formatDateTime(event.startsAt, event.timezone),
        venue: venueLine(event),
        url: orderUrl(booking),
      });
      sent++;
    }
  }
  return sent;
}

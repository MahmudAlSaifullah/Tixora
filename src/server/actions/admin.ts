"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { act, formValues, type ActionState } from "../action-helpers";
import { audit } from "../audit";
import { requireAdmin } from "../auth/guards";
import { db, Prisma, TX_OPTIONS } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { env } from "../env";
import { sendEmail } from "../email";
import { saveSettings, settingsSchema } from "../settings";
import { ensureStaffUser } from "../services/accounts";
import { cancelFreeBooking, cancelPendingBooking } from "../services/booking";
import { cancelEvent, reviewEvent, setEventSuspended } from "../services/event-management";
import { syncSoldOut } from "../services/inventory";
import { notifyOrganization } from "../services/notifications";
import { reconcilePayments } from "../services/payment";
import { completeRefundManually, processRefund, rejectRefund, requestRefund } from "../services/refund";
import { formatMoney, toMinor } from "@/lib/money";
import { fromDhakaInput } from "@/lib/dates";
import { emailSchema, promoInputSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";

const reasonOf = (form: FormData) => z.string().trim().min(3, "Please give a reason.").max(500).parse(form.get("reason"));

// ---- Users ---------------------------------------------------------------------------

export async function setUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED", _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw badRequest("You can't suspend your own account.");
    const reason = status === "SUSPENDED" ? reasonOf(form) : null;
    // Bumping the session version ends a suspended person's sessions straight away.
    await db.user.update({ where: { id: userId }, data: { status, suspendedReason: reason, sessionVersion: { increment: 1 } } });
    await audit({ actorId: admin.id, action: status === "SUSPENDED" ? "user.suspend" : "user.reinstate", entity: "User", entityId: userId, metadata: { reason } });
    revalidatePath("/admin/users");
    return status === "SUSPENDED" ? "User suspended." : "User reinstated.";
  });
}

export async function setUserRole(userId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw badRequest("You can't change your own role.");
    const key = z.enum(["CUSTOMER", "ORGANIZER", "SCANNER", "SUPER_ADMIN"]).parse(form.get("role"));
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    await db.user.update({ where: { id: userId }, data: { roleId: role.id, sessionVersion: { increment: 1 } } });
    await audit({ actorId: admin.id, action: "user.role_change", entity: "User", entityId: userId, metadata: { role: key } });
    revalidatePath("/admin/users");
    return "Role updated. They'll need to log in again.";
  });
}

// ---- Organizers ----------------------------------------------------------------------

export async function setOrganizationStatus(organizationId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED", _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const reason = status === "APPROVED" ? null : reasonOf(form);
    const organization = await db.organization.update({ where: { id: organizationId }, data: { status, statusReason: reason } });
    if (status === "SUSPENDED") {
      await db.event.updateMany({ where: { organizationId, status: { in: ["PUBLISHED", "SOLD_OUT", "PENDING_APPROVAL"] } }, data: { status: "SUSPENDED", rejectionReason: reason } });
    }
    await audit({ actorId: admin.id, action: `organization.${status.toLowerCase()}`, entity: "Organization", entityId: organizationId, metadata: { reason } });
    await notifyOrganization(organizationId, { type: "SYSTEM", title: `Organizer account ${status.toLowerCase()}`, body: reason ?? `${organization.name} can now publish events.`, link: "/organizer/dashboard" });
    revalidatePath("/admin/organizers");
    return `Organizer ${status.toLowerCase()}.`;
  });
}

// ---- Events --------------------------------------------------------------------------

export async function approveEvent(eventId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    await reviewEvent(admin.id, eventId, { approve: true });
    revalidatePath("/admin/approvals");
    return "Event approved and published.";
  });
}

export async function rejectEvent(eventId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    await reviewEvent(admin.id, eventId, { approve: false, reason: reasonOf(form) });
    revalidatePath("/admin/approvals");
    return "Event rejected. The organizer has been told why.";
  });
}

export async function suspendEvent(eventId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    await setEventSuspended(admin.id, eventId, true, reasonOf(form));
    revalidatePath("/admin/events");
    return "Event suspended.";
  });
}

export async function unsuspendEvent(eventId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    await setEventSuspended(admin.id, eventId, false);
    revalidatePath("/admin/events");
    return "Event restored.";
  });
}

export async function adminCancelEvent(eventId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    await cancelEvent(admin.id, eventId, reasonOf(form));
    revalidatePath("/admin/events");
    return "Event cancelled, and refunds have been opened.";
  });
}

export async function toggleEventFeatured(eventId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    const event = await db.event.findUnique({ where: { id: eventId } });
    if (!event) throw notFound();
    await db.event.update({ where: { id: eventId }, data: { isFeatured: !event.isFeatured } });
    await audit({ actorId: admin.id, action: "event.feature", entity: "Event", entityId: eventId, metadata: { featured: !event.isFeatured } });
    revalidatePath("/admin/events");
  });
}

// ---- Tickets and bookings -------------------------------------------------------------

export async function voidTicket(ticketId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const reason = reasonOf(form);
    await db.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw notFound("Ticket not found.");
      const gate = await tx.ticket.updateMany({ where: { id: ticketId, status: "VALID" }, data: { status: "CANCELLED" } });
      if (gate.count !== 1) throw conflict("Only valid tickets can be cancelled.");
      await tx.$executeRaw`UPDATE "TicketInventory" SET "sold" = GREATEST("sold" - 1, 0), "updatedAt" = now() WHERE "ticketTypeId" = ${ticket.ticketTypeId}`;
      await syncSoldOut(tx, ticket.eventId);
      await audit({ actorId: admin.id, action: "ticket.void", entity: "Ticket", entityId: ticketId, metadata: { reason } }, tx);
    }, TX_OPTIONS);
    revalidatePath("/admin/tickets");
    return "Ticket cancelled.";
  });
}

export async function adminCancelBooking(bookingId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const reason = reasonOf(form);
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw notFound("Booking not found.");
    if (booking.status === "PENDING") {
      await cancelPendingBooking(bookingId);
    } else if (booking.status === "CONFIRMED" && booking.totalMinor === 0) {
      await cancelFreeBooking(bookingId, admin.id);
    } else if (booking.status === "CONFIRMED" || booking.status === "PARTIALLY_REFUNDED") {
      // Paid bookings are cancelled by refunding them, so money and tickets can't drift apart.
      await requestRefund({ bookingId, reason, requestedById: admin.id });
      revalidatePath("/admin/bookings");
      return "This booking is paid, so a refund has been opened. Process it under Refunds.";
    } else {
      throw conflict("This booking can't be cancelled.");
    }
    await audit({ actorId: admin.id, action: "booking.cancel", entity: "Booking", entityId: bookingId, metadata: { reason } });
    revalidatePath("/admin/bookings");
    return "Booking cancelled.";
  });
}

// ---- Payments and refunds -------------------------------------------------------------

export async function reconcilePaymentAction(paymentId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    const [result] = await reconcilePayments({ paymentId });
    await audit({ actorId: admin.id, action: "payment.reconcile", entity: "Payment", entityId: paymentId, metadata: { result } });
    revalidatePath("/admin/payments");
    return `Gateway reports: ${result?.status ?? "no result"}.`;
  });
}

export async function approveRefund(refundId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    const refund = await processRefund(refundId, admin.id);
    revalidatePath("/admin/refunds");
    if (refund.status === "FAILED") throw badRequest(refund.adminNote ?? "The refund failed.");
    return refund.status === "COMPLETED" ? "Refund completed." : "The gateway is still processing this refund.";
  });
}

export async function rejectRefundAction(refundId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    await rejectRefund(refundId, admin.id, reasonOf(form));
    revalidatePath("/admin/refunds");
    return "Refund rejected.";
  });
}

export async function completeRefundManuallyAction(refundId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    await completeRefundManually(refundId, admin.id, reasonOf(form));
    revalidatePath("/admin/refunds");
    return "Refund recorded as completed.";
  });
}

export async function openRefund(bookingId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const raw = form.get("amount");
    const amount = raw ? z.coerce.number().positive("Enter a positive amount").parse(raw) : undefined;
    await requestRefund({ bookingId, amountMinor: amount ? toMinor(amount) : undefined, reason: reasonOf(form), requestedById: admin.id });
    revalidatePath("/admin/refunds");
    revalidatePath("/admin/bookings");
    return "Refund opened.";
  });
}

// ---- Commissions and settings ----------------------------------------------------------

export async function setOrganizationCommission(organizationId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const raw = String(form.get("percent") ?? "").trim();
    const commissionBps = raw === "" ? null : Math.round(z.coerce.number().min(0, "Must be 0-50").max(50, "Must be 0-50").parse(raw) * 100);
    await db.organization.update({ where: { id: organizationId }, data: { commissionBps } });
    await audit({ actorId: admin.id, action: "commission.override", entity: "Organization", entityId: organizationId, metadata: { commissionBps } });
    revalidatePath("/admin/commissions");
    return commissionBps === null ? "Now using the platform default." : "Commission updated. It applies to new bookings.";
  });
}

export async function savePlatformSettings(_: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const v = formValues(form);
    const percent = (key: string) => Math.round(Number(v[key] ?? 0) * 100);
    const input = settingsSchema.parse({
      reservationMinutes: Number(v.reservationMinutes),
      platformFeeBps: percent("platformFeePercent"),
      platformFeeFlatMinor: toMinor(Number(v.platformFeeFlat ?? 0)),
      taxBps: percent("taxPercent"),
      commissionBps: percent("commissionPercent"),
      minPayoutMinor: toMinor(Number(v.minPayout ?? 0)),
      requireEventApproval: form.get("requireEventApproval") === "on",
      supportEmail: v.supportEmail,
      supportPhone: v.supportPhone,
      supportAddress: v.supportAddress ?? "",
      socialFacebook: v.socialFacebook ?? "",
      socialInstagram: v.socialInstagram ?? "",
      socialYoutube: v.socialYoutube ?? "",
    });
    await saveSettings(input);
    await audit({ actorId: admin.id, action: "settings.update", entity: "PlatformSetting", metadata: input });
    revalidatePath("/admin/settings");
    return "Settings saved.";
  });
}

// ---- Promotions ------------------------------------------------------------------------

export async function createCampaignPromo(_: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const input = promoInputSchema.parse(formValues(form));
    try {
      const promo = await db.promoCode.create({
        data: {
          code: input.code,
          name: input.name,
          discountType: input.discountType,
          discountValue: input.discountType === "PERCENT" ? Math.round(input.discountValue * 100) : toMinor(input.discountValue),
          maxDiscountMinor: input.maxDiscount ? toMinor(input.maxDiscount) : null,
          categoryId: input.categoryId || null,
          usageLimit: input.usageLimit ?? null,
          perUserLimit: input.perUserLimit ?? null,
          minOrderMinor: input.minOrder ? toMinor(input.minOrder) : 0,
          startsAt: fromDhakaInput(input.startsAt),
          expiresAt: fromDhakaInput(input.expiresAt),
        },
      });
      await audit({ actorId: admin.id, action: "promo.create", entity: "PromoCode", entityId: promo.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("That code is already taken.");
      throw error;
    }
    revalidatePath("/admin/promo-codes");
    return "Campaign created.";
  });
}

export async function adminTogglePromo(promoId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    const promo = await db.promoCode.findUnique({ where: { id: promoId } });
    if (!promo) throw notFound();
    await db.promoCode.update({ where: { id: promoId }, data: { isActive: !promo.isActive } });
    await audit({ actorId: admin.id, action: "promo.toggle", entity: "PromoCode", entityId: promoId });
    revalidatePath("/admin/promo-codes");
  });
}

// ---- Categories ------------------------------------------------------------------------

export async function saveCategory(categoryId: string | null, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const input = z.object({ name: z.string().trim().min(2, "Enter a name").max(60), icon: z.string().max(40).default("Sparkles"), description: z.string().trim().max(200).optional(), sortOrder: z.coerce.number().int().default(0) }).parse(formValues(form));
    try {
      if (categoryId) await db.eventCategory.update({ where: { id: categoryId }, data: input });
      else await db.eventCategory.create({ data: { ...input, slug: slugify(input.name) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("A category with that name already exists.");
      throw error;
    }
    await audit({ actorId: admin.id, action: categoryId ? "category.update" : "category.create", entity: "EventCategory", entityId: categoryId });
    revalidatePath("/admin/categories");
    return "Category saved.";
  });
}

export async function toggleCategory(categoryId: string, _: ActionState) {
  return act(async () => {
    await requireAdmin();
    const category = await db.eventCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw notFound();
    await db.eventCategory.update({ where: { id: categoryId }, data: { isActive: !category.isActive } });
    revalidatePath("/admin/categories");
  });
}

// ---- Payouts ---------------------------------------------------------------------------

export async function updatePayout(payoutId: string, status: "APPROVED" | "PAID" | "REJECTED", _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const note = status === "APPROVED" ? null : reasonOf(form);
    const allowedFrom = status === "PAID" ? ["REQUESTED", "APPROVED"] : status === "APPROVED" ? ["REQUESTED"] : ["REQUESTED", "APPROVED"];
    const gate = await db.payout.updateMany({
      where: { id: payoutId, status: { in: allowedFrom as ("REQUESTED" | "APPROVED")[] } },
      data: { status, processedById: admin.id, processedAt: new Date(), ...(status === "PAID" ? { reference: note } : status === "REJECTED" ? { note } : {}) },
    });
    if (gate.count !== 1) throw conflict("This payout has already been processed.");
    const payout = await db.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { organization: { include: { members: { where: { role: "OWNER" }, include: { user: true } } } } } });
    await audit({ actorId: admin.id, action: `payout.${status.toLowerCase()}`, entity: "Payout", entityId: payoutId, metadata: { note } });
    await notifyOrganization(payout.organizationId, { type: "PAYOUT", title: `Payout ${status.toLowerCase()}`, body: `${formatMoney(payout.amountMinor)}${note ? `: ${note}` : ""}`, link: "/organizer/payouts" });
    for (const member of payout.organization.members) {
      await sendEmail("payoutUpdate", member.user.email, {
        name: member.user.name,
        amount: formatMoney(payout.amountMinor),
        status,
        reference: status === "PAID" ? note : null,
        note: status === "REJECTED" ? note : null,
        url: `${env.appUrl}/organizer/payouts`,
      });
    }
    revalidatePath("/admin/payouts");
    return `Payout ${status.toLowerCase()}.`;
  });
}

// ---- Staff -----------------------------------------------------------------------------

export async function adminAssignStaff(_: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const input = z.object({ eventId: z.string().min(1, "Choose an event"), name: z.string().trim().min(2, "Enter their name").max(80), email: emailSchema, gate: z.string().trim().max(60).optional() }).parse(formValues(form));
    const event = await db.event.findUnique({ where: { id: input.eventId }, include: { organization: { select: { name: true } } } });
    if (!event) throw notFound("Event not found.");
    const user = await ensureStaffUser({ name: input.name, email: input.email, organizationName: event.organization.name, role: "SCANNER" });
    await db.staffAssignment.upsert({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      update: { gate: input.gate || null },
      create: { eventId: event.id, userId: user.id, gate: input.gate || null, assignedById: admin.id },
    });
    await audit({ actorId: admin.id, action: "staff.assign", entity: "StaffAssignment", entityId: user.id, metadata: { eventId: event.id } });
    revalidatePath("/admin/staff");
    return "Staff assigned.";
  });
}

export async function adminRemoveStaff(assignmentId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    await db.staffAssignment.delete({ where: { id: assignmentId } });
    await audit({ actorId: admin.id, action: "staff.remove", entity: "StaffAssignment", entityId: assignmentId });
    revalidatePath("/admin/staff");
  });
}

// ---- CMS -------------------------------------------------------------------------------

const cmsSchema = z.object({
  title: z.string().trim().min(2, "Enter a title").max(160),
  body: z.string().trim().min(2, "Enter some content").max(50_000),
  section: z.enum(["help", "legal", "company"]),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveCmsPage(pageId: string | null, _: ActionState, form: FormData) {
  return act(async () => {
    const admin = await requireAdmin();
    const input = cmsSchema.parse(formValues(form));
    const isPublished = form.get("isPublished") === "on";
    try {
      if (pageId) await db.cmsPage.update({ where: { id: pageId }, data: { ...input, isPublished } });
      else await db.cmsPage.create({ data: { ...input, isPublished, slug: slugify(input.title) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("A page with that title already exists.");
      throw error;
    }
    await audit({ actorId: admin.id, action: pageId ? "cms.update" : "cms.create", entity: "CmsPage", entityId: pageId });
    revalidatePath("/admin/cms");
    return "Page saved.";
  });
}

export async function deleteCmsPage(pageId: string, _: ActionState) {
  return act(async () => {
    const admin = await requireAdmin();
    await db.cmsPage.delete({ where: { id: pageId } });
    await audit({ actorId: admin.id, action: "cms.delete", entity: "CmsPage", entityId: pageId });
    revalidatePath("/admin/cms");
    return "Page deleted.";
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { act, formValues, type ActionState } from "../action-helpers";
import { audit } from "../audit";
import { requireOrg, requireOrgEvent } from "../auth/guards";
import { db, Prisma, TX_OPTIONS } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { getSettings } from "../settings";
import { ensureStaffUser } from "../services/accounts";
import { organizerBalance } from "../services/commission";
import { cancelEvent, submitEvent } from "../services/event-management";
import { notifyAdmins } from "../services/notifications";
import { syncSoldOut } from "../services/inventory";
import { emailSchema, organizationSchema, payoutRequestSchema, promoInputSchema } from "@/lib/validation";
import { fromDhakaInput } from "@/lib/dates";
import { toMinor } from "@/lib/money";

// Every action resolves the organization from the caller's own membership and filters by it, so
// an id from another organizer simply finds nothing.

export async function submitEventAction(eventId: string, _: ActionState) {
  return act(async () => {
    const { user, organization } = await requireOrgEvent(eventId);
    const status = await submitEvent(organization.id, user.id, eventId);
    revalidatePath("/organizer/events");
    return status === "PUBLISHED" ? "Your event is live." : "Submitted for approval.";
  });
}

export async function cancelEventAction(eventId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrgEvent(eventId);
    const reason = z.string().trim().min(3, "Please give a reason.").max(500).parse(form.get("reason"));
    await cancelEvent(user.id, eventId, reason, { organizationId: organization.id });
    revalidatePath("/organizer/events");
    return "Event cancelled. Ticket holders have been notified and refunds opened.";
  });
}

export async function setTicketTotal(ticketTypeId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg();
    const total = z.coerce.number().int("Enter a whole number").min(0).max(1_000_000).parse(form.get("total"));
    const type = await db.ticketType.findFirst({ where: { id: ticketTypeId, event: { organizationId: organization.id } } });
    if (!type) throw notFound("Ticket category not found.");
    await db.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE "TicketInventory" SET "total" = ${total}, "updatedAt" = now()
        WHERE "ticketTypeId" = ${ticketTypeId} AND "reserved" + "sold" <= ${total}`;
      if (updated !== 1) throw badRequest("Quantity can't go below the tickets already sold or held.");
      await syncSoldOut(tx, type.eventId);
      await audit({ actorId: user.id, action: "ticket.set_total", entity: "TicketType", entityId: ticketTypeId, metadata: { total } }, tx);
    }, TX_OPTIONS);
    revalidatePath("/organizer/tickets");
    return "Inventory updated.";
  });
}

export async function toggleTicketType(ticketTypeId: string, _: ActionState) {
  return act(async () => {
    const { organization } = await requireOrg();
    const type = await db.ticketType.findFirst({ where: { id: ticketTypeId, event: { organizationId: organization.id } } });
    if (!type) throw notFound("Ticket category not found.");
    await db.ticketType.update({ where: { id: type.id }, data: { isActive: !type.isActive } });
    revalidatePath("/organizer/tickets");
    return type.isActive ? "Ticket category hidden." : "Ticket category is on sale.";
  });
}

export async function createPromoCode(_: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg();
    const input = promoInputSchema.parse(formValues(form));
    if (input.eventId) {
      const event = await db.event.findFirst({ where: { id: input.eventId, organizationId: organization.id } });
      if (!event) throw notFound("Event not found.");
    }
    if (input.ticketTypeId) {
      const type = await db.ticketType.findFirst({ where: { id: input.ticketTypeId, event: { organizationId: organization.id } } });
      if (!type) throw notFound("Ticket category not found.");
    }
    try {
      const promo = await db.promoCode.create({ data: promoData(input, organization.id) });
      await audit({ actorId: user.id, action: "promo.create", entity: "PromoCode", entityId: promo.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("That code is already taken. Try another.");
      throw error;
    }
    revalidatePath("/organizer/promo-codes");
    return "Promo code created.";
  });
}

function promoData(input: z.output<typeof promoInputSchema>, organizationId: string | null) {
  return {
    code: input.code,
    name: input.name,
    discountType: input.discountType,
    discountValue: input.discountType === "PERCENT" ? Math.round(input.discountValue * 100) : toMinor(input.discountValue),
    maxDiscountMinor: input.maxDiscount ? toMinor(input.maxDiscount) : null,
    organizationId,
    eventId: input.eventId || null,
    ticketTypeId: input.ticketTypeId || null,
    categoryId: input.categoryId || null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? null,
    minOrderMinor: input.minOrder ? toMinor(input.minOrder) : 0,
    startsAt: fromDhakaInput(input.startsAt),
    expiresAt: fromDhakaInput(input.expiresAt),
  };
}

export async function togglePromoCode(promoId: string, _: ActionState) {
  return act(async () => {
    const { organization } = await requireOrg();
    const promo = await db.promoCode.findFirst({ where: { id: promoId, organizationId: organization.id } });
    if (!promo) throw notFound("Promo code not found.");
    await db.promoCode.update({ where: { id: promo.id }, data: { isActive: !promo.isActive } });
    revalidatePath("/organizer/promo-codes");
  });
}

export async function requestPayout(_: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg("OWNER");
    const input = payoutRequestSchema.parse(formValues(form));
    const amountMinor = toMinor(input.amount);
    if (!organization.payoutMethod || !organization.payoutAccountName || !organization.payoutAccountNumber) {
      throw badRequest("Add your payout details under Organization Settings first.");
    }
    const { minPayoutMinor } = await getSettings();
    if (amountMinor < minPayoutMinor) throw badRequest(`The minimum payout is ৳${minPayoutMinor / 100}.`);
    await db.$transaction(async (tx) => {
      // Serializes requests per organization, so two at once can't both spend the same balance.
      const lock = `payout:${organization.id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
      const balance = await organizerBalance(organization.id, tx);
      if (amountMinor > balance.availableMinor) throw badRequest("That's more than your available balance.");
      const payout = await tx.payout.create({
        data: { organizationId: organization.id, amountMinor, method: organization.payoutMethod!, accountName: organization.payoutAccountName!, accountNumber: organization.payoutAccountNumber!, note: input.note, requestedById: user.id },
      });
      await audit({ actorId: user.id, action: "payout.request", entity: "Payout", entityId: payout.id, metadata: { amountMinor } }, tx);
    }, TX_OPTIONS);
    await notifyAdmins({ type: "PAYOUT", title: "Payout requested", body: `${organization.name} requested a payout.`, link: "/admin/payouts" });
    revalidatePath("/organizer/payouts");
    return "Payout requested.";
  });
}

export async function updateOrganization(_: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg("OWNER");
    const input = organizationSchema.parse(formValues(form));
    await db.organization.update({ where: { id: organization.id }, data: input });
    await audit({ actorId: user.id, action: "organization.update", entity: "Organization", entityId: organization.id });
    revalidatePath("/organizer/settings");
    return "Organization saved.";
  });
}

const memberSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: emailSchema,
  role: z.enum(["MANAGER", "STAFF"]),
});

export async function addTeamMember(_: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg("OWNER");
    const input = memberSchema.parse(formValues(form));
    const member = await ensureStaffUser({
      name: input.name,
      email: input.email,
      organizationName: organization.name,
      role: input.role === "MANAGER" ? "ORGANIZER" : "SCANNER",
    });
    const existing = await db.organizationMember.findFirst({ where: { userId: member.id } });
    if (existing && existing.organizationId !== organization.id) throw conflict("That person already belongs to another organizer.");
    if (existing) throw conflict("That person is already on your team.");
    await db.organizationMember.create({ data: { organizationId: organization.id, userId: member.id, role: input.role } });
    await audit({ actorId: user.id, action: "team.add", entity: "OrganizationMember", entityId: member.id, metadata: { role: input.role } });
    revalidatePath("/organizer/team");
    return "Team member added.";
  });
}

export async function removeTeamMember(memberId: string, _: ActionState) {
  return act(async () => {
    const { user, organization } = await requireOrg("OWNER");
    const member = await db.organizationMember.findFirst({ where: { id: memberId, organizationId: organization.id } });
    if (!member) throw notFound("Team member not found.");
    if (member.role === "OWNER") throw badRequest("The owner can't be removed.");
    await db.$transaction([
      db.staffAssignment.deleteMany({ where: { userId: member.userId, event: { organizationId: organization.id } } }),
      db.organizationMember.delete({ where: { id: member.id } }),
    ]);
    await audit({ actorId: user.id, action: "team.remove", entity: "OrganizationMember", entityId: member.userId });
    revalidatePath("/organizer/team");
    return "Team member removed.";
  });
}

export async function assignStaff(_: ActionState, form: FormData) {
  return act(async () => {
    const { user, organization } = await requireOrg();
    const input = z.object({ eventId: z.string().min(1, "Choose an event"), userId: z.string().min(1, "Choose a person"), gate: z.string().trim().max(60).optional() }).parse(formValues(form));
    const event = await db.event.findFirst({ where: { id: input.eventId, organizationId: organization.id } });
    if (!event) throw notFound("Event not found.");
    const member = await db.organizationMember.findFirst({ where: { userId: input.userId, organizationId: organization.id } });
    if (!member) throw notFound("Team member not found.");
    await db.staffAssignment.upsert({
      where: { eventId_userId: { eventId: event.id, userId: input.userId } },
      update: { gate: input.gate || null },
      create: { eventId: event.id, userId: input.userId, gate: input.gate || null, assignedById: user.id },
    });
    revalidatePath("/organizer/team");
    return "Staff assigned.";
  });
}

export async function removeStaffAssignment(assignmentId: string, _: ActionState) {
  return act(async () => {
    const { organization } = await requireOrg();
    const removed = await db.staffAssignment.deleteMany({ where: { id: assignmentId, event: { organizationId: organization.id } } });
    if (removed.count !== 1) throw notFound("Assignment not found.");
    revalidatePath("/organizer/team");
  });
}

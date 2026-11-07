"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { act, formValues, type ActionState } from "../action-helpers";
import { audit } from "../audit";
import { getCurrentUser, getMembership, requireUser } from "../auth/guards";
import { hashPassword, verifyPassword } from "../auth/password";
import { db } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { randomCode } from "../crypto";
import { rateLimit } from "../rate-limit";
import { notifyAdmins } from "../services/notifications";
import { requestRefund } from "../services/refund";
import { changePasswordSchema, profileSchema, reviewSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";

export async function updateProfile(_: ActionState, form: FormData) {
  return act(async () => {
    const user = await requireUser();
    const input = profileSchema.parse(formValues(form));
    await db.user.update({ where: { id: user.id }, data: { name: input.name, phone: input.phone || null, city: input.city || null } });
    revalidatePath("/profile");
    return "Profile saved.";
  });
}

export async function changePassword(_: ActionState, form: FormData) {
  return act(async () => {
    const user = await requireUser();
    await rateLimit(`change-password:${user.id}`, 10, 900);
    const input = changePasswordSchema.parse(formValues(form));
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (row.passwordHash && !(await verifyPassword(input.currentPassword ?? "", row.passwordHash))) {
      throw badRequest("Your current password is incorrect.");
    }
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword), sessionVersion: { increment: 1 } } });
    await audit({ actorId: user.id, action: "auth.password_change", entity: "User", entityId: user.id });
    // Every session is now invalid, including this one.
    redirect("/login?reset=1");
  });
}

export async function updateNotificationPreferences(_: ActionState, form: FormData) {
  return act(async () => {
    const user = await requireUser();
    await db.user.update({
      where: { id: user.id },
      data: {
        notifyReminders: form.get("notifyReminders") === "on",
        notifyMarketing: form.get("notifyMarketing") === "on",
      },
    });
    revalidatePath("/settings");
    return "Preferences saved.";
  });
}

export async function logoutEverywhere(_: ActionState) {
  return act(async () => {
    const user = await requireUser();
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    await audit({ actorId: user.id, action: "auth.logout_everywhere", entity: "User", entityId: user.id });
    redirect("/login");
  });
}

export async function markAllNotificationsRead(_: ActionState) {
  return act(async () => {
    const user = await requireUser();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/notifications");
  });
}

export async function requestOrderRefund(reference: string, _: ActionState, form: FormData) {
  return act(async () => {
    const user = await requireUser();
    const booking = await db.booking.findUnique({ where: { reference } });
    if (!booking || booking.userId !== user.id) throw notFound("Order not found.");
    const reason = z.string().trim().min(3, "Please give a reason.").max(500).parse(form.get("reason"));
    await requestRefund({ bookingId: booking.id, reason, requestedById: user.id });
    await notifyAdmins({ type: "REFUND", title: "Refund requested", body: `${reference}: ${reason}`, link: "/admin/refunds" });
    revalidatePath(`/orders/${reference}`);
    return "Your refund request has been sent.";
  });
}

export async function submitReview(eventId: string, _: ActionState, form: FormData) {
  return act(async () => {
    const user = await requireUser();
    const input = reviewSchema.parse({ ...formValues(form), eventId });
    const attended = await db.ticket.count({ where: { eventId, status: "USED", booking: { userId: user.id } } });
    if (!attended) throw forbidden("Only people who attended can review this event.");
    const existing = await db.review.findUnique({ where: { eventId_userId: { eventId, userId: user.id } } });
    if (existing) throw conflict("You've already reviewed this event.");
    const review = await db.review.create({ data: { eventId, userId: user.id, rating: input.rating, comment: input.comment || null }, include: { event: { select: { slug: true } } } });
    revalidatePath(`/events/${review.event.slug}`);
    return "Thanks for your review.";
  });
}

export async function applyAsOrganizer(_: ActionState, form: FormData) {
  return act(async () => {
    const user = await getCurrentUser();
    if (!user) throw forbidden("Please log in first.");
    if (await getMembership(user.id)) throw conflict("You already belong to an organizer account.");
    const input = z
      .object({ name: z.string().trim().min(2, "Enter your organization's name").max(120), city: z.string().trim().max(60).optional(), phone: z.string().trim().max(30).optional() })
      .parse(formValues(form));
    const role = await db.role.findUniqueOrThrow({ where: { key: "ORGANIZER" } });
    await db.$transaction(async (tx) => {
      const taken = await tx.organization.findUnique({ where: { slug: slugify(input.name) } });
      const organization = await tx.organization.create({
        data: {
          name: input.name,
          slug: taken ? `${slugify(input.name)}-${randomCode(4).toLowerCase()}` : slugify(input.name) || randomCode(8).toLowerCase(),
          city: input.city,
          phone: input.phone,
          email: user.email,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      // A super admin keeps their role; anyone else becomes an organizer.
      if (user.role !== "SUPER_ADMIN") await tx.user.update({ where: { id: user.id }, data: { roleId: role.id } });
      await audit({ actorId: user.id, action: "organization.apply", entity: "Organization", entityId: organization.id }, tx);
    });
    await notifyAdmins({ type: "SYSTEM", title: "New organizer application", body: input.name, link: "/admin/organizers?status=PENDING" });
    redirect("/organizer/dashboard");
  });
}

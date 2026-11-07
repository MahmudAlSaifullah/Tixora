import { db } from "../db";
import type { NotificationType } from "@/generated/prisma/client";

export async function notify(userId: string, data: { type: NotificationType; title: string; body: string; link?: string }) {
  await db.notification.create({ data: { userId, ...data } });
}

/** Notifies every owner and manager of an organization. */
export async function notifyOrganization(organizationId: string, data: { type: NotificationType; title: string; body: string; link?: string }) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ["OWNER", "MANAGER"] } },
    select: { userId: true },
  });
  if (members.length) await db.notification.createMany({ data: members.map((m) => ({ userId: m.userId, ...data })) });
}

export async function notifyAdmins(data: { type: NotificationType; title: string; body: string; link?: string }) {
  const admins = await db.user.findMany({ where: { role: { key: "SUPER_ADMIN" }, status: "ACTIVE" }, select: { id: true } });
  if (admins.length) await db.notification.createMany({ data: admins.map((a) => ({ userId: a.id, ...data })) });
}

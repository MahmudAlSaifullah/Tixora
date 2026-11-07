import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "../db";
import { forbidden, notFound, unauthorized } from "../errors";
import { auth } from "./index";
import { ROLE_HOME } from "@/lib/constants";
import type { OrgMemberRole } from "@/generated/prisma/client";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * The authoritative session check. The JWT only says who the caller claims to be: suspension,
 * role changes and "log out everywhere" all take effect here on the very next request.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!user || user.status !== "ACTIVE") return null;
  const tokenVersion = (session as unknown as { sv?: number }).sv;
  if (tokenVersion !== undefined && tokenVersion !== user.sessionVersion) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    city: user.city,
    image: user.image,
    role: user.role.key,
    emailVerifiedAt: user.emailVerifiedAt,
    hasPassword: Boolean(user.passwordHash),
    notifyEmail: user.notifyEmail,
    notifyReminders: user.notifyReminders,
    notifyMarketing: user.notifyMarketing,
  };
});

// ---- Page guards: redirect the browser ------------------------------------------------

export async function requireUserPage(returnTo?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(returnTo ? `/login?callbackUrl=${encodeURIComponent(returnTo)}` : "/login");
  return user;
}

export async function requireRolePage(roles: string[], returnTo?: string) {
  const user = await requireUserPage(returnTo);
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role] ?? "/");
  return user;
}

// ---- API and action guards: throw AppError --------------------------------------------

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

export const requireAdmin = () => requireRole("SUPER_ADMIN");

const RANK: Record<OrgMemberRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };

/** The caller's organization, resolved from their membership and never from client input. */
export async function getMembership(userId: string) {
  return db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function requireOrg(minimum: OrgMemberRole = "MANAGER") {
  const user = await requireUser();
  const membership = await getMembership(user.id);
  if (!membership) throw forbidden("You are not part of an organizer account.");
  if (RANK[membership.role] < RANK[minimum]) throw forbidden("Your team role does not allow this.");
  if (membership.organization.status === "SUSPENDED") throw forbidden("This organizer account is suspended.");
  return { user, organization: membership.organization, memberRole: membership.role };
}

/** Loads an event only if it belongs to the caller's organization. Otherwise it does not exist. */
export async function requireOrgEvent(eventId: string, minimum: OrgMemberRole = "MANAGER") {
  const context = await requireOrg(minimum);
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: context.organization.id } });
  if (!event) throw notFound("Event not found.");
  return { ...context, event };
}

export async function requireOrgPage() {
  const user = await requireRolePage(["ORGANIZER", "SCANNER", "SUPER_ADMIN"], "/organizer/dashboard");
  const membership = await getMembership(user.id);
  if (!membership) redirect(user.role === "SUPER_ADMIN" ? "/admin" : user.role === "SCANNER" ? "/scanner" : "/organizers");
  if (membership.role === "STAFF") redirect("/scanner");
  return { user, organization: membership.organization, memberRole: membership.role };
}

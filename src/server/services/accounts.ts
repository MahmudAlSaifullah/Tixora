import { db } from "../db";
import { env } from "../env";
import { conflict, badRequest } from "../errors";
import { randomToken, sha256 } from "../crypto";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { hashPassword } from "../auth/password";
import type { AuthTokenType, RoleKey } from "@/generated/prisma/client";

async function createAuthToken(userId: string, type: AuthTokenType, ttlMs: number) {
  const token = randomToken();
  await db.$transaction([
    // A new link supersedes older ones of the same kind.
    db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } }),
  ]);
  return token;
}

/** Consumes a token exactly once. Returns the user id, or null if invalid, used or expired. */
async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string | null> {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const gate = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return gate.count === 1 ? row.userId : null;
}

export async function sendVerificationEmail(user: { id: string; name: string; email: string }) {
  const token = await createAuthToken(user.id, "EMAIL_VERIFY", 24 * 3_600_000);
  await sendEmail("verifyEmail", user.email, { name: user.name, url: `${env.appUrl}/verify-email?token=${token}` });
}

export async function registerUser(input: { name: string; email: string; password: string; role?: RoleKey }) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists. Try logging in.", "EMAIL_TAKEN");
  const role = await db.role.findUniqueOrThrow({ where: { key: input.role ?? "CUSTOMER" } });
  const user = await db.user.create({
    data: { name: input.name, email, passwordHash: await hashPassword(input.password), roleId: role.id },
  });
  await audit({ actorId: user.id, action: "auth.register", entity: "User", entityId: user.id });
  await sendEmail("welcome", user.email, { name: user.name });
  await sendVerificationEmail(user);
  return user;
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

/** Always behaves the same outwardly, so it cannot be used to discover who has an account. */
export async function requestPasswordReset(emailInput: string) {
  const user = await db.user.findUnique({ where: { email: emailInput.toLowerCase() } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await createAuthToken(user.id, "PASSWORD_RESET", 3_600_000);
  await sendEmail("passwordReset", user.email, { name: user.name, url: `${env.appUrl}/reset-password?token=${token}` });
}

export async function resetPassword(token: string, password: string) {
  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!userId) throw badRequest("This link is invalid or has expired. Please request a new one.", "TOKEN_INVALID");
  await db.user.update({
    where: { id: userId },
    // The link proved control of the mailbox. Bumping the version signs out every old session.
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), sessionVersion: { increment: 1 } },
  });
  await audit({ actorId: userId, action: "auth.password_reset", entity: "User", entityId: userId });
}

/** Adds someone to a team, creating an account with a set-password link if they have none. */
export async function ensureStaffUser(input: { name: string; email: string; organizationName: string; role: RoleKey }) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, include: { role: true } });
  if (existing) {
    // Only a plain customer is promoted: a team invite must not change anyone else's role.
    if (existing.role.key === "CUSTOMER" && input.role !== "CUSTOMER") {
      const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
      await db.user.update({ where: { id: existing.id }, data: { roleId: role.id } });
    }
    return existing;
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
  const user = await db.user.create({ data: { name: input.name, email, roleId: role.id } });
  const token = await createAuthToken(user.id, "PASSWORD_RESET", 3_600_000);
  await sendEmail("staffInvite", email, { name: input.name, organization: input.organizationName, url: `${env.appUrl}/reset-password?token=${token}` });
  return user;
}

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { env } from "../env";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./password";

class SuspendedError extends CredentialsSignin {
  code = "suspended";
}
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        const { rateLimit } = await import("../rate-limit");
        try {
          await rateLimit(`login:ip:${ip}`, 60, 300); // Generous: venues and campuses share one IP.
          await rateLimit(`login:email:${email}`, 10, 300);
        } catch {
          throw new RateLimitedError();
        }

        const user = await db.user.findUnique({ where: { email }, include: { role: true } });
        // verifyPassword runs even for unknown emails, so response timing does not reveal accounts.
        const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
        if (!user || !valid) {
          await audit({ action: "auth.login_failed", entity: "User", entityId: user?.id, metadata: { email }, ip });
          return null;
        }
        if (user.status !== "ACTIVE") throw new SuspendedError();

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit({ actorId: user.id, action: "auth.login", entity: "User", entityId: user.id, ip });
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role.key, sessionVersion: user.sessionVersion };
      },
    }),
    // Registered only when configured. The login page hides the button otherwise.
    ...(env.googleEnabled ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const email = profile?.email?.toLowerCase();
      if (!email || !profile?.email_verified) return false;

      const customerRole = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
      const dbUser = await db.user.upsert({
        where: { email },
        update: { emailVerifiedAt: new Date(), lastLoginAt: new Date() },
        create: {
          email,
          name: profile.name ?? email.split("@")[0],
          image: typeof profile.picture === "string" ? profile.picture : null,
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          roleId: customerRole.id,
        },
        include: { role: true },
      });
      if (dbUser.status !== "ACTIVE") return "/login?error=suspended";
      await db.account.upsert({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
        update: {},
        create: { provider: "google", providerAccountId: account.providerAccountId, userId: dbUser.id },
      });
      user.id = dbUser.id;
      user.role = dbUser.role.key;
      user.sessionVersion = dbUser.sessionVersion;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
  },
});

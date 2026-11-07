import type { NextAuthConfig } from "next-auth";

// Shared by the request proxy, so it holds nothing that touches the database.
// Providers are attached in ./index.ts.
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as string;
      }
      // Compared with the database on each request, so sessions can be revoked.
      (session as unknown as { sv?: number }).sv = token.sv as number | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;

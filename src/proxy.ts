import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

// First line of defence: keeps logged-out and wrong-role visitors away from private areas.
// The authoritative checks (suspension, data ownership) run in layouts, guards and services.

const { auth } = NextAuth(authConfig);

const RULES: { prefix: string; roles?: string[] }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/organizer" },
  { prefix: "/scanner" },
  { prefix: "/profile" },
  { prefix: "/my-tickets" },
  { prefix: "/my-orders" },
  { prefix: "/settings" },
  { prefix: "/notifications" },
];

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const user = request.auth?.user;
  if (!user) {
    const login = new URL("/login", request.nextUrl);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (rule.roles && !rule.roles.includes(user.role)) return NextResponse.redirect(new URL("/", request.nextUrl));
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/organizer/:path*", "/scanner/:path*", "/profile/:path*", "/my-tickets/:path*", "/my-orders/:path*", "/settings/:path*", "/notifications/:path*"],
};

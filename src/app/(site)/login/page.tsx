import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, safeCallback } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { ROLE_HOME } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  const user = await getCurrentUser();
  if (user) redirect(callbackUrl ?? ROLE_HOME[user.role] ?? "/");
  return (
    <AuthShell title="Welcome back" description={params.reset ? "Your password has been changed. Log in with your new password." : "Log in to see your tickets and orders."}>
      <LoginForm callbackUrl={callbackUrl} googleEnabled={env.googleEnabled} initialError={typeof params.error === "string" ? params.error : undefined} />
    </AuthShell>
  );
}

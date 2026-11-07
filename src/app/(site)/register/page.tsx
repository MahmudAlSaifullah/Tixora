import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, safeCallback } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-forms";
import { getCurrentUser } from "@/server/auth/guards";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const callbackUrl = safeCallback((await searchParams).callbackUrl);
  if (await getCurrentUser()) redirect(callbackUrl ?? "/");
  return (
    <AuthShell title="Create your account" description="Book faster and keep all your tickets in one place.">
      <RegisterForm callbackUrl={callbackUrl} googleEnabled={env.googleEnabled} />
    </AuthShell>
  );
}

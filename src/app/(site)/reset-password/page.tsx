import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthShell title="This link isn't valid" description="Please request a new password reset link.">
        <Button asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}

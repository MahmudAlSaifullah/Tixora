import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { verifyEmailToken } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const verified = token ? await verifyEmailToken(token) : false;
  return (
    <AuthShell
      title={verified ? "Email verified" : "This link isn't valid"}
      description={verified ? "Thanks. Your account is fully set up." : "It may have expired or already been used. You can request a new one from Settings."}
    >
      <Button asChild>
        <Link href={verified ? "/events" : "/settings"}>{verified ? "Explore events" : "Go to settings"}</Link>
      </Button>
    </AuthShell>
  );
}

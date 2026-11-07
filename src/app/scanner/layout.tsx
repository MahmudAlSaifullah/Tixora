import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { UserMenu } from "@/components/site/header-client";
import { requireRolePage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "QR Scanner", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ScannerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRolePage(["SCANNER", "ORGANIZER", "SUPER_ADMIN"], "/scanner");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <Link href="/scanner" className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.18em]">
          <LogoMark className="size-7" /> SCANNER
        </Link>
        <UserMenu account={{ name: user.name, email: user.email, role: user.role, unread: 0 }} />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

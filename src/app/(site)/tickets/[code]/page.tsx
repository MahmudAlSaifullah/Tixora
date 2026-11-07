import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TicketPass } from "@/components/tickets/ticket-pass";
import { getCurrentUser } from "@/server/auth/guards";
import { getTicketForViewer } from "@/server/services/tickets";

export const metadata: Metadata = { title: "Your ticket", robots: { index: false } };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const { t } = await searchParams;
  const user = await getCurrentUser();
  const ticket = await getTicketForViewer(code, { userId: user?.id, isAdmin: user?.role === "SUPER_ADMIN", guestToken: t });
  if (!ticket) notFound();
  return (
    <div className="px-4 py-6 sm:py-10">
      <div className="mx-auto mb-4 max-w-sm">
        <Link href={`/orders/${ticket.booking.reference}${t ? `?t=${encodeURIComponent(t)}` : ""}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to order
        </Link>
      </div>
      <TicketPass ticket={ticket} guestToken={t} />
    </div>
  );
}

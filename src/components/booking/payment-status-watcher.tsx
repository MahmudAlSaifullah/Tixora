"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getJson } from "@/lib/client-api";

/** Shown while a gateway's confirmation is still on its way. Refreshes once the booking changes. */
export function PaymentStatusWatcher({ reference, guestToken }: { reference: string; guestToken: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const url = `/api/bookings/${reference}${guestToken ? `?t=${encodeURIComponent(guestToken)}` : ""}`;
    const timer = setInterval(async () => {
      const data = await getJson<{ status: string; latestPaymentStatus: string | null }>(url).catch(() => null);
      if (data && (data.status !== "PENDING" || data.latestPaymentStatus !== "INITIATED")) {
        clearInterval(timer);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [reference, guestToken, router]);

  return (
    <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border bg-card p-4">
      <Loader2 className="size-5 shrink-0 animate-spin text-brand-glow" aria-hidden />
      <div>
        <p className="font-semibold">Confirming your payment</p>
        <p className="text-sm text-muted-foreground">We're checking with the payment provider. This usually takes a few seconds, and you don't need to pay again.</p>
      </div>
    </div>
  );
}

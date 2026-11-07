"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";

type Outcome = "SUCCESS" | "FAILED" | "CANCELLED";

export function TestPaymentPanel({ txn, sig }: { txn: string; sig: string }) {
  const [busy, setBusy] = useState<Outcome | null>(null);

  async function decide(outcome: Outcome) {
    setBusy(outcome);
    try {
      const { redirectUrl } = await postJson<{ redirectUrl: string }>("/api/payments/test/decide", { txn, sig, outcome });
      window.location.assign(redirectUrl);
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium">Choose what the gateway reports:</p>
      <div className="grid gap-2">
        <Button onClick={() => decide("SUCCESS")} disabled={busy !== null}>
          {busy === "SUCCESS" && <Loader2 className="animate-spin" />} Simulate successful payment
        </Button>
        <Button variant="secondary" onClick={() => decide("FAILED")} disabled={busy !== null}>
          {busy === "FAILED" && <Loader2 className="animate-spin" />} Simulate failed payment
        </Button>
        <Button variant="ghost" onClick={() => decide("CANCELLED")} disabled={busy !== null}>
          {busy === "CANCELLED" && <Loader2 className="animate-spin" />} Cancel payment
        </Button>
      </div>
    </div>
  );
}

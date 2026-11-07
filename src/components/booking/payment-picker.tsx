"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FlaskConical, Loader2, Lock, Smartphone, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface GatewayOption {
  code: string;
  label: string;
  description: string;
  instruments: string[];
  isTestOnly: boolean;
}

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(new Date(expiresAt).getTime() - Date.now(), 0));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return remaining;
}

export function PaymentPicker({ reference, guestToken, gateways, expiresAt, eventSlug, testMode }: { reference: string; guestToken: string | null; gateways: GatewayOption[]; expiresAt: string; eventSlug: string; testMode: boolean }) {
  const router = useRouter();
  const [gateway, setGateway] = useState(gateways[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const remaining = useCountdown(expiresAt);
  const expired = remaining === 0;
  const minutes = Math.floor((remaining ?? 0) / 60_000);
  const seconds = Math.floor(((remaining ?? 0) % 60_000) / 1000);
  const guest = guestToken ? `?t=${encodeURIComponent(guestToken)}` : "";

  async function pay() {
    setBusy(true);
    try {
      const { redirectUrl } = await postJson<{ redirectUrl: string }>("/api/payments/initiate", { reference, gateway, guestToken });
      window.location.assign(redirectUrl);
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await postJson(`/api/bookings/${reference}/cancel${guest}`);
      router.replace(`/events/${eventSlug}`);
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="timer" className={cn("flex items-center gap-3 rounded-xl border p-4 text-sm", expired ? "border-danger/40 bg-danger/10" : "bg-card")}>
        <Timer className={cn("size-5 shrink-0", expired ? "text-danger" : "text-brand-glow")} aria-hidden />
        {expired ? (
          <span>Your reservation has expired and the tickets have been released.</span>
        ) : (
          <span>
            Your tickets are held for{" "}
            <strong className="font-display tabular-nums">
              {remaining === null ? "--:--" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
            </strong>
          </span>
        )}
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Payment method</h2>
        {gateways.length === 0 ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">Online payment isn't available right now. Please try again later or contact support.</p>
        ) : (
          <RadioGroup value={gateway} onValueChange={setGateway} className="gap-2" aria-label="Payment method">
            {gateways.map((option) => (
              <label key={option.code} htmlFor={`gw-${option.code}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors", gateway === option.code ? "border-brand-glow bg-primary/10" : "hover:bg-accent")}>
                <RadioGroupItem value={option.code} id={`gw-${option.code}`} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {option.isTestOnly ? <FlaskConical className="size-4 text-warning" aria-hidden /> : option.code === "sslcommerz" ? <CreditCard className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
                    {option.label}
                    {option.isTestOnly && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">Test mode</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{option.description}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.instruments.join(" · ")}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
        <Button size="lg" className="mt-4 w-full" onClick={pay} disabled={busy || expired || gateways.length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Lock />} Pay securely
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">You'll finish on the payment provider's secure page. Tixora never sees or stores your card number, PIN or OTP.</p>
        {testMode && <p className="mt-1 text-center text-xs text-warning">This site is running in sandbox mode. No real money is charged.</p>}
      </section>

      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
          Cancel this order
        </Button>
      </div>
    </div>
  );
}

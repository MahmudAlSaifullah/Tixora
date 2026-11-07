"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client-api";

export function ResendVerificationButton() {
  const [sent, setSent] = useState(false);
  async function send() {
    try {
      await postJson("/api/account/resend-verification");
      setSent(true);
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={send} disabled={sent}>
      {sent ? "Sent" : "Resend email"}
    </Button>
  );
}

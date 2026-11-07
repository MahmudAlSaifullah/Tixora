import type { Metadata } from "next";
import { Field, PageHeader, Panel } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { savePlatformSettings } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Platform Settings" };

export default async function AdminSettingsPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Platform Settings" description="Changes apply to new bookings. Secret keys live in server environment variables, never here." />
      <Panel>
        <ActionForm action={savePlatformSettings} submitLabel="Save settings">
          <h2 className="text-base font-semibold">Booking and fees</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Reservation time (minutes)" htmlFor="reservationMinutes" hint="How long tickets are held during checkout.">
              <Input id="reservationMinutes" name="reservationMinutes" type="number" min={2} max={120} defaultValue={s.reservationMinutes} required />
            </Field>
            <Field label="Customer booking fee (%)" htmlFor="platformFeePercent">
              <Input id="platformFeePercent" name="platformFeePercent" type="number" min={0} max={50} step="0.01" defaultValue={s.platformFeeBps / 100} required />
            </Field>
            <Field label="Flat booking fee (৳)" htmlFor="platformFeeFlat">
              <Input id="platformFeeFlat" name="platformFeeFlat" type="number" min={0} step="0.01" defaultValue={s.platformFeeFlatMinor / 100} required />
            </Field>
            <Field label="VAT on booking fee (%)" htmlFor="taxPercent">
              <Input id="taxPercent" name="taxPercent" type="number" min={0} max={50} step="0.01" defaultValue={s.taxBps / 100} required />
            </Field>
            <Field label="Default commission (%)" htmlFor="commissionPercent">
              <Input id="commissionPercent" name="commissionPercent" type="number" min={0} max={50} step="0.01" defaultValue={s.commissionBps / 100} required />
            </Field>
            <Field label="Minimum payout (৳)" htmlFor="minPayout">
              <Input id="minPayout" name="minPayout" type="number" min={0} defaultValue={s.minPayoutMinor / 100} required />
            </Field>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="requireEventApproval" defaultChecked={s.requireEventApproval} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="block text-sm font-medium">Require admin approval before events go on sale</span>
              <span className="block text-xs text-muted-foreground">When off, submitted events publish immediately.</span>
            </span>
          </label>
          <h2 className="!mt-8 text-base font-semibold">Support details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email" htmlFor="supportEmail">
              <Input id="supportEmail" name="supportEmail" type="email" defaultValue={s.supportEmail} required />
            </Field>
            <Field label="Phone" htmlFor="supportPhone">
              <Input id="supportPhone" name="supportPhone" defaultValue={s.supportPhone} required />
            </Field>
            <Field label="Address" htmlFor="supportAddress">
              <Input id="supportAddress" name="supportAddress" defaultValue={s.supportAddress} />
            </Field>
          </div>
          <h2 className="!mt-8 text-base font-semibold">Social links</h2>
          <p className="!mt-1 text-xs text-muted-foreground">Shown in the footer. Leave a field empty to hide its icon.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Facebook" htmlFor="socialFacebook">
              <Input id="socialFacebook" name="socialFacebook" type="url" defaultValue={s.socialFacebook} />
            </Field>
            <Field label="Instagram" htmlFor="socialInstagram">
              <Input id="socialInstagram" name="socialInstagram" type="url" defaultValue={s.socialInstagram} />
            </Field>
            <Field label="YouTube" htmlFor="socialYoutube">
              <Input id="socialYoutube" name="socialYoutube" type="url" defaultValue={s.socialYoutube} />
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}

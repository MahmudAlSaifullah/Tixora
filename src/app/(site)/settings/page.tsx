import type { Metadata } from "next";
import { MailWarning } from "lucide-react";
import { ResendVerificationButton } from "@/components/auth/resend-verification";
import { Field, Panel } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { requireUserPage } from "@/server/auth/guards";
import { changePassword, logoutEverywhere, updateNotificationPreferences } from "@/server/actions/account";

export const metadata: Metadata = { title: "Settings" };

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-[var(--primary)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export default async function SettingsPage() {
  const user = await requireUserPage("/settings");
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold">Settings</h1>

      {!user.emailVerifiedAt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm">
            <MailWarning className="size-4 text-warning" aria-hidden /> Please verify {user.email}
          </p>
          <ResendVerificationButton />
        </div>
      )}

      <Panel title="Notifications" description="Booking confirmations and tickets are always sent.">
        <ActionForm action={updateNotificationPreferences} submitLabel="Save preferences">
          <Toggle name="notifyReminders" label="Event reminders" hint="A reminder before events you've booked." defaultChecked={user.notifyReminders} />
          <Toggle name="notifyMarketing" label="News and offers" hint="New events and early-bird releases." defaultChecked={user.notifyMarketing} />
        </ActionForm>
      </Panel>

      <Panel title={user.hasPassword ? "Change password" : "Set a password"} description="Changing your password logs you out on all devices.">
        <ActionForm action={changePassword} submitLabel={user.hasPassword ? "Change password" : "Set password"} resetOnSuccess>
          {user.hasPassword && (
            <Field label="Current password" htmlFor="currentPassword">
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
          )}
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters, with a letter and a number.">
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </ActionForm>
      </Panel>

      <Panel title="Account security" description="If you've logged in on a shared device, you can end all sessions.">
        <ActionButton action={logoutEverywhere} label="Log out everywhere" confirm="You'll need to log in again on every device, including this one." variant="outline" size="default" />
      </Panel>
    </div>
  );
}

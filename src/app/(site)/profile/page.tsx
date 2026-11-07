import type { Metadata } from "next";
import { BadgeCheck, MailWarning } from "lucide-react";
import { Field, Panel } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { requireUserPage } from "@/server/auth/guards";
import { updateProfile } from "@/server/actions/account";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUserPage("/profile");
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-3xl font-semibold">Profile</h1>
      <Panel>
        <p className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          {user.emailVerifiedAt ? (
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck className="size-4" aria-hidden /> Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warning">
              <MailWarning className="size-4" aria-hidden /> Not verified
            </span>
          )}
        </p>
        <ActionForm action={updateProfile} submitLabel="Save changes">
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" defaultValue={user.name} required minLength={2} maxLength={80} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" hint="Used to prefill your checkout details.">
            <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={user.city ?? ""} maxLength={60} />
          </Field>
        </ActionForm>
      </Panel>
    </div>
  );
}

import type { Metadata } from "next";
import { Field, NativeSelect, PageHeader, Panel, StatusBadge } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateOrganization } from "@/server/actions/organizer";
import { requireOrgPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Organization Settings" };

export default async function OrganizerSettingsPage() {
  const { organization: org, memberRole } = await requireOrgPage();
  if (memberRole !== "OWNER") {
    return <PageHeader title="Organization Settings" description="Only the organization owner can change these settings." />;
  }
  return (
    <>
      <PageHeader title="Organization Settings" description="Your public profile and payout details." actions={<StatusBadge status={org.status} />} />
      <Panel>
        <ActionForm action={updateOrganization} submitLabel="Save changes">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization name" htmlFor="name">
              <Input id="name" name="name" defaultValue={org.name} required />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" defaultValue={org.website ?? ""} placeholder="https://" />
            </Field>
            <Field label="Public description" htmlFor="description" className="sm:col-span-2">
              <Textarea id="description" name="description" rows={4} defaultValue={org.description ?? ""} />
            </Field>
            <Field label="Contact email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={org.email ?? ""} />
            </Field>
            <Field label="Contact phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={org.phone ?? ""} />
            </Field>
            <Field label="Address" htmlFor="address">
              <Input id="address" name="address" defaultValue={org.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={org.city ?? ""} />
            </Field>
          </div>
          <h2 className="!mt-8 text-base font-semibold">Payout details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Method" htmlFor="payoutMethod">
              <NativeSelect id="payoutMethod" name="payoutMethod" defaultValue={org.payoutMethod ?? ""}>
                <option value="">Choose</option>
                <option value="Bank transfer">Bank transfer</option>
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
              </NativeSelect>
            </Field>
            <Field label="Account name" htmlFor="payoutAccountName">
              <Input id="payoutAccountName" name="payoutAccountName" defaultValue={org.payoutAccountName ?? ""} />
            </Field>
            <Field label="Account or wallet number" htmlFor="payoutAccountNumber">
              <Input id="payoutAccountNumber" name="payoutAccountNumber" defaultValue={org.payoutAccountNumber ?? ""} />
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}

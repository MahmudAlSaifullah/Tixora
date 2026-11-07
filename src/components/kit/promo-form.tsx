import { Field, NativeSelect, Panel } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/server/action-helpers";

interface Option {
  value: string;
  label: string;
}

/** Shared by organizer promo codes and admin campaigns. */
export function PromoForm({ action, title, events, ticketTypes, categories }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; title: string; events?: Option[]; ticketTypes?: Option[]; categories?: Option[] }) {
  return (
    <Panel title={title} className="mb-6">
      <ActionForm action={action} submitLabel="Create code" resetOnSuccess>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" htmlFor="code" hint="Customers type this in.">
            <Input id="code" name="code" required placeholder="EARLY20" className="uppercase placeholder:normal-case" />
          </Field>
          <Field label="Name" htmlFor="name" hint="For your reference.">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Discount type" htmlFor="discountType">
            <NativeSelect id="discountType" name="discountType">
              <option value="PERCENT">Percentage (%)</option>
              <option value="FIXED">Fixed amount (৳)</option>
            </NativeSelect>
          </Field>
          <Field label="Discount value" htmlFor="discountValue">
            <Input id="discountValue" name="discountValue" type="number" min={0} step="0.01" required />
          </Field>
          <Field label="Maximum discount (৳)" htmlFor="maxDiscount" hint="Optional cap for percentages.">
            <Input id="maxDiscount" name="maxDiscount" type="number" min={0} />
          </Field>
          <Field label="Minimum order (৳)" htmlFor="minOrder">
            <Input id="minOrder" name="minOrder" type="number" min={0} />
          </Field>
          <Field label="Total usage limit" htmlFor="usageLimit">
            <Input id="usageLimit" name="usageLimit" type="number" min={1} />
          </Field>
          <Field label="Per-customer limit" htmlFor="perUserLimit">
            <Input id="perUserLimit" name="perUserLimit" type="number" min={1} />
          </Field>
          <Field label="Starts" htmlFor="startsAt">
            <Input id="startsAt" name="startsAt" type="datetime-local" />
          </Field>
          <Field label="Expires" htmlFor="expiresAt">
            <Input id="expiresAt" name="expiresAt" type="datetime-local" />
          </Field>
          {events && (
            <Field label="Only for event" htmlFor="eventId">
              <NativeSelect id="eventId" name="eventId" defaultValue="">
                <option value="">All my events</option>
                {events.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {ticketTypes && (
            <Field label="Only for ticket category" htmlFor="ticketTypeId">
              <NativeSelect id="ticketTypeId" name="ticketTypeId" defaultValue="">
                <option value="">All categories</option>
                {ticketTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {categories && (
            <Field label="Only for event category" htmlFor="categoryId">
              <NativeSelect id="categoryId" name="categoryId" defaultValue="">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      </ActionForm>
    </Panel>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, NativeSelect, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, postJson } from "@/lib/client-api";
import { CITIES, TICKET_KINDS } from "@/lib/constants";
import { formatMoney, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { eventDraftSchema, eventSubmissionProblems, type EventDraft, type EventDraftInput } from "@/lib/validation";
import { GalleryUpload, ImageUpload } from "./image-upload";

const STEPS = ["Basic information", "Media", "Date and venue", "Tickets", "Policies", "Review and publish"];

const BLANK_TICKET: NonNullable<EventDraftInput["ticketTypes"]>[number] = {
  name: "General Admission",
  kind: "GENERAL",
  price: 500,
  total: 100,
  minPerOrder: 1,
  maxPerOrder: 10,
  perUserLimit: null,
  salesStartAt: null,
  salesEndAt: null,
  description: null,
};

const optionalNumber = (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(value));

export function EventWizard({
  categories,
  organizerName,
  eventId,
  status,
  initial,
}: {
  categories: { id: string; name: string }[];
  organizerName: string;
  eventId?: string;
  status?: string;
  initial?: EventDraftInput;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [savedId, setSavedId] = useState(eventId);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);

  const form = useForm<EventDraftInput, unknown, EventDraft>({
    resolver: zodResolver(eventDraftSchema),
    mode: "onBlur",
    defaultValues: initial ?? {
      title: "",
      categoryId: categories[0]?.id ?? "",
      shortDescription: "",
      description: "",
      organizerName,
      coverImageUrl: null,
      organizerLogoUrl: null,
      galleryUrls: [],
      mode: "OFFLINE",
      onlineUrl: "",
      startsAt: "",
      endsAt: "",
      venueName: "",
      venueAddress: "",
      venueCity: "Dhaka",
      ticketTypes: [{ ...BLANK_TICKET }],
      schedule: [],
      rules: "",
      terms: "",
      refundPolicy: "",
      ageRestriction: "",
      instructions: "",
      guestCheckout: false,
    },
  });
  const { register, setValue, formState: { errors } } = form;
  // keyName keeps react-hook-form from overwriting each ticket's real database id.
  const tickets = useFieldArray({ control: form.control, name: "ticketTypes", keyName: "fieldKey" });
  const schedule = useFieldArray({ control: form.control, name: "schedule", keyName: "fieldKey" });
  const values = useWatch({ control: form.control }) as EventDraftInput;
  const mode = values.mode;
  const editable = status === undefined || !["COMPLETED", "CANCELLED", "SUSPENDED"].includes(status);
  const canSubmit = !status || status === "DRAFT" || status === "REJECTED";

  const problems = useMemo(() => {
    const parsed = eventDraftSchema.safeParse(values);
    return parsed.success ? eventSubmissionProblems(parsed.data) : parsed.error.issues.map((issue) => `${issue.path.join(" > ")}: ${issue.message}`);
  }, [values]);

  async function persist(): Promise<string | null> {
    const valid = await form.trigger();
    if (!valid) {
      toast.error("Some details need fixing first.");
      return null;
    }
    const parsed = eventDraftSchema.parse(form.getValues());
    const result = savedId
      ? await postJson<{ id: string }>(`/api/organizer/events/${savedId}`, parsed, "PUT")
      : await postJson<{ id: string }>("/api/organizer/events", parsed);
    setSavedId(result.id);
    return result.id;
  }

  async function saveDraft() {
    setBusy("save");
    try {
      const id = await persist();
      if (id) {
        toast.success("Saved.");
        if (!eventId) router.replace(`/organizer/events/${id}/edit`);
        router.refresh();
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitForApproval() {
    setBusy("submit");
    setServerProblems([]);
    try {
      const id = await persist();
      if (!id) return;
      const result = await postJson<{ status: string }>(`/api/organizer/events/${id}/submit`);
      toast.success(result.status === "PUBLISHED" ? "Your event is live." : "Submitted for approval.");
      router.push("/organizer/events");
      router.refresh();
    } catch (error) {
      const apiError = error as ApiError;
      if (Array.isArray(apiError.details)) setServerProblems(apiError.details as string[]);
      toast.error(apiError.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[230px_1fr]">
      <ol className="scroll-rail flex gap-2 overflow-x-auto xl:flex-col xl:overflow-visible" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} className="shrink-0">
            <button type="button" onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors", index === step ? "bg-primary/15 font-medium" : "text-muted-foreground hover:bg-accent")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", index === step ? "bg-primary text-primary-foreground" : "bg-muted")}>{index + 1}</span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <form onSubmit={(e) => e.preventDefault()} className="min-w-0 space-y-4" noValidate>
        {step === 0 && (
          <Panel title="Basic information">
            <div className="space-y-4">
              <Field label="Event name" htmlFor="title" error={errors.title?.message}>
                <Input id="title" {...register("title")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Event category" htmlFor="categoryId" error={errors.categoryId?.message}>
                  <NativeSelect id="categoryId" {...register("categoryId")}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Organizer name" htmlFor="organizerName" hint="Shown on the event. Defaults to your organization.">
                  <Input id="organizerName" {...register("organizerName")} />
                </Field>
              </div>
              <Field label="Short description" htmlFor="shortDescription" hint="One or two lines, shown on event cards." error={errors.shortDescription?.message}>
                <Textarea id="shortDescription" rows={2} maxLength={240} {...register("shortDescription")} />
              </Field>
              <Field label="Full description" htmlFor="description" error={errors.description?.message}>
                <Textarea id="description" rows={8} {...register("description")} />
              </Field>
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel title="Event media">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div>
                <p className="mb-2 text-sm font-medium">Cover image</p>
                <ImageUpload label="Cover image" value={values.coverImageUrl} onChange={(url) => setValue("coverImageUrl", url, { shouldDirty: true })} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Organizer logo</p>
                <ImageUpload label="Organizer logo" aspect="aspect-square" value={values.organizerLogoUrl} onChange={(url) => setValue("organizerLogoUrl", url, { shouldDirty: true })} />
              </div>
            </div>
            <p className="mb-2 mt-6 text-sm font-medium">Gallery images</p>
            <GalleryUpload value={values.galleryUrls ?? []} onChange={(urls) => setValue("galleryUrls", urls, { shouldDirty: true })} />
          </Panel>
        )}

        {step === 2 && (
          <Panel title="Date and venue" description="Times are in Bangladesh time.">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" htmlFor="startsAt" hint="Start date and time." error={errors.startsAt?.message}>
                  <Input id="startsAt" type="datetime-local" {...register("startsAt")} />
                </Field>
                <Field label="Ends" htmlFor="endsAt" hint="End date and time." error={errors.endsAt?.message}>
                  <Input id="endsAt" type="datetime-local" {...register("endsAt")} />
                </Field>
              </div>
              <Field label="Event type" htmlFor="mode">
                <NativeSelect id="mode" {...register("mode")} className="sm:w-60">
                  <option value="OFFLINE">Offline, at a venue</option>
                  <option value="ONLINE">Online</option>
                </NativeSelect>
              </Field>
              {mode === "ONLINE" ? (
                <Field label="Online event link" htmlFor="onlineUrl" hint="Only shown to people with a confirmed booking." error={errors.onlineUrl?.message}>
                  <Input id="onlineUrl" type="url" placeholder="https://" {...register("onlineUrl")} />
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Venue name" htmlFor="venueName">
                    <Input id="venueName" {...register("venueName")} />
                  </Field>
                  <Field label="City" htmlFor="venueCity">
                    <Input id="venueCity" list="city-list" {...register("venueCity")} />
                    <datalist id="city-list">
                      {CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Address" htmlFor="venueAddress" className="sm:col-span-2">
                    <Input id="venueAddress" {...register("venueAddress")} />
                  </Field>
                </div>
              )}
            </div>
          </Panel>
        )}

        {step === 3 && (
          <>
            {tickets.fields.map((field, index) => {
              const error = errors.ticketTypes?.[index];
              return (
                <Panel
                  key={field.fieldKey}
                  title={`Ticket category ${index + 1}`}
                  actions={
                    tickets.fields.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => tickets.remove(index)}>
                        <Trash2 /> Remove
                      </Button>
                    )
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Name" htmlFor={`t${index}-name`} error={error?.name?.message} className="lg:col-span-2">
                      <Input id={`t${index}-name`} {...register(`ticketTypes.${index}.name`)} />
                    </Field>
                    <Field label="Type" htmlFor={`t${index}-kind`}>
                      <NativeSelect id={`t${index}-kind`} {...register(`ticketTypes.${index}.kind`)}>
                        {TICKET_KINDS.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Price (৳)" htmlFor={`t${index}-price`} hint="0 for a free ticket." error={error?.price?.message}>
                      <Input id={`t${index}-price`} type="number" min={0} step="1" inputMode="decimal" {...register(`ticketTypes.${index}.price`, { valueAsNumber: true })} />
                    </Field>
                    <Field label="Total inventory" htmlFor={`t${index}-total`} error={error?.total?.message}>
                      <Input id={`t${index}-total`} type="number" min={1} inputMode="numeric" {...register(`ticketTypes.${index}.total`, { valueAsNumber: true })} />
                    </Field>
                    <Field label="Minimum purchase" htmlFor={`t${index}-min`} error={error?.minPerOrder?.message}>
                      <Input id={`t${index}-min`} type="number" min={1} inputMode="numeric" {...register(`ticketTypes.${index}.minPerOrder`, { valueAsNumber: true })} />
                    </Field>
                    <Field label="Maximum purchase" htmlFor={`t${index}-max`} error={error?.maxPerOrder?.message}>
                      <Input id={`t${index}-max`} type="number" min={1} inputMode="numeric" {...register(`ticketTypes.${index}.maxPerOrder`, { valueAsNumber: true })} />
                    </Field>
                    <Field label="Per-user limit" htmlFor={`t${index}-limit`} hint="Optional, across all orders." error={error?.perUserLimit?.message}>
                      <Input id={`t${index}-limit`} type="number" min={1} inputMode="numeric" {...register(`ticketTypes.${index}.perUserLimit`, { setValueAs: optionalNumber })} />
                    </Field>
                    <Field label="Sales start" htmlFor={`t${index}-start`} className="lg:col-span-2" hint="Optional.">
                      <Input id={`t${index}-start`} type="datetime-local" {...register(`ticketTypes.${index}.salesStartAt`)} />
                    </Field>
                    <Field label="Sales end" htmlFor={`t${index}-end`} className="lg:col-span-2" hint="Optional." error={error?.salesEndAt?.message}>
                      <Input id={`t${index}-end`} type="datetime-local" {...register(`ticketTypes.${index}.salesEndAt`)} />
                    </Field>
                    <Field label="Description" htmlFor={`t${index}-desc`} className="sm:col-span-2 lg:col-span-4">
                      <Input id={`t${index}-desc`} maxLength={240} {...register(`ticketTypes.${index}.description`)} />
                    </Field>
                  </div>
                </Panel>
              );
            })}
            <Button type="button" variant="outline" onClick={() => tickets.append({ ...BLANK_TICKET, name: "" })}>
              <Plus /> Add ticket category
            </Button>
          </>
        )}

        {step === 4 && (
          <>
            <Panel title="Event policies">
              <div className="space-y-4">
                <Field label="Refund policy" htmlFor="refundPolicy">
                  <Textarea id="refundPolicy" rows={3} {...register("refundPolicy")} />
                </Field>
                <Field label="Entry rules" htmlFor="rules">
                  <Textarea id="rules" rows={3} {...register("rules")} />
                </Field>
                <Field label="Terms and conditions" htmlFor="terms">
                  <Textarea id="terms" rows={3} {...register("terms")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Age restriction" htmlFor="ageRestriction" hint="For example, 18+.">
                    <Input id="ageRestriction" {...register("ageRestriction")} />
                  </Field>
                </div>
                <Field label="Additional instructions" htmlFor="instructions">
                  <Textarea id="instructions" rows={3} {...register("instructions")} />
                </Field>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" {...register("guestCheckout")} />
                  <span>
                    <span className="block text-sm font-medium">Allow guest checkout</span>
                    <span className="block text-xs text-muted-foreground">Customers can buy without creating an account.</span>
                  </span>
                </label>
              </div>
            </Panel>
            <Panel title="Schedule" description="Optional. Shown on the event page.">
              <div className="space-y-2">
                {schedule.fields.map((field, index) => (
                  <div key={field.fieldKey} className="flex gap-2">
                    <Input aria-label="Time" placeholder="6:00 PM" className="w-32 shrink-0" {...register(`schedule.${index}.time`)} />
                    <Input aria-label="What happens" placeholder="Doors open" {...register(`schedule.${index}.title`)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => schedule.remove(index)} aria-label="Remove schedule item">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => schedule.append({ time: "", title: "" })}>
                <Plus /> Add schedule item
              </Button>
            </Panel>
          </>
        )}

        {step === 5 && (
          <Panel title="Review and publish">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Event</dt>
                <dd className="font-medium">{values.title || "Untitled"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">When</dt>
                <dd>{values.startsAt ? String(values.startsAt).replace("T", " ") : "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Where</dt>
                <dd>{mode === "ONLINE" ? "Online" : [values.venueName, values.venueCity].filter(Boolean).join(", ") || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Guest checkout</dt>
                <dd>{values.guestCheckout ? "Allowed" : "Account required"}</dd>
              </div>
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Tickets</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {(values.ticketTypes ?? []).map((ticket, index) => (
                <li key={index} className="flex items-center justify-between gap-3 p-3">
                  <span>{ticket.name || "Unnamed"}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Number.isFinite(ticket.price) ? (ticket.price === 0 ? "Free" : formatMoney(toMinor(ticket.price))) : "-"} · {ticket.total} tickets
                  </span>
                </li>
              ))}
            </ul>
            {[...new Set([...problems, ...serverProblems])].length > 0 ? (
              <div role="alert" className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CircleAlert className="size-4 text-warning" aria-hidden /> Before you can submit:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
                  {[...new Set([...problems, ...serverProblems])].map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                <Check className="size-4 text-success" aria-hidden /> Everything's in place.
                {canSubmit ? " Our team reviews events before they go on sale." : ""}
              </p>
            )}
          </Panel>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button type="button" variant="secondary" onClick={saveDraft} disabled={busy !== null}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} {canSubmit ? "Save draft" : "Save changes"}
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight />
              </Button>
            ) : (
              canSubmit &&
              editable && (
                <Button type="button" onClick={submitForApproval} disabled={busy !== null || problems.length > 0}>
                  {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />} Submit for approval
                </Button>
              )
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

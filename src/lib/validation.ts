import { z } from "zod";

// Schemas shared by the browser forms and the server. The server always re-validates.

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} is too long`);

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{7,18}$/, "Enter a valid phone number, for example 01712345678");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "Password is too long")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z.object({
  name: trimmed(2, 80, "Name"),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password") });
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(10), password: passwordSchema });

export const profileSchema = z.object({
  name: trimmed(2, 80, "Name"),
  phone: phoneSchema.or(z.literal("")).optional(),
  city: z.string().trim().max(60).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

export const attendeeSchema = z.object({
  name: trimmed(2, 80, "Attendee name"),
  email: emailSchema.or(z.literal("")).nullish(),
  phone: phoneSchema.or(z.literal("")).nullish(),
});

export const contactSchema = z.object({ name: trimmed(2, 80, "Name"), email: emailSchema, phone: phoneSchema });

export const createBookingSchema = z.object({
  eventId: z.string().min(1),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        attendees: z.array(attendeeSchema).min(1).max(50),
      }),
    )
    .min(1, "Select at least one ticket")
    .max(10),
  contact: contactSchema,
  promoCode: z.string().trim().max(40).nullish(),
  idempotencyKey: z.string().min(16).max(80),
});

export const quoteSchema = z.object({
  eventId: z.string().min(1),
  items: z.array(z.object({ ticketTypeId: z.string().min(1), quantity: z.number().int().min(1).max(50) })).min(1).max(10),
  promoCode: z.string().trim().max(40).nullish(),
  email: z.string().trim().max(254).nullish(),
});

export const initiatePaymentSchema = z.object({
  reference: z.string().min(4).max(40),
  gateway: z.string().min(1).max(30),
  guestToken: z.string().max(200).nullish(),
});

export const scanSchema = z.object({
  eventId: z.string().min(1),
  value: z.string().trim().min(3, "Enter a ticket code").max(200),
  gate: z.string().trim().max(60).nullish(),
  deviceKey: z.string().trim().max(80).nullish(),
  deviceName: z.string().trim().max(80).nullish(),
});

export const newsletterSchema = z.object({ email: emailSchema });

// ---- Event wizard --------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const ticketTypeInputSchema = z
  .object({
    id: z.string().nullish(),
    name: trimmed(2, 60, "Ticket name"),
    kind: z.enum(["GENERAL", "VIP", "PREMIUM", "EARLY_BIRD", "CUSTOM"]),
    description: optionalText(240),
    price: z.number({ error: "Enter a price" }).min(0, "Price cannot be negative").max(10_000_000),
    total: z.number({ error: "Enter a quantity" }).int().min(1, "At least 1 ticket").max(1_000_000),
    salesStartAt: optionalText(30),
    salesEndAt: optionalText(30),
    minPerOrder: z.number().int().min(1).max(50),
    maxPerOrder: z.number().int().min(1).max(50),
    perUserLimit: z.number().int().min(1).max(1000).nullish(),
  })
  .refine((t) => t.maxPerOrder >= t.minPerOrder, { path: ["maxPerOrder"], message: "Maximum must be at least the minimum" })
  .refine((t) => !t.salesStartAt || !t.salesEndAt || t.salesStartAt < t.salesEndAt, { path: ["salesEndAt"], message: "Sales must end after they start" });

export const scheduleItemSchema = z.object({ time: trimmed(1, 30, "Time"), title: trimmed(1, 120, "Title") });

const urlOrPath = z.string().trim().max(500).refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "Must be an uploaded image or https link");

/** A draft can be incomplete; submission requires everything (see submitEventSchema). */
export const eventDraftSchema = z.object({
  title: trimmed(3, 120, "Event name"),
  categoryId: z.string().min(1, "Choose a category"),
  shortDescription: z.string().trim().max(240).default(""),
  description: z.string().trim().max(20_000).default(""),
  organizerName: optionalText(120),
  coverImageUrl: urlOrPath.nullish().or(z.literal("")).transform((v) => v || null),
  organizerLogoUrl: urlOrPath.nullish().or(z.literal("")).transform((v) => v || null),
  galleryUrls: z.array(urlOrPath).max(12).default([]),
  mode: z.enum(["OFFLINE", "ONLINE"]).default("OFFLINE"),
  onlineUrl: optionalText(500),
  startsAt: optionalText(30),
  endsAt: optionalText(30),
  venueName: optionalText(160),
  venueAddress: optionalText(240),
  venueCity: optionalText(60),
  ticketTypes: z.array(ticketTypeInputSchema).max(20).default([]),
  schedule: z.array(scheduleItemSchema).max(40).default([]),
  rules: optionalText(5000),
  terms: optionalText(5000),
  refundPolicy: optionalText(5000),
  ageRestriction: optionalText(120),
  instructions: optionalText(5000),
  guestCheckout: z.boolean().default(false),
});

export type EventDraftInput = z.input<typeof eventDraftSchema>;
export type EventDraft = z.output<typeof eventDraftSchema>;

/** Everything a customer needs before an event can go to approval. Returns readable problems. */
export function eventSubmissionProblems(event: EventDraft): string[] {
  const problems: string[] = [];
  if (event.shortDescription.length < 10) problems.push("Add a short description (at least 10 characters).");
  if (event.description.length < 30) problems.push("Add a full description (at least 30 characters).");
  if (!event.coverImageUrl) problems.push("Add a cover image.");
  if (!event.startsAt) problems.push("Set a start date and time.");
  if (!event.endsAt) problems.push("Set an end date and time.");
  if (event.startsAt && event.endsAt && event.startsAt >= event.endsAt) problems.push("The event must end after it starts.");
  if (event.mode === "OFFLINE" && (!event.venueName || !event.venueAddress || !event.venueCity)) problems.push("Add the venue name, address and city.");
  if (event.mode === "ONLINE" && !event.onlineUrl) problems.push("Add the link for your online event.");
  if (event.ticketTypes.length === 0) problems.push("Add at least one ticket category.");
  return problems;
}

export const promoInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Use 3-30 letters, numbers, - or _"),
    name: trimmed(2, 80, "Name"),
    discountType: z.enum(["FIXED", "PERCENT"]),
    discountValue: z.coerce.number().positive("Enter a discount"),
    maxDiscount: z.coerce.number().min(0).optional(),
    eventId: z.string().optional(),
    ticketTypeId: z.string().optional(),
    categoryId: z.string().optional(),
    usageLimit: z.coerce.number().int().min(1).optional(),
    perUserLimit: z.coerce.number().int().min(1).optional(),
    minOrder: z.coerce.number().min(0).optional(),
    startsAt: z.string().optional(),
    expiresAt: z.string().optional(),
  })
  .refine((p) => p.discountType !== "PERCENT" || p.discountValue <= 100, { path: ["discountValue"], message: "A percentage cannot exceed 100" });

export const payoutRequestSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount"),
  note: z.string().trim().max(240).optional(),
});

export const organizationSchema = z.object({
  name: trimmed(2, 120, "Organization name"),
  description: optionalText(2000),
  logoUrl: urlOrPath.nullish().or(z.literal("")).transform((v) => v || null),
  website: optionalText(200),
  email: emailSchema.or(z.literal("")).nullish().transform((v) => v || null),
  phone: phoneSchema.or(z.literal("")).nullish().transform((v) => v || null),
  address: optionalText(240),
  city: optionalText(60),
  payoutMethod: optionalText(40),
  payoutAccountName: optionalText(120),
  payoutAccountNumber: optionalText(60),
});

export const reviewSchema = z.object({
  eventId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

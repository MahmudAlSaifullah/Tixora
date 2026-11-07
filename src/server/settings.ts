import { z } from "zod";
import { db, type Tx } from "./db";

export const settingsSchema = z.object({
  reservationMinutes: z.number().int().min(2).max(120),
  platformFeeBps: z.number().int().min(0).max(5000),
  platformFeeFlatMinor: z.number().int().min(0).max(1_000_000),
  taxBps: z.number().int().min(0).max(5000),
  commissionBps: z.number().int().min(0).max(5000),
  minPayoutMinor: z.number().int().min(0),
  requireEventApproval: z.boolean(),
  supportEmail: z.string().email(),
  supportPhone: z.string().min(3).max(40),
  supportAddress: z.string().max(200),
  socialFacebook: z.string().url().or(z.literal("")),
  socialInstagram: z.string().url().or(z.literal("")),
  socialYoutube: z.string().url().or(z.literal("")),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;

export const SETTING_DEFAULTS: PlatformSettings = {
  reservationMinutes: Number(process.env.RESERVATION_MINUTES ?? 10),
  platformFeeBps: 250, // 2.5% booking fee charged to the customer
  platformFeeFlatMinor: 0,
  taxBps: 1500, // 15% VAT, applied to the platform fee
  commissionBps: 500, // 5% taken from the organizer's ticket revenue
  minPayoutMinor: 100_000, // ৳1,000
  requireEventApproval: true,
  supportEmail: "support@tixora.example",
  supportPhone: "+880 9600-000000",
  supportAddress: "Dhaka, Bangladesh",
  // Empty hides the icon in the footer. Set real profile links under Admin > Settings.
  socialFacebook: "",
  socialInstagram: "",
  socialYoutube: "",
};

/** Pass the open transaction when calling from inside one, so it never waits for a second connection. */
export async function getSettings(client: Tx = db): Promise<PlatformSettings> {
  const rows = await client.platformSetting.findMany();
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of rows) if (row.key in SETTING_DEFAULTS) merged[row.key] = row.value;
  return merged as PlatformSettings;
}

export async function saveSettings(input: Partial<PlatformSettings>) {
  const parsed = settingsSchema.partial().parse(input);
  await db.$transaction(
    Object.entries(parsed).map(([key, value]) =>
      db.platformSetting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    ),
  );
}

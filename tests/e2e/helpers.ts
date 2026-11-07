import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl, PASSWORD } from "./e2e-env";

export { PASSWORD };

export async function login(page: Page, email: string, password = PASSWORD) {
  // Every test shares one IP, so its logins would otherwise add up to the real rate limit.
  await sql(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%'`);
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

export async function sql<T extends Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(query, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** The link inside the newest email of a template, as written by the "log" email transport. */
export function latestEmailLink(template: string, email: string): string {
  const dir = path.join(process.cwd(), ".data", "emails");
  const file = readdirSync(dir)
    .filter((name) => name.includes(`-${template}-`) && name.includes(email.replace(/[^a-z0-9@.]/gi, "_")))
    .sort()
    .pop();
  if (!file) throw new Error(`No ${template} email for ${email}`);
  const match = readFileSync(path.join(dir, file), "utf8").match(/href="(http[^"]+token=[^"]+)"/);
  if (!match) throw new Error("No link in email");
  return match[1].replace(/&amp;/g, "&");
}

export function qrTokenFor(ticket: { id: string; qrNonce: string }) {
  return `TXR1.${createHmac("sha256", process.env.QR_TOKEN_SECRET!).update(`${ticket.id}:${ticket.qrNonce}`).digest("base64url")}`;
}

/** Runs the whole booking wizard from an event page, up to the payment page. */
export async function bookOneTicket(page: Page, slug: string, options: { promo?: string; attendee?: string; contact?: { name: string; email: string; phone: string } } = {}) {
  await page.goto(`/events/${slug}`);
  const panel = page.locator("aside").first();
  await panel.getByRole("button", { name: /^More / }).first().click();
  await panel.getByRole("button", { name: "Book Tickets" }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${slug}/book`));

  await page.getByRole("button", { name: "Continue" }).first().click();
  await page.fill("#attendee-0-name", options.attendee ?? "Test Attendee");
  await page.getByRole("button", { name: "Continue" }).first().click();
  if (options.contact) {
    await page.fill("#contact-name", options.contact.name);
    await page.fill("#contact-email", options.contact.email);
    await page.fill("#contact-phone", options.contact.phone);
  } else {
    await page.fill("#contact-phone", "01712345678");
  }
  if (options.promo) {
    await page.getByRole("textbox", { name: "Promo code" }).fill(options.promo);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("applied")).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue" }).first().click();
  await page.getByRole("button", { name: /Continue to payment/ }).first().click();
  await expect(page).toHaveURL(/\/checkout\//);
}

export async function payWithTestGateway(page: Page, outcome: "successful" | "failed") {
  await page.getByRole("button", { name: "Pay securely" }).click();
  await expect(page).toHaveURL(/\/payments\/test\//);
  await expect(page.getByText("Test mode: no real money moves")).toBeVisible();
  await page.getByRole("button", { name: `Simulate ${outcome} payment` }).click();
  await expect(page).toHaveURL(/\/orders\//);
}

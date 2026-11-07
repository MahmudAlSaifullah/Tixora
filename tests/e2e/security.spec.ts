import { expect, test } from "@playwright/test";
import { login, logout, sql } from "./helpers";

const PRIVATE_PATHS = ["/admin", "/admin/users", "/organizer/dashboard", "/scanner", "/my-tickets", "/my-orders", "/profile", "/settings"];

test.describe("role-based access", () => {
  test("logged-out visitors are sent to login, with a way back", async ({ page }) => {
    for (const target of PRIVATE_PATHS) {
      await page.goto(target);
      await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=${encodeURIComponent(target).replace(/\//g, "%2F")}`));
    }
  });

  test("customers can't reach admin, organizer or scanner areas", async ({ page }) => {
    await login(page, "customer6@tixora.test");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    await page.goto("/organizer/dashboard");
    await expect(page).not.toHaveURL(/\/organizer\/dashboard/);
    await page.goto("/scanner");
    await expect(page).not.toHaveURL(/\/scanner/);

    expect((await page.request.get("/api/exports/sales")).status()).toBe(403);
    expect((await page.request.post("/api/organizer/events", { data: { title: "Sneaky event", categoryId: "x" } })).status()).toBe(403);
    expect((await page.request.post("/api/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } })).status()).toBe(403);
    const [{ id: eventId }] = await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = 'neon-monsoon-live-dhaka'`);
    expect((await page.request.post("/api/scanner/validate", { data: { eventId, value: "TXR-XXXX-XXXX" } })).status()).toBe(403);
  });

  test("scanners can't reach admin or organizer data", async ({ page }) => {
    await login(page, "scanner@tixora.test");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    await page.goto("/organizer/dashboard");
    await expect(page).toHaveURL(/\/scanner/);
    expect((await page.request.get("/api/exports/attendees")).status()).toBe(403);
  });

  test("organizers can't reach admin pages", async ({ page }) => {
    await login(page, "organizer@tixora.test");
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe("suspending an organizer", () => {
  test("takes their events off sale", async ({ page }) => {
    await login(page, "admin@tixora.test");
    await page.goto("/admin/organizers?q=Campus");
    await page.getByRole("button", { name: "Suspend" }).click();
    await page.fill("#action-reason", "End-to-end test suspension");
    await page.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText("Organizer suspended.")).toBeVisible();
    await logout(page);
    expect((await page.goto("/events/coxs-bazar-food-carnival"))?.status()).toBe(404);
    // Restored for the rest of the suite.
    await sql(`UPDATE "Organization" SET status = 'APPROVED' WHERE slug = 'campus-connect'`);
    await sql(`UPDATE "Event" e SET status = 'PUBLISHED' FROM "Organization" o WHERE o.id = e."organizationId" AND o.slug = 'campus-connect'`);
  });
});

test.describe("organizer data isolation", () => {
  test("one organizer can't see or change another's event", async ({ page }) => {
    const [{ id: foreignEvent }] = await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = 'padma-riverside-half-marathon'`);
    await login(page, "organizer@tixora.test");

    const response = await page.goto(`/organizer/events/${foreignEvent}/edit`);
    expect(response?.status()).toBe(404);

    expect((await page.request.put(`/api/organizer/events/${foreignEvent}`, { data: { title: "Hijacked", categoryId: "x" } })).status()).toBe(404);
    expect((await page.request.post(`/api/organizer/events/${foreignEvent}/submit`)).status()).toBe(404);
    expect((await page.request.get(`/api/exports/attendees?eventId=${foreignEvent}`)).status()).toBe(404);
    expect((await page.request.get(`/api/exports/sales?eventId=${foreignEvent}`)).status()).toBe(404);

    const [{ title }] = await sql<{ title: string }>(`SELECT title FROM "Event" WHERE id = $1`, [foreignEvent]);
    expect(title).toBe("Padma Riverside Half Marathon");

    await page.goto(`/organizer/attendees?eventId=${foreignEvent}`);
    await expect(page.getByText("No attendees found")).toBeVisible();
    await page.goto("/organizer/orders?q=");
    await expect(page.getByText("Padma Riverside")).toHaveCount(0);
  });

  test("a customer can't open someone else's order or ticket", async ({ page }) => {
    const [other] = await sql<{ reference: string; code: string }>(`
      SELECT b.reference, t.code FROM "Booking" b JOIN "Ticket" t ON t."bookingId" = b.id
      JOIN "User" u ON u.id = b."userId" WHERE u.email = 'customer@tixora.test' LIMIT 1`);
    await login(page, "customer7@tixora.test");
    expect((await page.goto(`/orders/${other.reference}`))?.status()).toBe(404);
    expect((await page.goto(`/tickets/${other.code}`))?.status()).toBe(404);
    expect((await page.request.get(`/api/tickets/${other.code}/pdf`)).status()).toBe(404);
    expect((await page.request.get(`/api/bookings/${other.reference}`)).status()).toBe(404);
  });
});

test.describe("sessions", () => {
  test("suspending a user ends their session at once", async ({ page, browser }) => {
    const victim = await browser.newContext();
    const victimPage = await victim.newPage();
    await login(victimPage, "customer8@tixora.test");
    await victimPage.goto("/my-orders");
    await expect(victimPage).toHaveURL(/\/my-orders/);

    await login(page, "admin@tixora.test");
    await page.goto("/admin/users?q=customer8@tixora.test");
    await page.getByRole("button", { name: "Suspend" }).click();
    await page.fill("#action-reason", "End-to-end test suspension");
    await page.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText("User suspended.")).toBeVisible();

    await victimPage.goto("/my-orders");
    await expect(victimPage).toHaveURL(/\/login/);
    await victimPage.fill("#email", "customer8@tixora.test");
    await victimPage.fill("#password", "Demo@12345");
    await victimPage.click('button[type="submit"]');
    await expect(victimPage.getByText("This account has been suspended.")).toBeVisible();
    await victim.close();
  });

  test("repeated failed logins are rate limited", async ({ page }) => {
    await page.goto("/login");
    for (let i = 0; i < 11; i++) {
      await page.fill("#email", "customer9@tixora.test");
      await page.fill("#password", `wrong-password-${i}`);
      await page.click('button[type="submit"]');
      await expect(page.locator('[role="alert"]').first()).toBeVisible();
    }
    await expect(page.getByText("Too many attempts")).toBeVisible();
  });
});

test.describe("payment and API hardening", () => {
  test("a forged webhook is rejected and changes nothing", async ({ page, request }) => {
    await login(page, "customer10@tixora.test");
    const [{ id: eventId }] = await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = 'dhaka-tech-summit'`);
    const [{ id: ticketTypeId }] = await sql<{ id: string }>(`SELECT t.id FROM "TicketType" t WHERE t."eventId" = $1 AND t.name = 'Conference Pass'`, [eventId]);
    const created = await page.request.post("/api/bookings", {
      data: { eventId, items: [{ ticketTypeId, quantity: 1, attendees: [{ name: "Forged Case" }] }], contact: { name: "Forged Case", email: "customer10@tixora.test", phone: "01712345678" }, idempotencyKey: `forged-${Date.now()}-abcdef` },
    });
    const { reference } = await created.json();
    expect((await page.request.post("/api/payments/initiate", { data: { reference, gateway: "test" } })).status()).toBe(200);
    const [{ merchantTxnId, amountMinor }] = await sql<{ merchantTxnId: string; amountMinor: number }>(`SELECT p."merchantTxnId", p."amountMinor" FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId" WHERE b.reference = $1`, [reference]);

    const forged = await request.post("/api/payments/webhook/test", { form: { txn: merchantTxnId, outcome: "SUCCESS", amount: String(amountMinor), sig: "forged-signature" } });
    expect(forged.status()).toBe(401);
    const unsignedPage = await request.post(`/api/payments/test/decide`, { data: { txn: merchantTxnId, sig: "bad-signature-bad", outcome: "SUCCESS" } });
    expect(unsignedPage.status()).toBe(403);
    // A browser redirect claiming success changes nothing either.
    await request.get(`/api/payments/callback/test?txn=${merchantTxnId}&outcome=SUCCESS&amount=${amountMinor}&sig=x`, { maxRedirects: 0 });

    const [booking] = await sql<{ status: string }>(`SELECT status FROM "Booking" WHERE reference = $1`, [reference]);
    expect(booking.status).toBe("PENDING");
    expect((await sql(`SELECT t.id FROM "Ticket" t JOIN "Booking" b ON b.id = t."bookingId" WHERE b.reference = $1`, [reference])).length).toBe(0);
  });

  test("the client can't set the price", async ({ page }) => {
    await login(page, "customer11@tixora.test");
    const [{ id: eventId }] = await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = 'neon-monsoon-live-dhaka'`);
    const [{ id: ticketTypeId, priceMinor }] = await sql<{ id: string; priceMinor: number }>(`SELECT id, "priceMinor" FROM "TicketType" WHERE "eventId" = $1 AND name = 'VIP'`, [eventId]);
    const response = await page.request.post("/api/bookings", {
      data: { eventId, items: [{ ticketTypeId, quantity: 1, attendees: [{ name: "Price Hacker" }], priceMinor: 1, unitPriceMinor: 1 }], totalMinor: 1, contact: { name: "Price Hacker", email: "customer11@tixora.test", phone: "01712345678" }, idempotencyKey: `price-${Date.now()}-abcdef` },
    });
    const body = await response.json();
    expect(body.totalMinor).toBeGreaterThan(priceMinor);
  });

  test("cross-site POSTs are refused", async ({ page }) => {
    await login(page, "customer12@tixora.test");
    const response = await page.request.post("/api/bookings/quote", { headers: { Origin: "https://evil.example" }, data: {} });
    expect(response.status()).toBe(403);
  });

  test("invalid input and non-image uploads are refused", async ({ page }) => {
    await login(page, "organizer@tixora.test");
    const notImage = await page.request.post("/api/uploads", { multipart: { file: { name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } } });
    expect(notImage.status()).toBe(400);
    const svg = await page.request.post("/api/uploads", { multipart: { file: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)>") } } });
    expect(svg.status()).toBe(400);
    const invalid = await page.request.post("/api/bookings", { data: { eventId: "" } });
    expect(invalid.status()).toBe(422);
  });

  test("cron endpoints need the secret", async ({ request }) => {
    expect((await request.get("/api/cron/release-reservations")).status()).toBe(401);
    const ok = await request.get("/api/cron/release-reservations", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
  });

  test("security headers are sent, and event text can't inject markup", async ({ page, request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();

    await sql(`UPDATE "Event" SET description = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script> Plain text' WHERE slug = 'product-design-bootcamp'`);
    await page.goto("/events/product-design-bootcamp");
    await expect(page.getByText("<img src=x")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("the client bundle contains no server secrets", async ({ request, page }) => {
    await page.goto("/");
    const scripts = await page.locator("script[src]").evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).src));
    for (const src of scripts) {
      const body = await (await request.get(src)).text();
      for (const name of ["AUTH_SECRET", "QR_TOKEN_SECRET", "APP_SIGNING_SECRET", "CRON_SECRET"]) {
        const value = process.env[name]!;
        expect(body).not.toContain(value);
      }
    }
  });
});

test.afterEach(async ({ page }) => {
  await logout(page);
});

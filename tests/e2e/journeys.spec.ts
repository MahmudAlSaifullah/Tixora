import path from "node:path";
import { expect, test } from "@playwright/test";
import { bookOneTicket, latestEmailLink, login, logout, payWithTestGateway, PASSWORD, sql } from "./helpers";

test.describe("accounts", () => {
  const email = `e2e-${Date.now()}@example.test`;

  test("register, verify email, log out, reset password, log in again", async ({ page }) => {
    await page.goto("/register");
    await page.fill("#name", "End To End");
    await page.fill("#email", email);
    await page.fill("#password", "weak");
    await page.click('button[type="submit"]');
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await page.fill("#password", "Str0ng-Password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/my-tickets/);

    // The verification link from the email works once.
    const verifyLink = latestEmailLink("verifyEmail", email);
    await page.goto(verifyLink);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.goto(verifyLink);
    await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();

    await logout(page);
    await page.goto("/forgot-password");
    await page.fill("#email", email);
    await page.click('button[type="submit"]');
    await expect(page.getByText("Check your email")).toBeVisible();

    await page.goto(latestEmailLink("passwordReset", email));
    await page.fill("#password", "An0ther-Password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login\?reset=1/);

    await page.fill("#email", email);
    await page.fill("#password", "Str0ng-Password");
    await page.click('button[type="submit"]');
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();

    await login(page, email, "An0ther-Password");
  });

  test("a duplicate email is refused", async ({ page }) => {
    await page.goto("/register");
    await page.fill("#name", "Someone Else");
    await page.fill("#email", "customer@tixora.test");
    await page.fill("#password", "Str0ng-Password");
    await page.click('button[type="submit"]');
    await expect(page.getByText("already exists")).toBeVisible();
  });
});

test.describe("discovery", () => {
  test("homepage shows database events, and search and filters work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Find Your Next Experience." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured Events" })).toBeVisible();
    await expect(page.getByText("Neon Monsoon Live: Dhaka").first()).toBeVisible();

    await page.getByRole("main").getByLabel("Search events").fill("Padma");
    await page.getByRole("button", { name: "Explore Events" }).click();
    await expect(page).toHaveURL(/\/events\?q=Padma/);
    await expect(page.getByText("1 event found")).toBeVisible();

    await page.goto("/events?city=Sylhet");
    await expect(page.getByRole("heading", { name: /Boishakhi Sur/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Neon Monsoon/ })).toHaveCount(0);

    await page.goto("/events?when=completed");
    await expect(page.getByRole("heading", { name: /Adda After Dark/ })).toBeVisible();

    await page.goto("/events?maxPrice=250");
    await expect(page.getByRole("heading", { name: /Spring Campus Carnival/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Dhaka Tech Summit/ })).toHaveCount(0);

    await page.goto("/events?q=zzzznothing");
    await expect(page.getByText("No events match your filters")).toBeVisible();
  });

  test("drafts and unapproved events are not public", async ({ page }) => {
    for (const slug of ["winter-jazz-rooftop-draft", "chattogram-indie-music-weekender"]) {
      const response = await page.goto(`/events/${slug}`);
      expect(response?.status()).toBe(404);
    }
  });
});

test.describe("purchase", () => {
  test("a paid booking with a promo code issues a QR ticket and a PDF", async ({ page }) => {
    await login(page, "customer2@tixora.test");
    await bookOneTicket(page, "dhaka-tech-summit", { promo: "WELCOME10", attendee: "Promo Person" });

    await expect(page.getByText("Your tickets are held for")).toBeVisible();
    await expect(page.getByText("Discount (WELCOME10)")).toBeVisible();
    await expect(page.getByText("Platform fee")).toBeVisible();
    await expect(page.getByText("VAT")).toBeVisible();

    // No tickets may exist before payment.
    const reference = page.url().split("/checkout/")[1].split("?")[0];
    expect((await sql(`SELECT t.id FROM "Ticket" t JOIN "Booking" b ON b.id = t."bookingId" WHERE b.reference = $1`, [reference])).length).toBe(0);

    await payWithTestGateway(page, "successful");
    await expect(page.getByText("Payment confirmed. You're going!")).toBeVisible();
    await expect(page.getByText("Promo Person")).toBeVisible();
    await expect(page.getByText("(test payment, no real money moved)")).toBeVisible();

    await page.getByRole("link", { name: /Promo Person/ }).click();
    await expect(page.getByRole("img", { name: "Ticket QR code" }).locator("svg")).toBeVisible();

    // The PDF is a real PDF.
    const code = page.url().split("/tickets/")[1];
    const pdf = await page.request.get(`/api/tickets/${code}/pdf`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/my-tickets");
    await expect(page.getByRole("heading", { name: "Dhaka Tech Summit" }).first()).toBeVisible();
    await page.goto("/my-orders");
    await expect(page.getByRole("link", { name: reference })).toBeVisible();
  });

  test("a failed payment issues nothing and can be retried", async ({ page }) => {
    await login(page, "customer3@tixora.test");
    await bookOneTicket(page, "padma-riverside-half-marathon");
    const reference = page.url().split("/checkout/")[1].split("?")[0];

    await payWithTestGateway(page, "failed");
    await expect(page.getByText("Payment failed")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your tickets" })).toHaveCount(0);

    await page.getByRole("link", { name: "Continue to payment" }).click();
    await payWithTestGateway(page, "successful");
    await expect(page.getByText("Payment confirmed. You're going!")).toBeVisible();

    const rows = await sql<{ status: string }>(`SELECT p.status FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId" WHERE b.reference = $1 ORDER BY p."createdAt"`, [reference]);
    expect(rows.map((r) => r.status)).toEqual(["FAILED", "SUCCEEDED"]);
  });

  test("cancelling checkout releases the hold at once", async ({ page }) => {
    await login(page, "customer4@tixora.test");
    await bookOneTicket(page, "shilpo-contemporary-art-expo");
    const reference = page.url().split("/checkout/")[1].split("?")[0];
    await page.getByRole("button", { name: "Cancel this order" }).click();
    await expect(page).toHaveURL(/\/events\/shilpo-contemporary-art-expo/);
    const [row] = await sql<{ status: string }>(`SELECT status FROM "Booking" WHERE reference = $1`, [reference]);
    expect(row.status).toBe("CANCELLED");
  });

  test("guest checkout works on allowed events, and the order is private to its link", async ({ page, browser }) => {
    await bookOneTicket(page, "bay-t20-championship-final", { contact: { name: "Guest Buyer", email: "guest-buyer@example.test", phone: "01812345678" } });
    await expect(page).toHaveURL(/\/checkout\/.+\?t=/);
    await payWithTestGateway(page, "successful");
    await expect(page.getByText("Payment confirmed. You're going!")).toBeVisible();
    const withToken = page.url();
    const reference = withToken.split("/orders/")[1].split("?")[0];

    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`/orders/${reference}`);
    await expect(strangerPage).toHaveURL(/\/login/);
    await strangerPage.goto(`/orders/${reference}?t=wrong-token`);
    await expect(strangerPage.getByText("We couldn't find that page")).toBeVisible();
    await stranger.close();
  });

  test("events without guest checkout send visitors to log in", async ({ page }) => {
    await page.goto("/events/neon-monsoon-live-dhaka");
    const panel = page.locator("aside").first();
    await panel.getByRole("button", { name: /^More / }).nth(1).click();
    await panel.getByRole("button", { name: "Book Tickets" }).click();
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  });

  test("a sold-out ticket type can't be bought", async ({ page }) => {
    await sql(`UPDATE "TicketInventory" i SET total = i.sold + i.reserved FROM "TicketType" t JOIN "Event" e ON e.id = t."eventId" WHERE t.id = i."ticketTypeId" AND e.slug = 'coxs-bazar-food-carnival' AND t.name = 'Family Pack'`);
    await page.goto("/events/coxs-bazar-food-carnival");
    await expect(page.locator("aside").first().getByText("Sold out")).toBeVisible();
  });
});

test.describe("organizer and admin", () => {
  test("wizard, draft, submit, admin approval, then on sale", async ({ page }) => {
    const title = `E2E Launch Party ${Date.now()}`;
    await login(page, "organizer@tixora.test");
    await page.goto("/organizer/events/new");

    await page.fill("#title", title);
    await page.fill("#shortDescription", "A launch party created by the end-to-end test.");
    await page.fill("#description", "This event was created by the end-to-end test to prove the full approval journey works.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/organizer\/events\/.+\/edit/);

    await page.getByRole("button", { name: /Media/ }).click();
    await page.getByTestId("upload-Cover image").setInputFiles(path.join(process.cwd(), "public/demo/covers/fest1.jpg"));
    await expect(page.getByRole("button", { name: "Replace" })).toBeVisible();

    await page.getByRole("button", { name: /Date and venue/ }).click();
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await page.fill("#startsAt", `${future}T18:00`);
    await page.fill("#endsAt", `${future}T22:00`);
    await page.fill("#venueName", "Test Hall");
    await page.fill("#venueAddress", "1 Test Road");

    await page.getByRole("button", { name: /Review and publish/ }).click();
    await expect(page.getByText("Everything's in place.")).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page).toHaveURL(/\/organizer\/events$/);
    await expect(page.getByRole("row", { name: new RegExp(title) }).getByText("Pending approval")).toBeVisible();

    const [{ slug, coverImageUrl }] = await sql<{ slug: string; coverImageUrl: string }>(`SELECT slug, "coverImageUrl" FROM "Event" WHERE title = $1`, [title]);
    expect((await page.goto(`/events/${slug}`))?.status()).toBe(404);

    // A file uploaded after the build is served by the running production server, directly and
    // through the image optimizer.
    const image = await page.request.get(coverImageUrl);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
    expect((await page.request.get(`/_next/image?url=${encodeURIComponent(coverImageUrl)}&w=640&q=75`)).status()).toBe(200);
    expect((await page.request.get("/uploads/..%2F..%2F.env")).status()).toBe(404);

    await logout(page);
    await login(page, "admin@tixora.test");
    await page.goto("/admin/approvals");
    const card = page.getByRole("listitem").filter({ hasText: title });
    await card.getByRole("button", { name: "Approve and publish" }).click();
    await expect(page.getByText("Event approved and published.")).toBeVisible();

    await logout(page);
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator("aside").first().getByRole("button", { name: "Book Tickets" })).toBeVisible();
  });

  test("an admin can reject with a reason, and the organizer sees it", async ({ page }) => {
    await login(page, "admin@tixora.test");
    await page.goto("/admin/approvals");
    const card = page.getByRole("listitem").filter({ hasText: "Chattogram Indie Music Weekender" });
    await card.getByRole("button", { name: "Reject" }).click();
    await page.fill("#action-reason", "Please add a clearer venue description.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Event rejected.")).toBeVisible();

    await logout(page);
    await login(page, "organizer@tixora.test");
    await page.goto("/organizer/events?status=REJECTED");
    await expect(page.getByText("Please add a clearer venue description.")).toBeVisible();
  });

  test("processing a refund voids tickets and restores stock", async ({ page }) => {
    const [before] = await sql<{ sold: number; id: string; reference: string }>(`
      SELECT i.sold, b.id, b.reference FROM "Refund" r
      JOIN "Booking" b ON b.id = r."bookingId"
      JOIN "BookingItem" bi ON bi."bookingId" = b.id
      JOIN "TicketInventory" i ON i."ticketTypeId" = bi."ticketTypeId"
      WHERE r.status = 'REQUESTED' LIMIT 1`);
    await login(page, "admin@tixora.test");
    await page.goto(`/admin/refunds?q=${before.reference}`);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Send refund" }).click();
    await expect(page.getByText("Refund completed.")).toBeVisible();

    const tickets = await sql<{ status: string }>(`SELECT status FROM "Ticket" WHERE "bookingId" = $1`, [before.id]);
    expect(tickets.every((t) => t.status === "REFUNDED")).toBe(true);
    const [after] = await sql<{ sold: number }>(`
      SELECT i.sold FROM "BookingItem" bi JOIN "TicketInventory" i ON i."ticketTypeId" = bi."ticketTypeId" WHERE bi."bookingId" = $1`, [before.id]);
    expect(after.sold).toBe(before.sold - tickets.length);
  });

  test("promo codes: an organizer creates one and a customer sees it apply", async ({ page }) => {
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await login(page, "organizer@tixora.test");
    await page.goto("/organizer/promo-codes");
    await page.fill("#code", code);
    await page.fill("#name", "E2E promo");
    await page.fill("#discountValue", "20");
    await page.getByRole("button", { name: "Create code" }).click();
    await expect(page.getByText("Promo code created.")).toBeVisible();

    await logout(page);
    await login(page, "customer5@tixora.test");
    await bookOneTicket(page, "dhaka-tech-summit", { promo: code });
    await expect(page.getByText(`Discount (${code})`)).toBeVisible();
    // A code from this organizer must not work on another organizer's event.
    await page.getByRole("button", { name: "Cancel this order" }).click();
    const quote = await page.request.post("/api/bookings/quote", {
      data: {
        eventId: (await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = 'padma-riverside-half-marathon'`))[0].id,
        items: [{ ticketTypeId: (await sql<{ id: string }>(`SELECT t.id FROM "TicketType" t JOIN "Event" e ON e.id = t."eventId" WHERE e.slug = 'padma-riverside-half-marathon' LIMIT 1`))[0].id, quantity: 1 }],
        promoCode: code,
      },
    });
    expect(quote.status()).toBe(400);
  });

  test("CSV exports contain the organizer's own data only", async ({ page }) => {
    await login(page, "organizer@tixora.test");
    const response = await page.request.get("/api/exports/sales");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const csv = await response.text();
    expect(csv).toContain("Neon Monsoon");
    expect(csv).not.toContain("Padma Riverside");
    const attendees = await (await page.request.get("/api/exports/attendees")).text();
    expect(attendees).toContain("Ticket code");
  });

  test("a payout can't exceed the balance", async ({ page }) => {
    await login(page, "organizer@tixora.test");
    await page.goto("/organizer/payouts");
    await page.fill("#amount", "99999999");
    await page.getByRole("button", { name: "Request payout" }).click();
    await expect(page.getByText("more than your available balance").first()).toBeVisible();
    await page.fill("#amount", "1500");
    await page.getByRole("button", { name: "Request payout" }).click();
    await expect(page.getByText("Payout requested.")).toBeVisible();
  });
});

test.describe("email", () => {
  test("a confirmed booking writes the confirmation emails", async () => {
    const rows = await sql<{ template: string }>(`SELECT DISTINCT template FROM "EmailLog" WHERE "to" = 'customer2@tixora.test'`);
    expect(rows.map((r) => r.template).sort()).toEqual(["bookingConfirmation", "paymentConfirmation", "ticketDelivery"]);
  });
});

void PASSWORD;

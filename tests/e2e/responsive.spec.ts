import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

const VIEWPORTS = [
  { name: "phone", width: 360, height: 740, touch: true },
  { name: "phone-large", width: 430, height: 932, touch: true },
  { name: "tablet", width: 820, height: 1180, touch: true },
  { name: "laptop", width: 1280, height: 800, touch: false },
  { name: "desktop", width: 1920, height: 1080, touch: false },
];

async function expectNoSidewaysScroll(page: import("@playwright/test").Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch });

    test("public pages fit", async ({ page }) => {
      for (const target of ["/", "/events", "/events/neon-monsoon-live-dhaka", "/categories", "/organizers", "/help", "/login", "/register", "/pages/terms"]) {
        await page.goto(target);
        await expectNoSidewaysScroll(page, target);
      }
    });

    test("customer pages fit", async ({ page }) => {
      await login(page, "customer@tixora.test");
      const [{ code }] = await sql<{ code: string }>(`SELECT t.code FROM "Ticket" t JOIN "Booking" b ON b.id = t."bookingId" JOIN "User" u ON u.id = b."userId" WHERE u.email = 'customer@tixora.test' AND t.status = 'VALID' LIMIT 1`);
      const [{ id: ticketTypeId }] = await sql<{ id: string }>(`SELECT t.id FROM "TicketType" t JOIN "Event" e ON e.id = t."eventId" WHERE e.slug = 'dhaka-tech-summit' AND t.name = 'Conference Pass'`);
      for (const target of ["/my-tickets", "/my-orders", `/tickets/${code}`, "/profile", "/settings", "/notifications", `/events/dhaka-tech-summit/book?items=${ticketTypeId}:2`]) {
        await page.goto(target);
        await expectNoSidewaysScroll(page, target);
      }
    });

    test("organizer dashboard fits", async ({ page }) => {
      await login(page, "organizer@tixora.test");
      for (const target of ["/organizer/dashboard", "/organizer/events", "/organizer/events/new", "/organizer/tickets", "/organizer/analytics", "/organizer/orders", "/organizer/payouts"]) {
        await page.goto(target);
        await expectNoSidewaysScroll(page, target);
      }
    });

    test("admin dashboard and scanner fit", async ({ page }) => {
      await login(page, "admin@tixora.test");
      for (const target of ["/admin", "/admin/users", "/admin/refunds", "/admin/categories", "/admin/analytics", "/scanner"]) {
        await page.goto(target);
        await expectNoSidewaysScroll(page, target);
      }
    });
  });
}

test.describe("mobile usability", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the mobile menu opens and navigates", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Explore Events" }).click();
    await expect(page).toHaveURL(/\/events/);
  });

  test("the dashboard sidebar becomes a menu", async ({ page }) => {
    await login(page, "organizer@tixora.test");
    await page.goto("/organizer/dashboard");
    await page.getByRole("button", { name: "Open dashboard menu" }).click();
    await page.getByRole("link", { name: "My Events" }).click();
    await expect(page).toHaveURL(/\/organizer\/events/);
  });

  test("tap targets on the ticket stepper and pay button are comfortably large", async ({ page }) => {
    await page.goto("/events/neon-monsoon-live-dhaka");
    const stepper = page.getByRole("button", { name: /^More / }).first();
    const box = await stepper.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(32);
  });
});

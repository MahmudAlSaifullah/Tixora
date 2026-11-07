import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import QRCode from "qrcode";
import { login, qrTokenFor, sql } from "./helpers";
import { E2E_PORT, PASSWORD } from "./e2e-env";

const EVENT_SLUG = "spring-campus-carnival";

async function validTickets() {
  return sql<{ id: string; code: string; qrNonce: string; name: string }>(
    `SELECT t.id, t.code, t."qrNonce", a.name FROM "Ticket" t
     JOIN "Attendee" a ON a.id = t."attendeeId"
     JOIN "Event" e ON e.id = t."eventId"
     WHERE e.slug = $1 AND t.status = 'VALID' ORDER BY t.code`,
    [EVENT_SLUG],
  );
}

async function chooseEvent(page: import("@playwright/test").Page) {
  await page.goto("/scanner");
  await page.selectOption("#scan-event", { label: "Spring Campus Carnival" });
  await expect(page.locator("#scan-gate")).toHaveValue("North gate");
}

test.describe("scanner", () => {
  test("manual lookup: valid, duplicate, invalid, wrong event, and live stats", async ({ page }) => {
    await login(page, "scanner@tixora.test");
    await expect(page).toHaveURL(/\/scanner/);
    await chooseEvent(page);
    const before = Number(await page.getByTestId("checked-in-count").textContent());
    const [ticket] = await validTickets();
    const result = page.getByTestId("scan-result");

    await page.fill("#manual-code", ticket.code);
    await page.getByRole("button", { name: "Check" }).click();
    await expect(result).toHaveAttribute("data-result", "ACCEPTED");
    await expect(result.getByText("ENTRY GRANTED", { exact: true })).toBeVisible();
    await expect(result.getByText(ticket.name)).toBeVisible();
    await expect(result.getByText("North gate")).toBeVisible();
    await expect(page.getByTestId("checked-in-count")).toHaveText(String(before + 1));

    await page.fill("#manual-code", ticket.code);
    await page.getByRole("button", { name: "Check" }).click();
    await expect(result).toHaveAttribute("data-result", "DUPLICATE");
    await expect(result.getByText("ALREADY USED", { exact: true })).toBeVisible();

    await page.fill("#manual-code", "TXR-NOTA-REAL");
    await page.getByRole("button", { name: "Check" }).click();
    await expect(result).toHaveAttribute("data-result", "INVALID");

    const [foreign] = await sql<{ code: string }>(`SELECT t.code FROM "Ticket" t JOIN "Event" e ON e.id = t."eventId" WHERE e.slug = 'neon-monsoon-live-dhaka' AND t.status = 'VALID' LIMIT 1`);
    await page.fill("#manual-code", foreign.code);
    await page.getByRole("button", { name: "Check" }).click();
    await expect(result).toHaveAttribute("data-result", "WRONG_EVENT");
    await expect(result.getByText("Attendee")).toHaveCount(0);
  });

  test("two scanners racing over HTTP: exactly one admits the ticket", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: `http://localhost:${E2E_PORT}` });
    const page = await context.newPage();
    await login(page, "scanner@tixora.test");
    const [{ id: eventId }] = await sql<{ id: string }>(`SELECT id FROM "Event" WHERE slug = $1`, [EVENT_SLUG]);
    const [ticket] = await validTickets();
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => page.request.post("/api/scanner/validate", { data: { eventId, value: qrTokenFor(ticket), gate: "Race" } }).then((r) => r.json())),
    );
    const results = responses.map((r) => r.result);
    expect(results.filter((r) => r === "ACCEPTED")).toHaveLength(1);
    expect(results.filter((r) => r === "DUPLICATE")).toHaveLength(11);
    await context.close();
  });

  test("the camera reads a real QR code and admits the ticket", async () => {
    const [ticket] = await validTickets();

    // Draw the ticket's QR into a Y4M video, which Chromium plays back as its webcam.
    const qr = QRCode.create(qrTokenFor(ticket), { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const width = 640;
    const height = 480;
    const scale = Math.floor(400 / (size + 8));
    const offsetX = Math.floor((width - size * scale) / 2);
    const offsetY = Math.floor((height - size * scale) / 2);
    const luma = Buffer.alloc(width * height, 235);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (!qr.modules.get(row, col)) continue;
        for (let y = 0; y < scale; y++) luma.fill(16, (offsetY + row * scale + y) * width + offsetX + col * scale, (offsetY + row * scale + y) * width + offsetX + (col + 1) * scale);
      }
    }
    const chroma = Buffer.alloc((width * height) / 2, 128);
    const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma]);
    const dir = path.join(process.cwd(), "test-results");
    mkdirSync(dir, { recursive: true });
    const video = path.join(dir, "fake-camera.y4m");
    writeFileSync(video, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame, frame, frame]));

    const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`] });
    const context = await browser.newContext({ baseURL: `http://localhost:${E2E_PORT}`, permissions: ["camera"], viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, "scanner@tixora.test", PASSWORD);
    await chooseEvent(page);
    await page.getByRole("button", { name: "Start camera" }).click();

    const result = page.getByTestId("scan-result");
    await expect(result).toHaveAttribute("data-result", "ACCEPTED", { timeout: 30_000 });
    await expect(result.getByText(ticket.name)).toBeVisible();
    const [row] = await sql<{ status: string; method: string }>(`SELECT t.status, c.method FROM "Ticket" t JOIN "CheckIn" c ON c."ticketId" = t.id AND c.result = 'ACCEPTED' WHERE t.id = $1`, [ticket.id]);
    expect(row).toEqual({ status: "USED", method: "QR" });
    await browser.close();
  });

  test("a scanner sees only assigned events", async ({ page }) => {
    await login(page, "scanner@tixora.test");
    await page.goto("/scanner");
    const options = await page.locator("#scan-event option").allTextContents();
    expect(options).toContain("Spring Campus Carnival");
    expect(options).not.toContain("Dhaka Tech Summit");
  });
});

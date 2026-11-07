import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate, formatTime } from "@/lib/dates";
import { qrPngBuffer } from "./qr";
import { deriveQrToken } from "./qr";
import type { TicketWithRelations } from "../services/tickets";

const INK = rgb(0.043, 0.063, 0.125);
const ACCENT = rgb(0.31, 0.275, 1);
const MUTED = rgb(0.4, 0.45, 0.55);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.85, 0.87, 0.92);

/**
 * The PDF standard fonts cover WinAnsi only. Characters outside it (Bangla, for example) are
 * dropped rather than crashing PDF generation; the on-screen ticket shows the full name.
 */
function safe(text: string): string {
  const cleaned = text.normalize("NFKD").replace(/[^\x20-\x7E -ÿ]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "Ticket holder";
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fit(`${kept[maxLines - 1]} ${lines[maxLines]}`, font, size, maxWidth);
  return kept;
}

function field(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: { regular: PDFFont; bold: PDFFont }) {
  page.drawText(label.toUpperCase(), { x, y: y + 15, size: 7.5, font: fonts.regular, color: MUTED });
  page.drawText(fit(safe(value), fonts.bold, 11, width), { x, y, size: 11, font: fonts.bold, color: INK });
}

/** One ticket per page, sized like a physical stub, with the QR on the tear-off side. */
export async function renderTicketsPdf(tickets: TicketWithRelations[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(tickets.length === 1 ? `Tixora ticket ${tickets[0].code}` : "Tixora tickets");
  pdf.setProducer("Tixora");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  for (const ticket of tickets) {
    const page = pdf.addPage([640, 300]);
    const { width, height } = page.getSize();
    const stubX = 440;
    const tz = ticket.event.timezone;

    page.drawRectangle({ x: 0, y: height - 62, width, height: 62, color: INK });
    page.drawText("TIXORA", { x: 26, y: height - 40, size: 18, font: bold, color: WHITE });
    page.drawRectangle({ x: 26, y: height - 50, width: 28, height: 2.5, color: ACCENT });
    const statusLabel = ticket.status === "VALID" ? "ADMIT ONE" : ticket.status;
    page.drawText(statusLabel, {
      x: width - 26 - bold.widthOfTextAtSize(statusLabel, 10),
      y: height - 38,
      size: 10,
      font: bold,
      color: WHITE,
    });

    let y = height - 92;
    for (const line of wrap(safe(ticket.event.title), bold, 17, stubX - 52, 2)) {
      page.drawText(line, { x: 26, y, size: 17, font: bold, color: INK });
      y -= 21;
    }

    const venue = ticket.event.mode === "ONLINE"
      ? "Online event"
      : [ticket.event.venue?.name, ticket.event.venue?.city].filter(Boolean).join(", ") || "Venue to be announced";
    const col2 = 240;
    const row1 = 124;
    const row2 = 80;
    const row3 = 36;
    field(page, "Date", formatDate(ticket.event.startsAt, tz), 26, row1, 195, fonts);
    field(page, "Time", formatTime(ticket.event.startsAt, tz), col2, row1, 180, fonts);
    field(page, "Venue", venue, 26, row2, 195, fonts);
    field(page, "Ticket", ticket.ticketType.name, col2, row2, 180, fonts);
    field(page, "Attendee", ticket.attendee.name, 26, row3, 195, fonts);
    field(page, "Booking reference", ticket.booking.reference, col2, row3, 180, fonts);

    // Perforation between the body and the stub.
    for (let dotY = 8; dotY < height - 62; dotY += 11) {
      page.drawLine({ start: { x: stubX, y: dotY }, end: { x: stubX, y: dotY + 5 }, thickness: 1, color: LINE });
    }

    const qr = await pdf.embedPng(await qrPngBuffer(deriveQrToken(ticket.id, ticket.qrNonce), 420));
    const qrSize = 150;
    const qrX = stubX + (width - stubX - qrSize) / 2;
    page.drawImage(qr, { x: qrX, y: 62, width: qrSize, height: qrSize });
    page.drawText(ticket.code, {
      x: stubX + (width - stubX - bold.widthOfTextAtSize(ticket.code, 10.5)) / 2,
      y: 42,
      size: 10.5,
      font: bold,
      color: INK,
    });
    const note = "Scan once at entry. Do not share.";
    page.drawText(note, {
      x: stubX + (width - stubX - regular.widthOfTextAtSize(note, 7.5)) / 2,
      y: 26,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  }
  return Buffer.from(await pdf.save());
}

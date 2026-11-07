import { env } from "../env";

// Every interpolated value passes through esc(), so user text cannot inject markup into emails.

export const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

interface Layout {
  preheader: string;
  heading: string;
  paragraphs: string[];
  rows?: [string, string][];
  cta?: { label: string; url: string };
  footnote?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function render(subject: string, layout: Layout): RenderedEmail {
  const rows = layout.rows?.length
    ? `<table role="presentation" width="100%" style="margin:20px 0;border-collapse:collapse;font-size:14px">${layout.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#64708a;border-bottom:1px solid #e8ebf3">${esc(k)}</td><td style="padding:8px 0;text-align:right;color:#10162a;font-weight:600;border-bottom:1px solid #e8ebf3">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const cta = layout.cta
    ? `<p style="margin:26px 0"><a href="${esc(layout.cta.url)}" style="background:#4f46ff;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:10px;display:inline-block">${esc(layout.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f2f4fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(layout.preheader)}</span>
<table role="presentation" width="100%"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b1020;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.04em">TIXORA</td></tr>
<tr><td style="padding:28px;color:#2a3350;font-size:15px;line-height:1.6">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#10162a">${esc(layout.heading)}</h1>
${layout.paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("")}
${rows}${cta}
${layout.footnote ? `<p style="margin:18px 0 0;font-size:13px;color:#64708a">${esc(layout.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#f7f8fc;font-size:12px;color:#7b86a0">Tixora, Dhaka, Bangladesh. <a href="${esc(env.appUrl)}" style="color:#4f46ff">${esc(env.appUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    layout.heading,
    "",
    ...layout.paragraphs,
    "",
    ...(layout.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(layout.cta ? ["", `${layout.cta.label}: ${layout.cta.url}`] : []),
    ...(layout.footnote ? ["", layout.footnote] : []),
  ].join("\n");
  return { subject, html, text };
}

export const templates = {
  welcome: (d: { name: string }) =>
    render("Welcome to Tixora", {
      preheader: "Your next experience starts here.",
      heading: `Welcome, ${d.name}`,
      paragraphs: ["Your Tixora account is ready. Discover concerts, marathons, workshops and more across Bangladesh, and keep every ticket in one place."],
      cta: { label: "Explore events", url: `${env.appUrl}/events` },
    }),

  verifyEmail: (d: { name: string; url: string }) =>
    render("Verify your email", {
      preheader: "Confirm your email to finish setting up your account.",
      heading: "Confirm your email",
      paragraphs: [`Hi ${d.name}, please confirm this address to secure your Tixora account.`],
      cta: { label: "Verify email", url: d.url },
      footnote: "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
    }),

  passwordReset: (d: { name: string; url: string }) =>
    render("Reset your password", {
      preheader: "Use this link to choose a new password.",
      heading: "Reset your password",
      paragraphs: [`Hi ${d.name}, use the button below to choose a new password.`],
      cta: { label: "Choose a new password", url: d.url },
      footnote: "This link expires in 1 hour. If you did not ask for this, you can ignore this email.",
    }),

  staffInvite: (d: { name: string; organization: string; url: string }) =>
    render(`You have been added to ${d.organization} on Tixora`, {
      preheader: "Set your password to get started.",
      heading: `Join ${d.organization}`,
      paragraphs: [`Hi ${d.name}, ${d.organization} added you to their team on Tixora. Choose a password to activate your account.`],
      cta: { label: "Set your password", url: d.url },
      footnote: "This link expires in 1 hour. You can request a new one from the Forgot password page.",
    }),

  bookingConfirmation: (d: { name: string; event: string; when: string; venue: string; reference: string; total: string; ticketCount: number; url: string }) =>
    render(`Booking confirmed: ${d.event}`, {
      preheader: `You're going to ${d.event}. Reference ${d.reference}.`,
      heading: "You're going!",
      paragraphs: [`Hi ${d.name}, your booking for ${d.event} is confirmed.`],
      rows: [["Booking reference", d.reference], ["Date", d.when], ["Venue", d.venue], ["Tickets", String(d.ticketCount)], ["Total", d.total]],
      cta: { label: "View your order", url: d.url },
    }),

  paymentConfirmation: (d: { name: string; reference: string; amount: string; method: string; transactionId: string; isTest: boolean }) =>
    render(`${d.isTest ? "[TEST] " : ""}Payment received for ${d.reference}`, {
      preheader: `We received ${d.amount}.`,
      heading: d.isTest ? "Test payment recorded" : "Payment received",
      paragraphs: [
        d.isTest
          ? `Hi ${d.name}, this was a sandbox test payment. No real money moved.`
          : `Hi ${d.name}, we received your payment. Keep this email as your receipt.`,
      ],
      rows: [["Booking reference", d.reference], ["Amount", d.amount], ["Method", d.method], ["Transaction ID", d.transactionId]],
    }),

  ticketDelivery: (d: { name: string; event: string; ticketCount: number; url: string }) =>
    render(`Your tickets for ${d.event}`, {
      preheader: "Your tickets are attached as PDFs.",
      heading: "Your tickets are here",
      paragraphs: [
        `Hi ${d.name}, your ${d.ticketCount === 1 ? "ticket is" : `${d.ticketCount} tickets are`} attached to this email as PDF.`,
        "Show the QR code at the gate, on your phone or printed. Each code admits one person, once.",
      ],
      cta: { label: "Open tickets", url: d.url },
      footnote: "Do not share your QR codes. Anyone holding a code can use it before you do.",
    }),

  eventReminder: (d: { name: string; event: string; when: string; venue: string; url: string }) =>
    render(`Reminder: ${d.event} is coming up`, {
      preheader: `${d.event}, ${d.when}.`,
      heading: `${d.event} is almost here`,
      paragraphs: [`Hi ${d.name}, here are your event details. Have your QR code ready at the gate.`],
      rows: [["Date", d.when], ["Venue", d.venue]],
      cta: { label: "Open tickets", url: d.url },
    }),

  eventCancellation: (d: { name: string; event: string; reference: string; reason?: string | null }) =>
    render(`Event cancelled: ${d.event}`, {
      preheader: `${d.event} has been cancelled.`,
      heading: "This event has been cancelled",
      paragraphs: [
        `Hi ${d.name}, we're sorry to tell you that ${d.event} has been cancelled.${d.reason ? ` Reason: ${d.reason}` : ""}`,
        "Your tickets are no longer valid. If you paid, a refund has been opened and we will email you when it completes.",
      ],
      rows: [["Booking reference", d.reference]],
    }),

  refundConfirmation: (d: { name: string; reference: string; amount: string; refundId: string }) =>
    render(`Refund processed for ${d.reference}`, {
      preheader: `${d.amount} has been refunded.`,
      heading: "Your refund has been processed",
      paragraphs: [`Hi ${d.name}, we've refunded your payment. It can take a few working days to appear, depending on your bank or wallet.`],
      rows: [["Booking reference", d.reference], ["Amount", d.amount], ["Refund reference", d.refundId]],
    }),

  eventApproval: (d: { name: string; event: string; approved: boolean; reason?: string | null; url: string }) =>
    render(`${d.event} was ${d.approved ? "approved" : "not approved"}`, {
      preheader: d.approved ? "Your event is live." : "Your event needs changes.",
      heading: d.approved ? "Your event is live" : "Your event needs changes",
      paragraphs: [
        d.approved
          ? `Hi ${d.name}, ${d.event} has been approved and is now on sale.`
          : `Hi ${d.name}, ${d.event} could not be approved yet.${d.reason ? ` Reason: ${d.reason}` : ""} You can edit and resubmit it.`,
      ],
      cta: { label: d.approved ? "View your event" : "Edit your event", url: d.url },
    }),

  payoutUpdate: (d: { name: string; amount: string; status: string; reference?: string | null; note?: string | null; url: string }) =>
    render(`Payout update: ${d.status}`, {
      preheader: `Your payout of ${d.amount} is ${d.status.toLowerCase()}.`,
      heading: `Payout ${d.status.toLowerCase()}`,
      paragraphs: [`Hi ${d.name}, your payout request has been updated.${d.note ? ` Note: ${d.note}` : ""}`],
      rows: [["Amount", d.amount], ["Status", d.status], ...(d.reference ? ([["Reference", d.reference]] as [string, string][]) : [])],
      cta: { label: "View payouts", url: d.url },
    }),
};

export type TemplateName = keyof typeof templates;

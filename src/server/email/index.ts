import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { db } from "../db";
import { templates, type TemplateName } from "./templates";

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface Delivery {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}

const from = () => process.env.EMAIL_FROM ?? "Tixora <no-reply@tixora.example>";

async function viaSmtp(mail: Delivery) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  const info = await transport.sendMail({ from: from(), ...mail });
  return info.messageId as string;
}

async function viaResend(mail: Delivery) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: from(),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { id?: string }).id ?? null;
}

/** Development transport: writes each message to .data/emails so links can be opened locally. */
async function viaLog(mail: Delivery, template: string) {
  const dir = path.join(process.cwd(), ".data", "emails");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${template}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.html`);
  await writeFile(file, mail.html);
  console.log(`[email:log] ${template} -> ${mail.to} | ${mail.subject}\n${mail.text}\n[saved] ${file}`);
}

/**
 * Sends a templated email. Never throws: email problems are logged in EmailLog so a mail outage
 * cannot break a checkout that has already been paid for.
 */
export async function sendEmail<T extends TemplateName>(
  template: T,
  to: string,
  data: Parameters<(typeof templates)[T]>[0],
  attachments?: Attachment[],
) {
  const rendered = (templates[template] as (d: typeof data) => ReturnType<(typeof templates)[T]>)(data);
  const mail: Delivery = { to, subject: rendered.subject, html: rendered.html, text: rendered.text, attachments };
  const provider = process.env.EMAIL_PROVIDER ?? "log";
  if (provider === "none") return;
  try {
    let providerId: string | null = null;
    if (provider === "smtp") providerId = await viaSmtp(mail);
    else if (provider === "resend") providerId = await viaResend(mail);
    else await viaLog(mail, template);
    await db.emailLog.create({
      data: { to, subject: rendered.subject, template, status: provider === "log" ? "LOGGED" : "SENT", providerId },
    });
  } catch (error) {
    console.error(`[email] failed to send ${template}`, error);
    await db.emailLog
      .create({
        data: { to, subject: rendered.subject, template, status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" },
      })
      .catch(() => undefined);
  }
}

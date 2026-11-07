import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Crockford base32: no I, L, O or U, so codes survive being read aloud at a gate.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const bookingReference = () => `TX${randomCode(8)}`;
export const ticketCode = () => `TXR-${randomCode(4)}-${randomCode(4)}`;
export const merchantTxnId = () => `TXP${Date.now().toString(36).toUpperCase()}${randomCode(6)}`;

export const normalizeTicketCode = (input: string) => input.trim().toUpperCase().replace(/\s+/g, "");

// --- Guest order links ---------------------------------------------------------------

export const guestOrderToken = (bookingId: string) => hmac(env.signingSecret, `guest-order:${bookingId}`);

export const verifyGuestOrderToken = (bookingId: string, token: string) =>
  safeEqual(guestOrderToken(bookingId), token);

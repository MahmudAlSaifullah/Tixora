import QRCode from "qrcode";
import { env } from "../env";
import { hmac, randomToken, sha256 } from "../crypto";

// A QR code holds only an opaque token: TXR1.<43 chars of HMAC output>.
// The token is derived from a per-ticket random nonce and a server secret, and the database
// stores only its SHA-256. Nothing about the customer can be read from the code, a token cannot
// be guessed from a ticket id, and a leaked database does not yield scannable tickets.

const PREFIX = "TXR1.";

export function deriveQrToken(ticketId: string, nonce: string): string {
  return PREFIX + hmac(env.qrSecret, `${ticketId}:${nonce}`);
}

export function newQrCredentials(ticketId: string) {
  const qrNonce = randomToken(16);
  return { qrNonce, qrTokenHash: sha256(deriveQrToken(ticketId, qrNonce)) };
}

export const isQrToken = (value: string) => value.startsWith(PREFIX);

export const hashQrToken = (token: string) => sha256(token);

export function qrSvg(token: string): Promise<string> {
  return QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
}

export function qrPngBuffer(token: string, width = 480): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: "png", errorCorrectionLevel: "M", margin: 1, width });
}

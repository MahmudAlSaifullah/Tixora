import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "./errors";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Trusts the file's actual bytes, not its name or claimed type. SVG is excluded on purpose:
 * it can carry script.
 */
export function sniffImageType(bytes: Buffer): { extension: string; mime: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: "png", mime: "image/png" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return { extension: "webp", mime: "image/webp" };
  return null;
}

/** Outside public/, and served by the /uploads route. Point it at a persistent disk in production. */
export const uploadsDir = () => process.env.UPLOADS_DIR || path.join(process.cwd(), ".data", "uploads");

async function saveLocal(bytes: Buffer, extension: string): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  // The name is random, so user input never reaches the filesystem path.
  const name = `${randomBytes(16).toString("hex")}.${extension}`;
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}

async function saveCloudinary(bytes: Buffer, mime: string): Promise<string> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new Error("Cloudinary is not configured");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "tixora";
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }));
  form.append("api_key", key);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  const data = (await response.json()) as { secure_url?: string; error?: { message?: string } };
  if (!data.secure_url) throw new Error(`Cloudinary upload failed: ${data.error?.message ?? response.status}`);
  return data.secure_url;
}

export async function storeImage(file: File): Promise<string> {
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_BYTES) throw badRequest("Images must be 5 MB or smaller.", "FILE_TOO_LARGE");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw badRequest("Only JPEG, PNG and WebP images are allowed.", "UNSUPPORTED_FILE");
  return process.env.STORAGE_PROVIDER === "cloudinary" ? saveCloudinary(bytes, type.mime) : saveLocal(bytes, type.extension);
}

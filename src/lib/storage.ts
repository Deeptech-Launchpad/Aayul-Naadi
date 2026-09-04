import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";
import { open, seal } from "./crypto";

/**
 * Uploaded files are encrypted before they touch the disk and are only ever
 * read back through this module, which requires the record key. A backup of
 * the data volume is therefore ciphertext, like the database.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Magic-byte check — the browser's declared type is not trusted on its own. */
export function sniffMime(data: Buffer, declared: string): string | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (data.subarray(4, 12).toString("latin1").startsWith("ftyphei") || data.subarray(4, 12).toString("latin1").startsWith("ftypmif1")) {
    return "image/heic";
  }
  return ALLOWED_MIME[declared] ? declared : null;
}

export async function storeEncrypted(userId: string, dek: Buffer, data: Buffer): Promise<string> {
  const key = `${userId}/${crypto.randomBytes(16).toString("hex")}.enc`;
  const target = path.join(env.dataDir, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, seal(dek, data), { mode: 0o600 });
  return key;
}

export async function readEncrypted(dek: Buffer, storageKey: string): Promise<Buffer> {
  const target = safePath(storageKey);
  return open(dek, await fs.readFile(target));
}

export async function deleteStored(storageKey: string): Promise<void> {
  try {
    await fs.unlink(safePath(storageKey));
  } catch {
    // Already gone — deleting a record must not fail because its file vanished.
  }
}

export async function deleteAllFor(userId: string): Promise<void> {
  try {
    await fs.rm(path.join(env.dataDir, userId), { recursive: true, force: true });
  } catch {
    // Nothing stored for this user.
  }
}

/** Refuses any key that would escape the data directory. */
function safePath(storageKey: string): string {
  const resolved = path.resolve(env.dataDir, storageKey);
  const root = path.resolve(env.dataDir);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to read outside the data directory.");
  }
  return resolved;
}

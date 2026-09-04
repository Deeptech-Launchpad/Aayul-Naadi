import crypto from "node:crypto";
import { hashRaw, hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { env } from "./env";

/**
 * Encryption
 * ----------
 * Every piece of health content is sealed with AES-256-GCM under a per-user
 * data key (DEK). The DEK itself is stored twice, wrapped:
 *
 *   dekWrappedMaster — wrapped with AAYU_MASTER_KEY, held only in the server's
 *                      environment. This is what the app uses at runtime, and
 *                      what lets background work (document extraction, the
 *                      daily read) run without an active session.
 *   dekWrappedPass   — wrapped with a key derived from the passphrase, so the
 *                      record survives a master-key rotation and so the
 *                      passphrase remains a genuine second factor for the data.
 *
 * The practical guarantee: a stolen database dump is ciphertext. It is not
 * end-to-end encryption — the server can decrypt while it is running — and the
 * app says so plainly rather than overclaiming.
 */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Argon2id parameters for passphrase hashing and key derivation. */
const ARGON = {
  algorithm: 2, // Argon2id
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export function seal(key: Buffer, plaintext: Buffer | string): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([VERSION]), iv, body, cipher.getAuthTag()]);
}

export function open(key: Buffer, payload: Buffer | Uint8Array): Buffer {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) throw new Error("Ciphertext is truncated");
  if (buf[0] !== VERSION) throw new Error(`Unsupported ciphertext version ${buf[0]}`);
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const body = buf.subarray(1 + IV_BYTES, buf.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export const sealText = (key: Buffer, text: string): Buffer => seal(key, text);
export const openText = (key: Buffer, payload: Buffer | Uint8Array): string =>
  open(key, payload).toString("utf8");

export function sealJson(key: Buffer, value: unknown): Buffer {
  return seal(key, JSON.stringify(value));
}

export function openJson<T>(key: Buffer, payload: Buffer | Uint8Array): T {
  return JSON.parse(openText(key, payload)) as T;
}

/** Decrypt without throwing — for rendering lists where one bad row must not blank the page. */
export function openJsonSafe<T>(key: Buffer, payload: Buffer | Uint8Array | null, fallback: T): T {
  if (!payload) return fallback;
  try {
    return openJson<T>(key, payload);
  } catch {
    return fallback;
  }
}

export const newDataKey = (): Buffer => crypto.randomBytes(32);

export const wrapKey = (dek: Buffer, kek: Buffer): Buffer => seal(kek, dek);
export const unwrapKey = (wrapped: Buffer | Uint8Array, kek: Buffer): Buffer => open(kek, wrapped);

export const masterKey = (): Buffer => env.masterKey;

/** Derive a 32-byte key-encryption key from the user's passphrase. */
export async function deriveKek(passphrase: string, salt: Buffer): Promise<Buffer> {
  return hashRaw(passphrase, { ...ARGON, salt, outputLen: 32 });
}

export async function hashSecret(secret: string): Promise<string> {
  return argonHash(secret, ARGON);
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argonVerify(hash, secret, ARGON);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("base64url");

/** Non-reversible, salted-by-master-key fingerprint. Used for IPs, never for secrets. */
export function fingerprint(value: string): string {
  return crypto.createHmac("sha256", masterKey()).update(value).digest("hex").slice(0, 32);
}

/** Constant-time lookup key for session tokens. */
export function tokenDigest(token: string): string {
  return crypto.createHmac("sha256", masterKey()).update(token).digest("hex");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * A shared note is encrypted under a key derived from the link token itself,
 * so the payload can only be opened by someone holding the link — the server's
 * master key alone is not enough.
 */
export function shareKey(token: string): Buffer {
  return crypto.createHash("sha256").update(`aayu-share:${token}`).digest();
}

/** Human-transcribable recovery code, e.g. 4KQ2-9WXB. */
export function newRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  const pick = (n: number) =>
    Array.from(crypto.randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `${pick(4)}-${pick(4)}`;
}

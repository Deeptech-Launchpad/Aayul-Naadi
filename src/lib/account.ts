import * as OTPAuth from "otpauth";
import type { User } from "@prisma/client";
import crypto from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import {
  deriveKek,
  hashSecret,
  masterKey,
  newDataKey,
  newRecoveryCode,
  openText,
  sealText,
  wrapKey,
} from "./crypto";

/**
 * Account lifecycle with no dependency on the request — usable from route
 * handlers, from server components, and from the CLI scripts.
 */

const WEAK = new Set([
  "password", "passphrase", "12345678", "qwertyuiop", "letmeinplease",
  "iloveyou123", "administrator", "welcome1234", "changeme123",
]);

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < 12) return "Use at least 12 characters.";
  if (passphrase.length > 512) return "That is longer than 512 characters.";
  const normalised = passphrase.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (WEAK.has(normalised)) return "That passphrase is on the common-password list. Choose another.";
  if (/^(.)\1+$/.test(passphrase)) return "That is a single repeated character.";
  return null;
}

export async function createAccount(email: string, passphrase: string): Promise<User> {
  const normalisedEmail = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) throw new Error("An account already exists for that email.");

  const kdfSalt = crypto.randomBytes(16);
  const dek = newDataKey();
  const passKek = await deriveKek(passphrase, kdfSalt);

  const totp = new OTPAuth.Secret({ size: 20 });

  return db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: normalisedEmail,
        passphraseHash: await hashSecret(passphrase),
        kdfSalt,
        dekWrappedMaster: wrapKey(dek, masterKey()),
        dekWrappedPass: wrapKey(dek, passKek),
        totpSecretEnc: sealText(dek, totp.base32),
        totpEnabled: false,
      },
    });
    await audit(
      { userId: created.id, action: "auth.signup", resource: "account" },
      tx,
    );
    return created;
  });
}

/**
 * Recovery codes are generated on demand and returned in plaintext exactly
 * once — only Argon2id hashes are stored. Generating a new set invalidates
 * every code from the previous one.
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => newRecoveryCode());
  await db.$transaction(async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId } });
    for (const code of codes) {
      await tx.recoveryCode.create({ data: { userId, codeHash: await hashSecret(code) } });
    }
    await audit({ userId, action: "settings.change", resource: "recovery_codes" }, tx);
  });
  return codes;
}

export async function countRecoveryCodes(userId: string): Promise<number> {
  return db.recoveryCode.count({ where: { userId, usedAt: null } });
}

export function totpFor(secretBase32: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "Aayu",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export async function totpUri(user: User, dek: Buffer): Promise<string> {
  if (!user.totpSecretEnc) throw new Error("No authenticator secret is enrolled.");
  return totpFor(openText(dek, user.totpSecretEnc), user.email).toString();
}

export async function setPin(userId: string, pin: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { pinHash: pin ? await hashSecret(pin) : null },
  });
}

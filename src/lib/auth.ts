import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { audit } from "./audit";
import { requestContext } from "./request";
import {
  hashSecret,
  masterKey,
  openText,
  randomToken,
  tokenDigest,
  unwrapKey,
  verifySecret,
} from "./crypto";
import {
  checkPassphrase,
  countRecoveryCodes,
  createAccount,
  generateRecoveryCodes,
  setPin,
  totpFor,
  totpUri,
} from "./account";

export {
  checkPassphrase,
  countRecoveryCodes,
  createAccount,
  generateRecoveryCodes,
  setPin,
  totpFor,
  totpUri,
};

export const SESSION_COOKIE = "aayu_session";
export const LOCK_COOKIE = "aayu_unlocked";
const SESSION_DAYS = 30;
const MAX_FAILED = 6;
const LOCKOUT_MINUTES = 15;

export type AuthedUser = {
  user: User;
  dek: Buffer;
  sessionId: string;
};

/* ── sign in ───────────────────────────────────────────────────────────── */

export type SignInResult =
  | { ok: true; next: "/enroll" | "/verify" | "/today" }
  | { ok: false; error: string };

/**
 * The demo account, exempt from both factors.
 *
 * Deliberately derived from the environment rather than stored on the row: the
 * exemption disappears the moment AAYU_DEMO_EMAIL is unset and the app is
 * restarted, with nothing left in the database to forget about.
 */
export function isDemoAccount(user: { email: string }): boolean {
  const demo = env.demoEmail;
  return demo !== null && user.email === demo;
}

/**
 * Refuses an operation that would break the shared demo for everyone arriving
 * after this visitor: an app-lock PIN nobody else knows, a cleared record, a
 * deleted account. Returns null for every other account, so the guard costs
 * real users nothing.
 *
 * This is not a security boundary — the demo holds invented data and there is
 * nothing in it to protect. It keeps the demo from being trivially bricked.
 */
export function demoRefusal(user: { email: string }, what: string): string | null {
  if (!isDemoAccount(user)) return null;
  return `The demo account is shared with everyone who opens it, so ${what} is switched off here. Everything else works normally.`;
}

export async function signIn(email: string, passphrase: string): Promise<SignInResult> {
  const ctx = await requestContext();
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Same wording and roughly the same work whether or not the account exists.
  if (!user) {
    await hashSecret(passphrase);
    return { ok: false, error: "That email and passphrase do not match." };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const valid = await verifySecret(user.passphraseHash, passphrase);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await audit({
      userId: user.id,
      action: "auth.signin_failed",
      resource: "account",
      outcome: "denied",
      device: ctx.device,
      ipHash: ctx.ipHash,
    });
    return { ok: false, error: "That email and passphrase do not match." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  const demo = isDemoAccount(user);
  await startSession(user, { twoFactorPassed: demo });
  await audit({
    userId: user.id,
    action: "auth.signin",
    resource: "account",
    device: ctx.device,
    ipHash: ctx.ipHash,
  });

  if (demo) return { ok: true, next: "/today" };
  return { ok: true, next: user.totpEnabled ? "/verify" : "/enroll" };
}

/**
 * Enter the demo without a passphrase.
 *
 * There is no secret to check, so the guard is the account itself: this only
 * ever resolves the one address named by AAYU_DEMO_EMAIL, and refuses if that
 * is unset. It cannot be pointed at another account by anything the caller
 * sends, because the caller sends nothing.
 */
export async function signInAsDemo(): Promise<{ ok: true } | { ok: false; error: string }> {
  const demoEmail = env.demoEmail;
  if (!demoEmail) return { ok: false, error: "The demo is not enabled on this server." };

  const user = await db.user.findUnique({ where: { email: demoEmail } });
  if (!user) {
    return {
      ok: false,
      error: "The demo account does not exist yet. Whoever runs this server needs to create it.",
    };
  }

  const ctx = await requestContext();
  await startSession(user, { twoFactorPassed: true });
  await audit({
    userId: user.id,
    action: "auth.demo_signin",
    resource: "account",
    device: ctx.device,
    ipHash: ctx.ipHash,
  });
  return { ok: true };
}

async function startSession(user: User, opts: { twoFactorPassed: boolean }): Promise<string> {
  const ctx = await requestContext();
  const token = randomToken(32);
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: tokenDigest(token),
      deviceLabel: ctx.device,
      ipHash: ctx.ipHash,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      twoFactorAt: opts.twoFactorPassed ? new Date() : null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  jar.set(LOCK_COOKIE, "1", {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: user.lockTimeoutSec,
  });
  return session.id;
}

/* ── two-factor ────────────────────────────────────────────────────────── */

export async function verifyTotpCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const pending = await currentSession({ requireTwoFactor: false });
  if (!pending) return { ok: false, error: "Your sign-in expired. Start again." };
  const { user, dek, sessionId } = pending;
  const ctx = await requestContext();

  if (!user.totpSecretEnc) return { ok: false, error: "No authenticator is enrolled." };
  const totp = totpFor(openText(dek, user.totpSecretEnc), user.email);
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });

  if (delta === null) {
    await audit({
      userId: user.id,
      action: "auth.2fa_failed",
      resource: "session",
      outcome: "denied",
      device: ctx.device,
      ipHash: ctx.ipHash,
    });
    return { ok: false, error: "That code is not right. Codes change every 30 seconds." };
  }

  await db.$transaction(async (tx) => {
    await tx.session.update({ where: { id: sessionId }, data: { twoFactorAt: new Date() } });
    if (!user.totpEnabled) {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    }
    await audit(
      { userId: user.id, action: "auth.2fa_passed", resource: "session", device: ctx.device },
      tx,
    );
  });
  return { ok: true };
}

export async function useRecoveryCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const pending = await currentSession({ requireTwoFactor: false });
  if (!pending) return { ok: false, error: "Your sign-in expired. Start again." };
  const { user, sessionId } = pending;

  const candidates = await db.recoveryCode.findMany({
    where: { userId: user.id, usedAt: null },
  });
  const normalised = code.trim().toUpperCase();
  for (const candidate of candidates) {
    if (await verifySecret(candidate.codeHash, normalised)) {
      await db.$transaction(async (tx) => {
        await tx.recoveryCode.update({
          where: { id: candidate.id },
          data: { usedAt: new Date() },
        });
        await tx.session.update({
          where: { id: sessionId },
          data: { twoFactorAt: new Date() },
        });
        await audit(
          { userId: user.id, action: "auth.recovery_used", resource: "session" },
          tx,
        );
      });
      return { ok: true };
    }
  }
  return { ok: false, error: "That recovery code is not valid or has already been used." };
}

/* ── session lookup ────────────────────────────────────────────────────── */

export async function currentSession(
  opts: { requireTwoFactor?: boolean } = {},
): Promise<AuthedUser | null> {
  const requireTwoFactor = opts.requireTwoFactor ?? true;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: tokenDigest(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (requireTwoFactor && !session.twoFactorAt) return null;

  // Touch at most once a minute so a read does not become a write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  return {
    user: session.user,
    dek: unwrapKey(session.user.dekWrappedMaster, masterKey()),
    sessionId: session.id,
  };
}

/** For pages: send anyone who is not fully signed in to the right screen. */
export async function requireUser(): Promise<AuthedUser> {
  const partial = await currentSession({ requireTwoFactor: false });
  if (!partial) redirect("/signin");
  if (!(await currentSession())) redirect("/verify");

  const jar = await cookies();
  if (partial.user.pinHash && !jar.get(LOCK_COOKIE)) redirect("/lock");

  return (await currentSession())!;
}

/** For route handlers: null instead of a redirect. */
export async function requireApiUser(): Promise<AuthedUser | null> {
  return currentSession();
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await db.session.findUnique({ where: { tokenHash: tokenDigest(token) } });
    if (session) {
      await db.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await audit({ userId: session.userId, action: "auth.signout", resource: "session" });
    }
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(LOCK_COOKIE);
}

/* ── app lock ──────────────────────────────────────────────────────────── */

export async function unlockWithPin(pin: string): Promise<boolean> {
  const session = await currentSession();
  if (!session?.user.pinHash) return false;
  const ok = await verifySecret(session.user.pinHash, pin);
  if (!ok) {
    await audit({
      userId: session.user.id,
      action: "auth.pin_failed",
      resource: "app_lock",
      outcome: "denied",
    });
    return false;
  }
  const jar = await cookies();
  jar.set(LOCK_COOKIE, "1", {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: session.user.lockTimeoutSec,
  });
  return true;
}

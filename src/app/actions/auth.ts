"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  checkPassphrase,
  createAccount,
  currentSession,
  demoRefusal,
  signIn,
  signInAsDemo,
  signOut,
  unlockWithPin,
  useRecoveryCode,
  verifyTotpCode,
  setPin,
} from "@/lib/auth";
import { CONSENT_LABELS } from "@/lib/types";
import { env } from "@/lib/env";
import { timingSafeEqual } from "@/lib/crypto";

export type FormState = { error?: string; ok?: boolean };

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const passphrase = String(formData.get("passphrase") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const refused = registrationRefusal(email, String(formData.get("invite") ?? ""));
  if (refused) return { error: refused };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (passphrase !== confirm) return { error: "The two passphrases do not match." };
  const problem = checkPassphrase(passphrase);
  if (problem) return { error: problem };

  try {
    await createAccount(email, passphrase);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the account." };
  }

  const result = await signIn(email, passphrase);
  if (!result.ok) return { error: result.error };
  redirect("/enroll");
}

/**
 * Whether this address may register at all. Checked before anything expensive
 * happens, and worded so it cannot be used to probe who is on the list.
 */
function registrationRefusal(email: string, invite: string): string | null {
  if (env.signupMode === "closed") {
    return "This instance is not accepting new accounts.";
  }
  if (env.signupMode === "invite") {
    const expected = env.inviteCode;
    if (!expected) {
      return "Sign-up needs an invite code, but the server has not been given one. Ask whoever runs it.";
    }
    if (!invite.trim() || !timingSafeEqual(invite.trim(), expected)) {
      return "That invite code is not right.";
    }
  }
  const allowed = env.allowedEmails;
  if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
    return "That email address has not been invited to this instance.";
  }
  return null;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const passphrase = String(formData.get("passphrase") ?? "");
  if (!email || !passphrase) return { error: "Enter your email and passphrase." };

  const result = await signIn(email, passphrase);
  if (!result.ok) return { error: result.error };
  redirect(result.next);
}

/**
 * Opens the demo account. Takes no input at all — the address comes from the
 * server's own configuration, so there is nothing here for a caller to aim at
 * a different account.
 */
export async function demoSignInAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  const result = await signInAsDemo();
  if (!result.ok) return { error: result.error };
  redirect("/today");
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const next = String(formData.get("next") ?? "/today");
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: "Enter the six digits from your authenticator." };

  const result = await verifyTotpCode(code);
  if (!result.ok) return { error: result.error };

  // Enrolment sends people to their recovery kit; a routine sign-in goes to
  // Today, or into onboarding if the record is not set up yet.
  if (next !== "/today") redirect(next);

  const session = await currentSession();
  redirect(session && !session.user.onboardedAt ? "/onboarding" : next);
}

export async function recoveryCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const result = await useRecoveryCode(code);
  if (!result.ok) return { error: result.error };
  redirect("/profile/security");
}

export async function unlockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pin = String(formData.get("pin") ?? "");
  const ok = await unlockWithPin(pin);
  if (!ok) return { error: "That PIN is not right." };
  redirect("/today");
}

export async function setPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await currentSession();
  if (!session) return { error: "Your session expired." };
  const refused = demoRefusal(session.user, "the app lock");
  if (refused) return { error: refused };

  const pin = String(formData.get("pin") ?? "");
  if (pin && !/^\d{4,8}$/.test(pin)) return { error: "A PIN is 4 to 8 digits." };
  await setPin(session.user.id, pin);
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/signin");
}

export async function acceptConsentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await currentSession();
  if (!session) return { error: "Your session expired." };

  const consent: Record<string, boolean> = {};
  for (const item of CONSENT_LABELS) {
    consent[item.key] = formData.get(item.key) === "on";
  }
  await db.user.update({
    where: { id: session.user.id },
    data: { consent, consentAt: new Date(), onboardingStep: 1 },
  });
  redirect("/onboarding/basics");
}

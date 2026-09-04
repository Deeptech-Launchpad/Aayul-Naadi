"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { demoRefusal, requireApiUser, setPin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteAllFor } from "@/lib/storage";
import { CONSENT_LABELS } from "@/lib/types";

export type SecurityState = { error?: string; ok?: boolean; message?: string };

export async function updateConsentAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const consent: Record<string, boolean> = {};
  for (const item of CONSENT_LABELS) consent[item.key] = formData.get(item.key) === "on";

  await db.user.update({
    where: { id: ctx.user.id },
    data: { consent, consentAt: new Date() },
  });
  await audit({
    userId: ctx.user.id,
    action: "settings.change",
    resource: "consent",
    dek: ctx.dek,
    detail: consent,
  });
  revalidatePath("/profile/security");
  return { ok: true, message: "Saved. This applies to the next question you ask Nadi." };
}

export async function updateLockAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const pin = String(formData.get("pin") ?? "").trim();
  const timeout = Number(formData.get("lockTimeoutSec") ?? 120);

  const refused = demoRefusal(ctx.user, "the app lock");
  if (refused) return { error: refused };
  if (pin && !/^\d{4,8}$/.test(pin)) return { error: "A PIN is 4 to 8 digits." };

  await setPin(ctx.user.id, pin);
  if (Number.isFinite(timeout)) {
    await db.user.update({
      where: { id: ctx.user.id },
      data: { lockTimeoutSec: Math.min(Math.max(Math.round(timeout), 30), 3600) },
    });
  }
  await audit({ userId: ctx.user.id, action: "settings.change", resource: "app_lock" });
  revalidatePath("/profile/security");
  return { ok: true, message: pin ? "App lock is on." : "App lock is off." };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const id = String(formData.get("id") ?? "");

  await db.session.updateMany({
    where: { id, userId: ctx.user.id },
    data: { revokedAt: new Date() },
  });
  await audit({ userId: ctx.user.id, action: "auth.session_revoked", resource: `session:${id}` });
  if (id === ctx.sessionId) redirect("/signin");
  revalidatePath("/profile/security");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  await db.session.updateMany({
    where: { userId: ctx.user.id, id: { not: ctx.sessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit({ userId: ctx.user.id, action: "auth.session_revoked", resource: "all_other_sessions" });
  revalidatePath("/profile/security");
}

export async function deleteAccountAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const refused = demoRefusal(ctx.user, "deleting the account");
  if (refused) return { error: refused };

  if (String(formData.get("confirm") ?? "").trim() !== ctx.user.email) {
    return { error: "Type your email address exactly to confirm." };
  }

  await deleteAllFor(ctx.user.id);
  // Cascades remove every related row. The audit trail goes with it — there is
  // no copy of your record left behind to protect anybody but you.
  await db.user.delete({ where: { id: ctx.user.id } });
  redirect("/signin");
}

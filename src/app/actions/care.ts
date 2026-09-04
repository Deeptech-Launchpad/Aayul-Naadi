"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function markCareGapDoneAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const ruleId = String(formData.get("ruleId") ?? "");
  const when = String(formData.get("doneAt") ?? "");
  const lastDoneAt = when ? new Date(when) : new Date();
  if (!ruleId || Number.isNaN(lastDoneAt.getTime())) return;

  await db.careGapState.upsert({
    where: { userId_ruleId: { userId: ctx.user.id, ruleId } },
    create: { userId: ctx.user.id, ruleId, lastDoneAt },
    update: { lastDoneAt, dismissed: false },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: `care_gap:${ruleId}` });
  revalidatePath("/care");
  revalidatePath("/today");
}

export async function dismissCareGapAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) return;

  await db.careGapState.upsert({
    where: { userId_ruleId: { userId: ctx.user.id, ruleId } },
    create: { userId: ctx.user.id, ruleId, dismissed: true },
    update: { dismissed: true },
  });
  await audit({ userId: ctx.user.id, action: "settings.change", resource: `care_gap.hidden:${ruleId}` });
  revalidatePath("/care");
  revalidatePath("/today");
}

export async function restoreCareGapAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const ruleId = String(formData.get("ruleId") ?? "");
  await db.careGapState.updateMany({
    where: { userId: ctx.user.id, ruleId },
    data: { dismissed: false },
  });
  revalidatePath("/care");
}

/** One tap from the medications screen: this dose was taken. */
export async function recordDoseAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const medicationId = String(formData.get("medicationId") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const status = String(formData.get("status") ?? "taken");
  const scheduledAt = new Date(scheduledAtRaw);
  if (!medicationId || Number.isNaN(scheduledAt.getTime())) return;

  const owned = await db.medication.findFirst({
    where: { id: medicationId, userId: ctx.user.id },
    select: { id: true },
  });
  if (!owned) return;

  await db.doseEvent.upsert({
    where: { medicationId_scheduledAt: { medicationId, scheduledAt } },
    create: {
      userId: ctx.user.id,
      medicationId,
      scheduledAt,
      status,
      takenAt: status === "taken" ? new Date() : null,
    },
    update: { status, takenAt: status === "taken" ? new Date() : null },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: `dose:${status}` });
  revalidatePath("/care/medications");
  revalidatePath("/today");
}

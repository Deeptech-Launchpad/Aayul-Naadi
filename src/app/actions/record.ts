"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sealJson } from "@/lib/crypto";
import { getProfile, saveProfile, writeObservation } from "@/lib/record";
import { matchCondition } from "@/lib/conditions";
import type { AllergyData, ConditionData, MedicationData, ProfileData } from "@/lib/types";
import { metric } from "@/lib/metrics";

export type FormState = { error?: string; ok?: boolean; message?: string };

async function ctxOrThrow() {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  return ctx;
}

/* ── profile ───────────────────────────────────────────────────────────── */

export async function saveBasicsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const profile = await getProfile(ctx);

  const heightCm = numberOrNull(formData.get("heightCm"));
  const weightKg = numberOrNull(formData.get("weightKg"));
  const dob = String(formData.get("dob") ?? "").trim();

  if (dob && Number.isNaN(new Date(dob).getTime())) return { error: "That date of birth is not valid." };

  const next: ProfileData = {
    ...profile,
    displayName: String(formData.get("displayName") ?? "").trim() || profile.displayName,
    dob: dob || profile.dob,
    sexAtBirth: (String(formData.get("sexAtBirth") ?? "") || profile.sexAtBirth) as ProfileData["sexAtBirth"],
    gender: String(formData.get("gender") ?? "").trim() || undefined,
    heightCm: heightCm ?? profile.heightCm,
    bloodType: String(formData.get("bloodType") ?? "").trim() || undefined,
    ancestry: String(formData.get("ancestry") ?? "").trim() || undefined,
  };
  await saveProfile(ctx, next);

  const units = String(formData.get("units") ?? "");
  if (units === "metric" || units === "imperial") {
    await db.user.update({ where: { id: ctx.user.id }, data: { units } });
  }
  if (weightKg) {
    await writeObservation(ctx, { kind: "vital", metric: "weight", value: weightKg, source: "manual" });
  }
  await audit({ userId: ctx.user.id, action: "record.write", resource: "profile.basics" });

  const next_ = String(formData.get("next") ?? "");
  if (next_) redirect(next_);
  revalidatePath("/profile");
  return { ok: true, message: "Saved." };
}

export async function saveLifestyleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const profile = await getProfile(ctx);

  await saveProfile(ctx, {
    ...profile,
    lifestyle: {
      smoking: pick(formData.get("smoking"), ["never", "former", "current"] as const),
      alcohol: pick(formData.get("alcohol"), ["none", "occasional", "weekly", "daily"] as const),
      diet: String(formData.get("diet") ?? "").trim() || undefined,
      activityPerWeek: numberOrNull(formData.get("activityPerWeek")) ?? undefined,
      occupation: String(formData.get("occupation") ?? "").trim() || undefined,
    },
    goals: {
      hba1c: numberOrNull(formData.get("goalHba1c")) ?? undefined,
      sleepHours: numberOrNull(formData.get("goalSleep")) ?? undefined,
      steps: numberOrNull(formData.get("goalSteps")) ?? undefined,
      weightKg: numberOrNull(formData.get("goalWeight")) ?? undefined,
      notes: String(formData.get("goalNotes") ?? "").trim() || undefined,
    },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "profile.lifestyle" });

  const next = String(formData.get("next") ?? "");
  if (next) redirect(next);
  revalidatePath("/profile");
  return { ok: true, message: "Saved." };
}

export async function addFamilyHistoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const profile = await getProfile(ctx);
  const relation = String(formData.get("relation") ?? "").trim();
  const conditions = formData.getAll("conditions").map(String).filter(Boolean);
  if (!relation) return { error: "Choose a relative." };
  if (!conditions.length) return { error: "Pick at least one condition, or skip this relative." };

  const familyHistory = [...(profile.familyHistory ?? []).filter((f) => f.relation !== relation), {
    relation,
    conditions,
    ageAtOnset: numberOrNull(formData.get("ageAtOnset")),
    note: String(formData.get("note") ?? "").trim() || undefined,
  }];

  await saveProfile(ctx, { ...profile, familyHistory });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "profile.family_history" });
  revalidatePath("/onboarding/family");
  revalidatePath("/profile");
  return { ok: true, message: `${relation} saved.` };
}

export async function saveReproductiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const profile = await getProfile(ctx);
  await saveProfile(ctx, {
    ...profile,
    reproductive: {
      cycleTracking: formData.get("cycleTracking") === "on",
      lastPeriod: String(formData.get("lastPeriod") ?? "").trim() || undefined,
      pregnancies: numberOrNull(formData.get("pregnancies")) ?? undefined,
      menopause: String(formData.get("menopause") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "profile.reproductive" });
  revalidatePath("/profile");
  return { ok: true, message: "Saved." };
}

/* ── conditions, medications, allergies ────────────────────────────────── */

export async function addConditionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a condition." };

  const matched = matchCondition(name);
  const data: ConditionData = {
    name: matched?.name ?? name,
    icd10: matched?.icd10,
    note: String(formData.get("note") ?? "").trim() || undefined,
  };
  const onset = String(formData.get("onsetAt") ?? "").trim();

  await db.condition.create({
    data: {
      userId: ctx.user.id,
      dataEnc: sealJson(ctx.dek, data),
      tag: matched?.tag ?? slug(name),
      onsetAt: onset ? new Date(onset) : null,
    },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "condition" });
  revalidatePath("/onboarding/health");
  revalidatePath("/profile");
  revalidatePath("/care");
  return { ok: true, message: `${data.name} added.` };
}

export async function removeConditionAction(formData: FormData): Promise<void> {
  const ctx = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await db.condition.deleteMany({ where: { id, userId: ctx.user.id } });
  await audit({ userId: ctx.user.id, action: "record.delete", resource: "condition" });
  revalidatePath("/onboarding/health");
  revalidatePath("/profile");
  revalidatePath("/care");
}

export async function addMedicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a medication name." };

  const schedule = String(formData.get("schedule") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s));

  const data: MedicationData = {
    name,
    dose: String(formData.get("dose") ?? "").trim() || undefined,
    schedule,
    quantityRemaining: numberOrNull(formData.get("quantityRemaining")) ?? undefined,
    purpose: String(formData.get("purpose") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };

  await db.medication.create({
    data: { userId: ctx.user.id, dataEnc: sealJson(ctx.dek, data), active: true },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "medication" });
  revalidatePath("/onboarding/health");
  revalidatePath("/care/medications");
  return { ok: true, message: `${name} added.` };
}

export async function stopMedicationAction(formData: FormData): Promise<void> {
  const ctx = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await db.medication.updateMany({
    where: { id, userId: ctx.user.id },
    data: { active: false, endedAt: new Date() },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "medication.stopped" });
  revalidatePath("/care/medications");
}

export async function addAllergyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const substance = String(formData.get("substance") ?? "").trim();
  if (!substance) return { error: "Enter what you are allergic to." };

  const severity = (String(formData.get("severity") ?? "unknown") || "unknown") as AllergyData["severity"];
  const data: AllergyData = {
    substance,
    reaction: String(formData.get("reaction") ?? "").trim() || undefined,
    severity,
    notedAt: new Date().toISOString().slice(0, 10),
  };

  await db.allergy.create({
    data: { userId: ctx.user.id, dataEnc: sealJson(ctx.dek, data), severity: severity ?? "unknown" },
  });
  await audit({ userId: ctx.user.id, action: "record.write", resource: "allergy" });
  revalidatePath("/onboarding/health");
  revalidatePath("/profile");
  revalidatePath("/care/medications");
  return { ok: true, message: `${substance} added.` };
}

export async function removeAllergyAction(formData: FormData): Promise<void> {
  const ctx = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await db.allergy.deleteMany({ where: { id, userId: ctx.user.id } });
  await audit({ userId: ctx.user.id, action: "record.delete", resource: "allergy" });
  revalidatePath("/onboarding/health");
  revalidatePath("/profile");
}

/* ── readings ──────────────────────────────────────────────────────────── */

export async function logReadingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOrThrow();
  const kindOfLog = String(formData.get("logType") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const at = String(formData.get("at") ?? "").trim();
  const effectiveAt = at ? new Date(at) : new Date();
  if (Number.isNaN(effectiveAt.getTime())) return { error: "That date and time are not valid." };

  const writes: Array<{ metric: string; value: number }> = [];

  if (kindOfLog === "bp") {
    const systolic = numberOrNull(formData.get("systolic"));
    const diastolic = numberOrNull(formData.get("diastolic"));
    const pulse = numberOrNull(formData.get("pulse"));
    if (!systolic || !diastolic) return { error: "Enter both the systolic and diastolic numbers." };
    if (systolic < 50 || systolic > 300 || diastolic < 30 || diastolic > 200) {
      return { error: "Those numbers are outside any plausible range. Check them and try again." };
    }
    writes.push({ metric: "bp_systolic", value: systolic }, { metric: "bp_diastolic", value: diastolic });
    if (pulse) writes.push({ metric: "pulse", value: pulse });
  } else {
    const metricKey = kindOfLog;
    const value = numberOrNull(formData.get("value"));
    if (value == null) return { error: "Enter a number." };
    const def = metric(metricKey);
    if (!def.unit && !def.label) return { error: "Choose what you are logging." };
    writes.push({ metric: metricKey, value });
  }

  for (const write of writes) {
    await writeObservation(ctx, {
      kind: metric(write.metric).category === "lab" ? "lab" : "vital",
      metric: write.metric,
      value: write.value,
      effectiveAt,
      note,
      source: "manual",
    });
  }
  await audit({
    userId: ctx.user.id,
    action: "record.write",
    resource: `reading:${writes.map((w) => w.metric).join(",")}`,
    dek: ctx.dek,
    detail: { count: writes.length },
  });

  revalidatePath("/today");
  revalidatePath("/record");
  redirect("/today");
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Narrow a form value to one of a fixed set, or undefined. */
function pick<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]): T | undefined {
  const text = String(value ?? "");
  return (allowed as readonly string[]).includes(text) ? (text as T) : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { demoRefusal, requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { importFile } from "@/lib/import";
import { loadSampleRecord, wipeRecord } from "@/lib/sample";

export type ImportState = { error?: string; ok?: boolean; message?: string };

const MAX_IMPORT_BYTES = 120 * 1024 * 1024;

export async function importFileAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to import." };
  if (file.size > MAX_IMPORT_BYTES) {
    return { error: `That file is ${(file.size / 1_048_576).toFixed(0)} MB. The limit is 120 MB.` };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const summary = await importFile(ctx, { name: file.name, data });

  await audit({
    userId: ctx.user.id,
    action: "record.write",
    resource: `import:${summary.format}`,
    dek: ctx.dek,
    detail: { observations: summary.observations, skipped: summary.skipped },
  });

  const parts = [
    summary.observations ? `${summary.observations} reading${summary.observations === 1 ? "" : "s"}` : null,
    summary.conditions ? `${summary.conditions} condition${summary.conditions === 1 ? "" : "s"}` : null,
    summary.medications ? `${summary.medications} medication${summary.medications === 1 ? "" : "s"}` : null,
    summary.allergies ? `${summary.allergies} allerg${summary.allergies === 1 ? "y" : "ies"}` : null,
  ].filter(Boolean);

  if (!parts.length) {
    return { error: summary.notes[0] ?? "Nothing in that file could be read as health data." };
  }

  revalidatePath("/today");
  revalidatePath("/record");
  return {
    ok: true,
    message: `Imported ${parts.join(", ")} from your ${summary.format} file.${summary.skipped ? ` ${summary.skipped} row${summary.skipped === 1 ? "" : "s"} skipped.` : ""}`,
  };
}

export async function loadSampleAction(_prev: ImportState): Promise<ImportState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  // A weight entered during onboarding should not block this; a record that is
  // genuinely in use should, because the sample record is additive and mixing
  // constructed data into real data would be worse than refusing.
  const existing = await db.observation.count({ where: { userId: ctx.user.id } });
  if (existing > 25) {
    return {
      error: `Your record already holds ${existing} readings. Clear it under Profile → Access log first if you want the sample record instead.`,
    };
  }

  const result = await loadSampleRecord(ctx);
  await audit({ userId: ctx.user.id, action: "record.write", resource: "sample_record" });
  revalidatePath("/today");
  revalidatePath("/record");
  return { ok: true, message: `Sample record loaded — ${result.observations} readings, 3 lab panels, 3 medications and 3 documents.` };
}

export async function clearRecordAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const refused = demoRefusal(ctx.user, "clearing the record");
  if (refused) return { error: refused };

  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "CLEAR") {
    return { error: "Type CLEAR to confirm." };
  }
  await wipeRecord(ctx.user.id);
  await audit({ userId: ctx.user.id, action: "record.delete", resource: "all_health_data" });
  revalidatePath("/today");
  revalidatePath("/record");
  return { ok: true, message: "Every observation, document and conversation has been deleted. Your account and its security settings remain." };
}

export async function finishOnboardingAction(): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  await db.user.update({
    where: { id: ctx.user.id },
    data: { onboardedAt: new Date(), onboardingStep: 5 },
  });
  redirect("/today");
}

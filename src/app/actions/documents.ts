"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { openJsonSafe, openText, sealJson, sealText } from "@/lib/crypto";
import { deleteStored } from "@/lib/storage";
import { writeObservation } from "@/lib/record";
import { metric, normaliseMarkerName } from "@/lib/metrics";
import type { ExtractionResult } from "@/lib/types";

export type DocState = { error?: string; ok?: boolean; message?: string };

/**
 * Confirming an extraction is the only path by which a document becomes part of
 * the record. Values the person unticked are not written, and the marker they
 * corrected is written as corrected.
 */
export async function confirmExtractionAction(_prev: DocState, formData: FormData): Promise<DocState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const documentId = String(formData.get("documentId") ?? "");
  const document = await db.document.findFirst({ where: { id: documentId, userId: ctx.user.id } });
  if (!document) return { error: "That document is not in your record." };

  const extraction = openJsonSafe<ExtractionResult | null>(ctx.dek, document.extractionEnc, null);
  if (!extraction) return { error: "There is nothing extracted from this document to confirm." };

  const collectedAt = parseDate(String(formData.get("collectedAt") ?? "")) ?? parseDate(extraction.collectedAt) ?? document.uploadedAt;
  const panelName = String(formData.get("panelName") ?? "").trim() || extraction.panelName || "Imported results";

  const accepted: ExtractionResult["markers"] = [];
  extraction.markers.forEach((marker, index) => {
    if (formData.get(`accept-${index}`) !== "on") return;
    const corrected = Number(formData.get(`value-${index}`));
    const metricKey = String(formData.get(`metric-${index}`) ?? "") || marker.metric || normaliseMarkerName(marker.name);
    if (!metricKey || !Number.isFinite(corrected)) return;
    accepted.push({ ...marker, value: corrected, metric: metricKey, accepted: true });
  });

  if (accepted.length === 0) {
    return { error: "Nothing was ticked, so nothing was saved. Tick the markers you want in your record." };
  }

  const panel = await db.panel.create({
    data: {
      userId: ctx.user.id,
      nameEnc: sealText(ctx.dek, panelName),
      labEnc: extraction.labName ? sealText(ctx.dek, extraction.labName) : null,
      collectedAt,
      source: "document",
      documentId: document.id,
    },
  });

  for (const marker of accepted) {
    await writeObservation(ctx, {
      kind: metric(marker.metric!).category === "lab" ? "lab" : "vital",
      metric: marker.metric!,
      value: marker.value,
      unit: marker.unit || undefined,
      effectiveAt: collectedAt,
      refLow: marker.refLow ?? null,
      refHigh: marker.refHigh ?? null,
      refText: marker.refText ?? null,
      source: "document",
      panelId: panel.id,
      documentId: document.id,
    });
  }

  await db.document.update({
    where: { id: document.id },
    data: {
      status: "confirmed",
      extractionEnc: sealJson(ctx.dek, { ...extraction, markers: extraction.markers.map((m, i) => ({ ...m, accepted: formData.get(`accept-${i}`) === "on" })) }),
    },
  });
  await audit({
    userId: ctx.user.id,
    action: "document.confirm",
    resource: `document:${document.id}`,
    dek: ctx.dek,
    detail: { saved: accepted.length, offered: extraction.markers.length },
  });

  revalidatePath("/record");
  revalidatePath("/record/labs");
  revalidatePath("/today");
  redirect("/record/labs");
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const id = String(formData.get("id") ?? "");

  const document = await db.document.findFirst({ where: { id, userId: ctx.user.id } });
  if (!document) redirect("/record/documents");

  await deleteStored(document.storageKey);
  await db.observation.deleteMany({ where: { userId: ctx.user.id, documentId: id } });
  await db.document.delete({ where: { id } });
  await audit({
    userId: ctx.user.id,
    action: "record.delete",
    resource: `document:${id}`,
    dek: ctx.dek,
    detail: { filename: openText(ctx.dek, document.filenameEnc) },
  });

  revalidatePath("/record/documents");
  redirect("/record/documents");
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

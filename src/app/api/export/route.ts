import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { openJsonSafe, openText } from "@/lib/crypto";
import { getAllergies, getConditions, getMedications, getProfile } from "@/lib/record";
import { metric } from "@/lib/metrics";
import type { ExtractionResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export produces either a plain JSON dump or a real FHIR R4 bundle. The record
 * is portable by construction — that is the whole argument against a walled
 * garden, so it cannot be a feature that is promised and not built.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Not signed in.", { status: 401 });

  const format = new URL(request.url).searchParams.get("format") === "fhir" ? "fhir" : "json";

  const [profile, conditions, allergies, medications, observations, panels, documents] = await Promise.all([
    getProfile(ctx),
    getConditions(ctx),
    getAllergies(ctx),
    getMedications(ctx),
    db.observation.findMany({ where: { userId: ctx.user.id }, orderBy: { effectiveAt: "asc" } }),
    db.panel.findMany({ where: { userId: ctx.user.id }, orderBy: { collectedAt: "asc" } }),
    db.document.findMany({ where: { userId: ctx.user.id }, orderBy: { uploadedAt: "asc" } }),
  ]);

  const readings = observations.map((row) => ({
    id: row.id,
    kind: row.kind,
    metric: row.metric,
    label: metric(row.metric).label,
    value: Number(openText(ctx.dek, row.valueEnc)),
    unit: row.unit,
    effectiveAt: row.effectiveAt.toISOString(),
    referenceLow: row.refLow,
    referenceHigh: row.refHigh,
    note: row.noteEnc ? openText(ctx.dek, row.noteEnc) : null,
    source: row.source,
    panelId: row.panelId,
  }));

  await audit({
    userId: ctx.user.id,
    action: "export.create",
    resource: `export:${format}`,
    dek: ctx.dek,
    detail: { readings: readings.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const body =
    format === "fhir"
      ? fhirBundle({ profile, conditions, allergies, medications, readings })
      : {
          exportedAt: new Date().toISOString(),
          application: "Aayu",
          account: ctx.user.email,
          profile,
          conditions: conditions.map(({ id, name, icd10, tag, active, onsetAt }) => ({ id, name, icd10, tag, active, onsetAt })),
          allergies: allergies.map(({ id, substance, reaction, severity }) => ({ id, substance, reaction, severity })),
          medications: medications.map(({ id, name, dose, schedule, active, startedAt, endedAt, purpose }) => ({
            id, name, dose, schedule, active, startedAt, endedAt, purpose,
          })),
          panels: panels.map((panel) => ({
            id: panel.id,
            name: openText(ctx.dek, panel.nameEnc),
            lab: panel.labEnc ? openText(ctx.dek, panel.labEnc) : null,
            collectedAt: panel.collectedAt.toISOString(),
          })),
          readings,
          documents: documents.map((doc) => ({
            id: doc.id,
            filename: openText(ctx.dek, doc.filenameEnc),
            mime: doc.mime,
            status: doc.status,
            uploadedAt: doc.uploadedAt.toISOString(),
            text: doc.textEnc ? openText(ctx.dek, doc.textEnc) : null,
            extraction: openJsonSafe<ExtractionResult | null>(ctx.dek, doc.extractionEnc, null),
          })),
        };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aayu-export-${format}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

type Reading = {
  metric: string;
  label: string;
  value: number;
  unit: string;
  effectiveAt: string;
  referenceLow: number | null;
  referenceHigh: number | null;
};

function fhirBundle(input: {
  profile: Awaited<ReturnType<typeof getProfile>>;
  conditions: Awaited<ReturnType<typeof getConditions>>;
  allergies: Awaited<ReturnType<typeof getAllergies>>;
  medications: Awaited<ReturnType<typeof getMedications>>;
  readings: Reading[];
}) {
  const patientId = "patient-1";
  const entries: Array<Record<string, unknown>> = [
    {
      resource: {
        resourceType: "Patient",
        id: patientId,
        birthDate: input.profile.dob ?? undefined,
        gender:
          input.profile.sexAtBirth === "male" || input.profile.sexAtBirth === "female"
            ? input.profile.sexAtBirth
            : "unknown",
      },
    },
  ];

  input.conditions.forEach((condition, i) => {
    entries.push({
      resource: {
        resourceType: "Condition",
        id: `condition-${i + 1}`,
        subject: { reference: `Patient/${patientId}` },
        clinicalStatus: { coding: [{ code: condition.active ? "active" : "resolved" }] },
        code: {
          text: condition.name,
          coding: condition.icd10 ? [{ system: "http://hl7.org/fhir/sid/icd-10", code: condition.icd10, display: condition.name }] : undefined,
        },
        onsetDateTime: condition.onsetAt?.toISOString(),
      },
    });
  });

  input.allergies.forEach((allergy, i) => {
    entries.push({
      resource: {
        resourceType: "AllergyIntolerance",
        id: `allergy-${i + 1}`,
        patient: { reference: `Patient/${patientId}` },
        code: { text: allergy.substance },
        criticality: allergy.severity === "severe" ? "high" : allergy.severity === "mild" ? "low" : undefined,
        reaction: allergy.reaction ? [{ manifestation: [{ text: allergy.reaction }] }] : undefined,
      },
    });
  });

  input.medications.forEach((med, i) => {
    entries.push({
      resource: {
        resourceType: "MedicationStatement",
        id: `medication-${i + 1}`,
        subject: { reference: `Patient/${patientId}` },
        status: med.active ? "active" : "stopped",
        medicationCodeableConcept: { text: med.name },
        dosage: med.dose ? [{ text: `${med.dose}${med.schedule.length ? ` at ${med.schedule.join(", ")}` : ""}` }] : undefined,
        effectivePeriod: { start: med.startedAt.toISOString(), end: med.endedAt?.toISOString() },
      },
    });
  });

  input.readings.forEach((reading, i) => {
    const loinc = metric(reading.metric).loinc;
    entries.push({
      resource: {
        resourceType: "Observation",
        id: `observation-${i + 1}`,
        status: "final",
        subject: { reference: `Patient/${patientId}` },
        effectiveDateTime: reading.effectiveAt,
        code: {
          text: reading.label,
          coding: loinc ? [{ system: "http://loinc.org", code: loinc, display: reading.label }] : undefined,
        },
        valueQuantity: { value: reading.value, unit: reading.unit },
        referenceRange:
          reading.referenceLow != null || reading.referenceHigh != null
            ? [{
                low: reading.referenceLow != null ? { value: reading.referenceLow, unit: reading.unit } : undefined,
                high: reading.referenceHigh != null ? { value: reading.referenceHigh, unit: reading.unit } : undefined,
              }]
            : undefined,
      },
    });
  });

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  };
}

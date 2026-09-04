import "server-only";
import zlib from "node:zlib";
import { db } from "./db";
import { METRICS, metric, normaliseMarkerName } from "./metrics";
import { matchCondition } from "./conditions";
import { sealJson } from "./crypto";
import { writeObservation, type Ctx } from "./record";
import type { AllergyData, ConditionData, MedicationData } from "./types";

/**
 * File import is the path that always works. A provider connector can be
 * unavailable, rate-limited or region-locked; an export file cannot. Apple
 * Health exports, FHIR bundles and plain CSV all parse here, offline, with no
 * third-party service involved.
 */

export type ImportSummary = {
  observations: number;
  conditions: number;
  medications: number;
  allergies: number;
  panels: number;
  skipped: number;
  format: string;
  notes: string[];
};

const empty = (format: string): ImportSummary => ({
  observations: 0, conditions: 0, medications: 0, allergies: 0, panels: 0, skipped: 0, format, notes: [],
});

export async function importFile(
  ctx: Ctx,
  file: { name: string; data: Buffer },
): Promise<ImportSummary> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".zip") || file.data.subarray(0, 2).toString("latin1") === "PK") {
    const xml = extractFromZip(file.data, (entry) => entry.endsWith("export.xml"));
    if (!xml) {
      const summary = empty("zip");
      summary.notes.push("No export.xml found inside that archive. Apple Health exports contain one at the top level.");
      return summary;
    }
    return importAppleHealth(ctx, xml.toString("utf8"));
  }
  if (name.endsWith(".xml") || file.data.subarray(0, 200).includes(Buffer.from("<HealthData"))) {
    return importAppleHealth(ctx, file.data.toString("utf8"));
  }
  if (name.endsWith(".json")) {
    return importFhir(ctx, file.data.toString("utf8"));
  }
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    return importCsv(ctx, file.data.toString("utf8"));
  }

  const summary = empty("unknown");
  summary.notes.push("Aayu could not tell what that file is. Supported: Apple Health export (.zip or .xml), a FHIR bundle (.json), or a CSV of readings.");
  return summary;
}

/* ── Apple Health ──────────────────────────────────────────────────────── */

const HK_MAP: Record<string, { metric: string; scale?: number; aggregate: "sum" | "mean" | "last" }> = {
  HKQuantityTypeIdentifierStepCount: { metric: "steps", aggregate: "sum" },
  HKQuantityTypeIdentifierBodyMass: { metric: "weight", aggregate: "last" },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: "resting_hr", aggregate: "mean" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: "hrv", aggregate: "mean" },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: "spo2", scale: 100, aggregate: "mean" },
  HKQuantityTypeIdentifierBloodGlucose: { metric: "glucose_random", aggregate: "mean" },
  HKQuantityTypeIdentifierBloodPressureSystolic: { metric: "bp_systolic", aggregate: "mean" },
  HKQuantityTypeIdentifierBloodPressureDiastolic: { metric: "bp_diastolic", aggregate: "mean" },
  HKQuantityTypeIdentifierBodyTemperature: { metric: "temperature", aggregate: "mean" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: "active_energy", aggregate: "sum" },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: "exercise_minutes", aggregate: "sum" },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { metric: "calories", aggregate: "sum" },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { metric: "carbs", aggregate: "sum" },
  HKQuantityTypeIdentifierDietaryProtein: { metric: "protein", aggregate: "sum" },
  HKQuantityTypeIdentifierDietaryFiber: { metric: "fiber", aggregate: "sum" },
  HKQuantityTypeIdentifierDietaryWater: { metric: "water", aggregate: "sum" },
  HKQuantityTypeIdentifierWaistCircumference: { metric: "waist", aggregate: "last" },
  HKCategoryTypeIdentifierSleepAnalysis: { metric: "sleep_duration", aggregate: "sum" },
};

async function importAppleHealth(ctx: Ctx, xml: string): Promise<ImportSummary> {
  const summary = empty("Apple Health");
  // Daily buckets: a wearable produces thousands of samples a day, and a
  // per-sample row would drown the timeline without telling you anything more.
  const buckets = new Map<string, { values: number[]; metric: string; how: "sum" | "mean" | "last" }>();

  const recordRe = /<Record\s([^>]*?)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = recordRe.exec(xml)) !== null) {
    const attrs = parseAttrs(match[1]);
    const mapping = HK_MAP[attrs.type ?? ""];
    if (!mapping) { summary.skipped += 1; continue; }

    const start = attrs.startDate ? new Date(attrs.startDate.replace(" ", "T")) : null;
    if (!start || Number.isNaN(start.getTime())) { summary.skipped += 1; continue; }

    let value: number;
    if (attrs.type === "HKCategoryTypeIdentifierSleepAnalysis") {
      if (!/Asleep/i.test(attrs.value ?? "")) { summary.skipped += 1; continue; }
      const end = attrs.endDate ? new Date(attrs.endDate.replace(" ", "T")) : null;
      if (!end) { summary.skipped += 1; continue; }
      value = (end.getTime() - start.getTime()) / 3_600_000;
    } else {
      value = Number(attrs.value);
      if (!Number.isFinite(value)) { summary.skipped += 1; continue; }
      if (mapping.scale) value *= mapping.scale;
    }

    const day = start.toISOString().slice(0, 10);
    const key = `${mapping.metric}|${day}`;
    const bucket = buckets.get(key) ?? { values: [], metric: mapping.metric, how: mapping.aggregate };
    bucket.values.push(value);
    buckets.set(key, bucket);
  }

  for (const [key, bucket] of buckets) {
    const [, day] = key.split("|");
    const value =
      bucket.how === "sum"
        ? bucket.values.reduce((a, b) => a + b, 0)
        : bucket.how === "mean"
          ? bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length
          : bucket.values[bucket.values.length - 1];

    await writeObservation(ctx, {
      kind: metric(bucket.metric).category === "nutrition" ? "nutrition" : "wearable",
      metric: bucket.metric,
      value: Math.round(value * 100) / 100,
      effectiveAt: new Date(`${day}T12:00:00.000Z`),
      source: "apple_health",
    });
    summary.observations += 1;
  }

  summary.notes.push("Samples are aggregated into one value per day per metric — a sum for steps and nutrition, a mean for heart and glucose, the last reading for weight.");
  return summary;
}

/* ── FHIR R4 ───────────────────────────────────────────────────────────── */

type FhirResource = Record<string, unknown> & { resourceType?: string };

async function importFhir(ctx: Ctx, json: string): Promise<ImportSummary> {
  const summary = empty("FHIR R4");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    summary.notes.push("That file is not valid JSON.");
    return summary;
  }

  const resources: FhirResource[] = [];
  const root = parsed as Record<string, unknown>;
  if (root.resourceType === "Bundle" && Array.isArray(root.entry)) {
    for (const entry of root.entry as Array<Record<string, unknown>>) {
      if (entry.resource) resources.push(entry.resource as FhirResource);
    }
  } else if (Array.isArray(parsed)) {
    resources.push(...(parsed as FhirResource[]));
  } else if (root.resourceType) {
    resources.push(root as FhirResource);
  }

  if (!resources.length) {
    summary.notes.push("No FHIR resources found in that file.");
    return summary;
  }

  for (const resource of resources) {
    switch (resource.resourceType) {
      case "Observation": {
        const written = await importFhirObservation(ctx, resource);
        if (written) summary.observations += 1;
        else summary.skipped += 1;
        break;
      }
      case "Condition": {
        const name = codeText(resource.code);
        if (!name) { summary.skipped += 1; break; }
        const matched = matchCondition(name);
        const data: ConditionData = { name: matched?.name ?? name, icd10: matched?.icd10 ?? codeValue(resource.code) };
        await db.condition.create({
          data: {
            userId: ctx.user.id,
            dataEnc: sealJson(ctx.dek, data),
            tag: matched?.tag ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
            onsetAt: dateOf(resource.onsetDateTime) ?? null,
          },
        });
        summary.conditions += 1;
        break;
      }
      case "MedicationRequest":
      case "MedicationStatement": {
        const med = resource.medicationCodeableConcept ?? resource.medication;
        const name = codeText(med);
        if (!name) { summary.skipped += 1; break; }
        const data: MedicationData = { name, schedule: [], notes: dosageText(resource) };
        await db.medication.create({
          data: {
            userId: ctx.user.id,
            dataEnc: sealJson(ctx.dek, data),
            active: (resource.status as string) === "active",
            startedAt: dateOf(resource.authoredOn) ?? new Date(),
          },
        });
        summary.medications += 1;
        break;
      }
      case "AllergyIntolerance": {
        const substance = codeText(resource.code);
        if (!substance) { summary.skipped += 1; break; }
        const criticality = String(resource.criticality ?? "");
        const severity: AllergyData["severity"] = criticality === "high" ? "severe" : criticality === "low" ? "mild" : "unknown";
        await db.allergy.create({
          data: {
            userId: ctx.user.id,
            dataEnc: sealJson(ctx.dek, { substance, severity } satisfies AllergyData),
            severity: severity ?? "unknown",
          },
        });
        summary.allergies += 1;
        break;
      }
      default:
        summary.skipped += 1;
    }
  }

  summary.notes.push("Conditions and medications are matched onto Aayu's coded vocabulary so they merge with what you entered by hand.");
  return summary;
}

async function importFhirObservation(ctx: Ctx, resource: FhirResource): Promise<boolean> {
  const name = codeText(resource.code);
  const loinc = codeValue(resource.code);
  const metricKey =
    (loinc ? findByLoinc(loinc) : null) ?? (name ? normaliseMarkerName(name) : null);
  if (!metricKey) return false;

  const quantity = resource.valueQuantity as { value?: number; unit?: string } | undefined;
  if (!quantity || typeof quantity.value !== "number") return false;

  const effectiveAt =
    dateOf(resource.effectiveDateTime) ??
    dateOf((resource.effectivePeriod as { start?: string } | undefined)?.start) ??
    dateOf(resource.issued) ??
    new Date();

  const ranges = (resource.referenceRange as Array<Record<string, { value?: number }>> | undefined)?.[0];

  await writeObservation(ctx, {
    kind: metric(metricKey).category === "lab" ? "lab" : "vital",
    metric: metricKey,
    value: quantity.value,
    unit: quantity.unit ?? metric(metricKey).unit,
    effectiveAt,
    refLow: ranges?.low?.value ?? null,
    refHigh: ranges?.high?.value ?? null,
    source: "fhir",
  });
  return true;
}

function findByLoinc(code: string): string | null {
  return METRICS.find((m) => m.loinc === code)?.key ?? null;
}

function codeText(code: unknown): string | null {
  if (!code || typeof code !== "object") return null;
  const c = code as { text?: string; coding?: Array<{ display?: string; code?: string }> };
  return c.text ?? c.coding?.[0]?.display ?? c.coding?.[0]?.code ?? null;
}

function codeValue(code: unknown): string | undefined {
  if (!code || typeof code !== "object") return undefined;
  return (code as { coding?: Array<{ code?: string }> }).coding?.[0]?.code;
}

function dosageText(resource: FhirResource): string | undefined {
  const dosage = (resource.dosageInstruction ?? resource.dosage) as Array<{ text?: string }> | undefined;
  return dosage?.[0]?.text;
}

function dateOf(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

async function importCsv(ctx: Ctx, text: string): Promise<ImportSummary> {
  const summary = empty("CSV");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return summary;

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].toLowerCase().split(delimiter).map((h) => h.trim());
  const dateIdx = header.findIndex((h) => /date|time|when/.test(h));
  const metricIdx = header.findIndex((h) => /metric|marker|name|type|test/.test(h));
  const valueIdx = header.findIndex((h) => /value|result|reading/.test(h));
  const unitIdx = header.findIndex((h) => /unit/.test(h));

  if (dateIdx < 0 || metricIdx < 0 || valueIdx < 0) {
    summary.notes.push("The CSV needs a header row with at least a date column, a metric column and a value column.");
    return summary;
  }

  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    const when = new Date(cells[dateIdx]);
    const metricKey = normaliseMarkerName(cells[metricIdx] ?? "");
    const value = Number(cells[valueIdx]);
    if (!metricKey || Number.isNaN(when.getTime()) || !Number.isFinite(value)) {
      summary.skipped += 1;
      continue;
    }
    await writeObservation(ctx, {
      kind: metric(metricKey).category === "lab" ? "lab" : "vital",
      metric: metricKey,
      value,
      unit: unitIdx >= 0 ? cells[unitIdx] : undefined,
      effectiveAt: when,
      source: "csv",
    });
    summary.observations += 1;
  }
  return summary;
}

/* ── minimal zip reader ────────────────────────────────────────────────── */

/** Reads one matching entry out of a ZIP without pulling in a dependency. */
function extractFromZip(buffer: Buffer, matches: (name: string) => boolean): Buffer | null {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (matches(name)) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      return method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/* ── shared ────────────────────────────────────────────────────────────── */

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) attrs[match[1]] = match[2];
  return attrs;
}

export const _internal = { extractFromZip };

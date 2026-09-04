import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { openJson, openJsonSafe, openText, sealJson, sealText } from "./crypto";
import { metric, metricLabel, rangeFor, statusFor, targetFor, type Status } from "./metrics";
import type {
  AllergyData,
  ConditionData,
  ConsentCategories,
  MedicationData,
  ProfileData,
} from "./types";

/**
 * Every read in this module takes a userId and filters on it. Authorisation
 * lives here, in the data-access layer, rather than being re-derived in each
 * route — a query that forgets the scope will not compile.
 */

export type Ctx = { user: User; dek: Buffer };

export function consentAllows(user: User, category: keyof ConsentCategories): boolean {
  const consent = (user.consent ?? {}) as ConsentCategories;
  return consent[category] === true;
}

export function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

/* ── profile ───────────────────────────────────────────────────────────── */

export async function getProfile(ctx: Ctx): Promise<ProfileData> {
  const row = await db.profile.findUnique({ where: { userId: ctx.user.id } });
  if (!row) return {};
  return openJsonSafe<ProfileData>(ctx.dek, row.dataEnc, {});
}

export async function saveProfile(ctx: Ctx, data: ProfileData): Promise<void> {
  const payload = sealJson(ctx.dek, data);
  await db.profile.upsert({
    where: { userId: ctx.user.id },
    create: { userId: ctx.user.id, dataEnc: payload },
    update: { dataEnc: payload },
  });
}

export async function getConditions(ctx: Ctx) {
  const rows = await db.condition.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    tag: row.tag,
    active: row.active,
    onsetAt: row.onsetAt,
    ...openJsonSafe<ConditionData>(ctx.dek, row.dataEnc, { name: "Unreadable entry" }),
  }));
}

export async function getAllergies(ctx: Ctx) {
  const rows = await db.allergy.findMany({ where: { userId: ctx.user.id } });
  return rows.map((row) => ({
    id: row.id,
    severity: row.severity,
    ...openJsonSafe<AllergyData>(ctx.dek, row.dataEnc, { substance: "Unreadable entry" }),
  }));
}

export async function getMedications(ctx: Ctx, opts: { active?: boolean } = {}) {
  const rows = await db.medication.findMany({
    where: { userId: ctx.user.id, ...(opts.active === undefined ? {} : { active: opts.active }) },
    orderBy: { startedAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    active: row.active,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    ...openJsonSafe<MedicationData>(ctx.dek, row.dataEnc, { name: "Unreadable entry", schedule: [] }),
  }));
}

export type MedicationWithAdherence = Awaited<ReturnType<typeof getMedications>>[number] & {
  adherence: number | null;
  dosesTaken: number;
  dosesDue: number;
  daysRemaining: number | null;
};

export async function getMedicationsWithAdherence(
  ctx: Ctx,
  windowDays = 30,
): Promise<MedicationWithAdherence[]> {
  const meds = await getMedications(ctx, { active: true });
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const doses = await db.doseEvent.findMany({
    where: { userId: ctx.user.id, scheduledAt: { gte: since, lte: new Date() } },
  });

  return meds.map((med) => {
    const own = doses.filter((d) => d.medicationId === med.id);
    const taken = own.filter((d) => d.status === "taken").length;
    const perDay = med.schedule.length || 1;
    const daysRemaining =
      med.quantityRemaining != null ? Math.floor(med.quantityRemaining / perDay) : null;
    return {
      ...med,
      dosesTaken: taken,
      dosesDue: own.length,
      adherence: own.length ? taken / own.length : null,
      daysRemaining,
    };
  });
}

/* ── observations ──────────────────────────────────────────────────────── */

export type Point = { at: Date; value: number; note?: string | null; source: string; id: string };

export type SeriesStats = {
  count: number;
  latest: Point | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Percentage change from the first half of the window to the second. */
  trendPct: number | null;
  inRangePct: number | null;
  previousMean: number | null;
};

export type Series = {
  metric: string;
  label: string;
  unit: string;
  points: Point[];
  stats: SeriesStats;
  range: ReturnType<typeof rangeFor>;
  status: Status;
};

export async function getSeries(
  ctx: Ctx,
  metricKey: string,
  opts: { from?: Date; to?: Date; limit?: number } = {},
): Promise<Series> {
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - 30 * 86_400_000);

  const rows = await db.observation.findMany({
    where: { userId: ctx.user.id, metric: metricKey, effectiveAt: { gte: from, lte: to } },
    orderBy: { effectiveAt: "asc" },
    take: opts.limit ?? 2000,
  });

  const points: Point[] = rows.map((row) => ({
    id: row.id,
    at: row.effectiveAt,
    value: Number(openText(ctx.dek, row.valueEnc)),
    note: row.noteEnc ? openText(ctx.dek, row.noteEnc) : null,
    source: row.source,
  }));

  const def = metric(metricKey);
  const last = rows.at(-1);
  const range = rangeFor(metricKey, last ?? undefined);

  const priorWindow = await db.observation.findMany({
    where: {
      userId: ctx.user.id,
      metric: metricKey,
      effectiveAt: { gte: new Date(from.getTime() - (to.getTime() - from.getTime())), lt: from },
    },
  });
  const priorValues = priorWindow.map((r) => Number(openText(ctx.dek, r.valueEnc)));

  return {
    metric: metricKey,
    label: metricLabel(metricKey),
    unit: def.unit,
    points,
    range,
    status: points.length ? statusFor(points[points.length - 1].value, range) : "unknown",
    stats: summarise(points, range, priorValues),
  };
}

function summarise(points: Point[], range: ReturnType<typeof rangeFor>, prior: number[]): SeriesStats {
  if (points.length === 0) {
    return { count: 0, latest: null, mean: null, min: null, max: null, trendPct: null, inRangePct: null, previousMean: null };
  }
  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half || 1);
  const secondHalf = values.slice(half);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const trendPct =
    values.length >= 4 && avg(firstHalf) !== 0
      ? ((avg(secondHalf) - avg(firstHalf)) / Math.abs(avg(firstHalf))) * 100
      : null;
  const bounded = range.low != null || range.high != null;
  const inRange = bounded
    ? values.filter((v) => statusFor(v, range) === "in_range").length / values.length
    : null;

  return {
    count: values.length,
    latest: points[points.length - 1],
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    trendPct,
    inRangePct: inRange == null ? null : inRange * 100,
    previousMean: prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null,
  };
}

export type LabResult = {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  at: Date;
  status: Status;
  range: ReturnType<typeof rangeFor>;
  target: ReturnType<typeof targetFor>;
  panelName: string | null;
  source: string;
};

export async function getLabs(
  ctx: Ctx,
  opts: { metrics?: string[]; from?: Date; to?: Date; limit?: number; latestOnly?: boolean } = {},
): Promise<LabResult[]> {
  const rows = await db.observation.findMany({
    where: {
      userId: ctx.user.id,
      kind: "lab",
      ...(opts.metrics?.length ? { metric: { in: opts.metrics } } : {}),
      ...(opts.from || opts.to
        ? { effectiveAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    },
    orderBy: { effectiveAt: "desc" },
    take: opts.limit ?? 400,
    include: { panel: true },
  });

  const conditions = (await getConditions(ctx)).filter((c) => c.active).map((c) => c.tag);
  const profile = await getProfile(ctx);
  const age = ageFrom(profile.dob);

  const seen = new Set<string>();
  const results: LabResult[] = [];
  for (const row of rows) {
    if (opts.latestOnly) {
      if (seen.has(row.metric)) continue;
      seen.add(row.metric);
    }
    const value = Number(openText(ctx.dek, row.valueEnc));
    const range = rangeFor(row.metric, row);
    results.push({
      id: row.id,
      metric: row.metric,
      label: metricLabel(row.metric),
      value,
      unit: row.unit,
      at: row.effectiveAt,
      status: statusFor(value, range),
      range,
      target: targetFor(row.metric, { conditions, age }),
      panelName: row.panel ? openText(ctx.dek, row.panel.nameEnc) : null,
      source: row.source,
    });
  }
  return results;
}

export async function writeObservation(
  ctx: Ctx,
  input: {
    kind: string;
    metric: string;
    value: number;
    unit?: string;
    effectiveAt?: Date;
    note?: string | null;
    refLow?: number | null;
    refHigh?: number | null;
    refText?: string | null;
    source?: string;
    panelId?: string | null;
    documentId?: string | null;
  },
) {
  const def = metric(input.metric);
  const effectiveAt = input.effectiveAt ?? new Date();
  // Two sources reporting the same measurement collapse into one row.
  const dedupeKey = `${input.metric}:${effectiveAt.toISOString().slice(0, 16)}:${input.value}`;

  return db.observation.upsert({
    where: { userId_dedupeKey: { userId: ctx.user.id, dedupeKey } },
    create: {
      userId: ctx.user.id,
      kind: input.kind,
      metric: input.metric,
      unit: input.unit ?? def.unit,
      effectiveAt,
      valueEnc: sealText(ctx.dek, String(input.value)),
      noteEnc: input.note ? sealText(ctx.dek, input.note) : null,
      refLow: input.refLow ?? null,
      refHigh: input.refHigh ?? null,
      refText: input.refText ?? null,
      source: input.source ?? "manual",
      dedupeKey,
      panelId: input.panelId ?? null,
      documentId: input.documentId ?? null,
    },
    update: { source: input.source ?? "manual" },
  });
}

/* ── timeline ──────────────────────────────────────────────────────────── */

export type TimelineEvent = {
  id: string;
  at: Date;
  type: "lab" | "vital" | "wearable" | "nutrition" | "document" | "medication" | "panel" | "sync";
  title: string;
  detail: string;
  muted?: boolean;
  href?: string;
};

export async function getTimeline(ctx: Ctx, limit = 60): Promise<TimelineEvent[]> {
  const [panels, vitals, documents, meds] = await Promise.all([
    db.panel.findMany({ where: { userId: ctx.user.id }, orderBy: { collectedAt: "desc" }, take: limit, include: { results: true } }),
    db.observation.findMany({
      where: { userId: ctx.user.id, kind: { in: ["vital", "nutrition"] } },
      orderBy: { effectiveAt: "desc" },
      take: limit,
    }),
    db.document.findMany({ where: { userId: ctx.user.id }, orderBy: { uploadedAt: "desc" }, take: 20 }),
    db.medication.findMany({ where: { userId: ctx.user.id }, orderBy: { startedAt: "desc" }, take: 10 }),
  ]);

  const events: TimelineEvent[] = [];

  for (const panel of panels) {
    const flagged = panel.results.filter((r) => {
      const value = Number(openText(ctx.dek, r.valueEnc));
      return statusFor(value, rangeFor(r.metric, r)) !== "in_range";
    }).length;
    events.push({
      id: panel.id,
      at: panel.collectedAt,
      type: "panel",
      title: openText(ctx.dek, panel.nameEnc),
      detail: `${panel.results.length} marker${panel.results.length === 1 ? "" : "s"}${flagged ? ` · ${flagged} outside range` : " · all in range"}${panel.labEnc ? ` · ${openText(ctx.dek, panel.labEnc)}` : ""}`,
      href: "/record/labs",
    });
  }

  for (const row of vitals) {
    const value = Number(openText(ctx.dek, row.valueEnc));
    events.push({
      id: row.id,
      at: row.effectiveAt,
      type: row.kind as TimelineEvent["type"],
      title: `${metricLabel(row.metric)} ${value}${row.unit ? ` ${row.unit}` : ""}`,
      detail: row.source === "manual" ? "Logged by you" : `From ${row.source}`,
      href: `/metric/${row.metric}`,
    });
  }

  for (const doc of documents) {
    events.push({
      id: doc.id,
      at: doc.uploadedAt,
      type: "document",
      title: openText(ctx.dek, doc.filenameEnc),
      detail:
        doc.status === "confirmed"
          ? "Extracted and confirmed"
          : doc.status === "needs_review"
            ? "Extracted — waiting for you to confirm"
            : doc.status === "processing"
              ? "Being read"
              : doc.status,
      muted: true,
      href: `/record/documents/${doc.id}`,
    });
  }

  for (const med of meds) {
    const data = openJsonSafe<MedicationData>(ctx.dek, med.dataEnc, { name: "Medication", schedule: [] });
    events.push({
      id: med.id,
      at: med.startedAt,
      type: "medication",
      title: `Started ${data.name}${data.dose ? ` ${data.dose}` : ""}`,
      detail: data.schedule.length ? `${data.schedule.length}× daily` : "As needed",
      muted: true,
      href: "/care/medications",
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/* ── documents ─────────────────────────────────────────────────────────── */

export async function searchDocuments(ctx: Ctx, query: string, limit = 6) {
  const docs = await db.document.findMany({
    where: { userId: ctx.user.id, textEnc: { not: null } },
    orderBy: { uploadedAt: "desc" },
    take: 60,
  });
  const needles = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const hits: Array<{ id: string; filename: string; uploadedAt: Date; passage: string; score: number }> = [];

  for (const doc of docs) {
    const text = doc.textEnc ? openText(ctx.dek, doc.textEnc) : "";
    const lower = text.toLowerCase();
    let score = 0;
    let firstAt = -1;
    for (const needle of needles) {
      const at = lower.indexOf(needle);
      if (at >= 0) {
        score += 1;
        if (firstAt < 0 || at < firstAt) firstAt = at;
      }
    }
    if (score === 0) continue;
    const start = Math.max(0, firstAt - 120);
    hits.push({
      id: doc.id,
      filename: openText(ctx.dek, doc.filenameEnc),
      uploadedAt: doc.uploadedAt,
      passage: text.slice(start, start + 360).replace(/\s+/g, " ").trim(),
      score,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const sealString = sealText;
export const openString = openText;
export const readJson = openJson;

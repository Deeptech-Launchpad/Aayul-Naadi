import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { anthropic, friendlyError, nadiAvailable } from "./nadi";
import { openJsonSafe, openText, sealJson, sealText } from "./crypto";
import { formatRange, formatValue, metricLabel } from "./metrics";
import { evaluateCareGaps } from "./caregaps";
import {
  ageFrom,
  getLabs,
  getMedicationsWithAdherence,
  getProfile,
  getSeries,
  getConditions,
  type Ctx,
} from "./record";
import { subjectDescriptor } from "./deident";
import type { Citation } from "./types";

/**
 * The morning read and the visit-prep note.
 *
 * Both work the same way: the app assembles the facts deterministically, and
 * Claude only turns those facts into language. Nothing is summarised that was
 * not first computed, which is why every sentence can carry a citation.
 */

const WATCHED_SERIES = [
  "glucose_fasting",
  "bp_systolic",
  "sleep_duration",
  "steps",
  "weight",
  "resting_hr",
];

type Facts = {
  subject: string;
  flaggedLabs: string[];
  movingSeries: string[];
  steadySeries: string[];
  careGaps: string[];
  adherence: string[];
  citations: Citation[];
};

async function gatherFacts(ctx: Ctx): Promise<Facts> {
  const [profile, conditions, labs, gaps, meds] = await Promise.all([
    getProfile(ctx),
    getConditions(ctx),
    getLabs(ctx, { latestOnly: true, limit: 120 }),
    evaluateCareGaps(ctx),
    getMedicationsWithAdherence(ctx, 30),
  ]);

  const citations: Citation[] = [];
  const flagged = labs.filter((l) => l.status !== "in_range");
  if (flagged.length) {
    citations.push({
      tool: "get_labs",
      label: "Labs · flagged",
      detail: `${flagged.length} outside range`,
      rows: flagged.length,
    });
  }

  const moving: string[] = [];
  const steady: string[] = [];
  for (const key of WATCHED_SERIES) {
    const series = await getSeries(ctx, key, {
      from: new Date(Date.now() - 30 * 86_400_000),
    });
    if (series.stats.count < 3) continue;
    const { mean, previousMean, trendPct, latest } = series.stats;
    const line = `${series.label}: latest ${formatValue(key, latest!.value)} ${series.unit}; 30-day mean ${mean!.toFixed(1)}${
      previousMean != null ? `; previous 30-day mean ${previousMean.toFixed(1)}` : ""
    }${trendPct != null ? `; trend ${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%` : ""}; ${series.stats.count} readings`;

    const shifted =
      (trendPct != null && Math.abs(trendPct) >= 5) ||
      (previousMean != null && mean != null && Math.abs(mean - previousMean) / Math.max(Math.abs(previousMean), 1) >= 0.05);

    if (shifted) {
      moving.push(line);
      citations.push({
        tool: "get_series",
        label: series.label,
        detail: `30d · ${series.stats.count} readings`,
        rows: series.stats.count,
      });
    } else {
      steady.push(`${series.label} unchanged`);
    }
  }

  const outstanding = gaps.filter((g) => g.status === "overdue" || g.status === "due_soon" || g.status === "never_done");
  if (outstanding.length) {
    citations.push({
      tool: "get_care_gaps",
      label: "Care gaps",
      detail: `${outstanding.length} outstanding`,
      rows: outstanding.length,
    });
  }

  const adherence = meds
    .filter((m) => m.adherence != null)
    .map((m) => `${m.name}: ${Math.round(m.adherence! * 100)}% of ${m.dosesDue} doses over 30 days`);
  if (adherence.length) {
    citations.push({
      tool: "get_medications",
      label: "Medication adherence",
      detail: `${meds.length} active`,
      rows: meds.length,
    });
  }

  return {
    subject: subjectDescriptor({
      age: ageFrom(profile.dob),
      sexAtBirth: profile.sexAtBirth,
      conditions: conditions.filter((c) => c.active).map((c) => c.name),
      ancestry: profile.ancestry,
    }),
    flaggedLabs: flagged.map(
      (l) =>
        `${l.label} ${formatValue(l.metric, l.value)} ${l.unit} on ${l.at.toISOString().slice(0, 10)} — ${l.status.replace("_", " ")} (ref ${formatRange(l.range)})`,
    ),
    movingSeries: moving,
    steadySeries: steady,
    careGaps: outstanding.map(
      (g) =>
        `${g.rule.title}: ${g.status.replace("_", " ")}${g.dueAt ? `, due ${g.dueAt.toISOString().slice(0, 10)}` : ""} (${g.rule.guideline})`,
    ),
    adherence,
    citations,
  };
}

function factsBlock(facts: Facts): string {
  return [
    `subject: ${facts.subject}`,
    facts.flaggedLabs.length ? `labs outside range:\n${facts.flaggedLabs.join("\n")}` : "labs outside range: none",
    facts.movingSeries.length ? `metrics that moved:\n${facts.movingSeries.join("\n")}` : "metrics that moved: none",
    facts.steadySeries.length ? `steady: ${facts.steadySeries.join("; ")}` : null,
    facts.careGaps.length ? `care gaps:\n${facts.careGaps.join("\n")}` : "care gaps: none outstanding",
    facts.adherence.length ? `adherence:\n${facts.adherence.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ── morning read ──────────────────────────────────────────────────────── */

const DAILY_SYSTEM = `You write the one-paragraph morning read at the top of a person's own health dashboard.

You are given facts the app has already computed. Use only those facts.

- Two to four sentences. No greeting, no sign-off, no headings.
- Lead with whatever actually changed. If nothing changed, say so in one sentence and stop — an unchanged number is not news.
- Name the numbers and the dates. Say which things line up with each other when the facts support it, and be careful to say "tracks with" rather than implying cause.
- Never diagnose, never advise on medication, never tell the person to see a doctor as filler.
- Precise and calm. "Above your usual range since June", not "concerning".`;

export type DailyRead = { text: string; citations: Citation[]; generatedAt: Date } | null;

export async function getDailyRead(ctx: Ctx, options: { refresh?: boolean } = {}): Promise<DailyRead> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const facts = await gatherFacts(ctx);
  const block = factsBlock(facts);
  const version = crypto.createHash("sha256").update(block).digest("hex").slice(0, 16);

  const cached = await db.dailyRead.findUnique({
    where: { userId_forDate: { userId: ctx.user.id, forDate: today } },
  });
  if (cached && cached.dataVersion === version && !options.refresh) {
    return {
      text: openText(ctx.dek, cached.contentEnc),
      citations: openJsonSafe<Citation[]>(ctx.dek, cached.citationsEnc, []),
      generatedAt: cached.createdAt,
    };
  }

  if (!nadiAvailable()) return null;

  let text: string;
  try {
    const response = await anthropic().messages.create({
      model: env.model,
      max_tokens: 1200,
      system: [{ type: "text", text: DAILY_SYSTEM, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: block }],
    });
    if (response.stop_reason === "refusal") return null;
    text = response.content
      .filter((b): b is { type: "text"; text: string; citations: null } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return null;
  }
  if (!text) return null;

  const record = await db.dailyRead.upsert({
    where: { userId_forDate: { userId: ctx.user.id, forDate: today } },
    create: {
      userId: ctx.user.id,
      forDate: today,
      contentEnc: sealText(ctx.dek, text),
      citationsEnc: sealJson(ctx.dek, facts.citations),
      dataVersion: version,
    },
    update: {
      contentEnc: sealText(ctx.dek, text),
      citationsEnc: sealJson(ctx.dek, facts.citations),
      dataVersion: version,
    },
  });

  return { text, citations: facts.citations, generatedAt: record.createdAt };
}

/* ── visit prep ────────────────────────────────────────────────────────── */

const VISIT_SYSTEM = `You draft a visit-prep note a person takes to their own doctor.

You are given facts the app computed from their record. Use only those facts.

Return exactly two parts, in this order and with these headings:

SUMMARY
Three to five sentences on what has changed since the given date, with numbers and dates.

QUESTIONS
Three to five numbered questions worth asking, each one line, each grounded in a specific fact above. Questions the doctor can answer — not questions you are answering yourself.

Never suggest a diagnosis or a medication change. Where a decision is clearly the clinician's, phrase it as the question to ask them.`;

export type VisitPrep = {
  summary: string;
  questions: string[];
  facts: Facts;
  since: Date;
};

export async function buildVisitPrep(ctx: Ctx, since: Date): Promise<VisitPrep | { error: string }> {
  const facts = await gatherFacts(ctx);
  if (!nadiAvailable()) {
    return { error: "Set ANTHROPIC_API_KEY to have Nadi draft the note. Your facts are still shown below." };
  }
  try {
    const response = await anthropic().messages.create({
      model: env.model,
      max_tokens: 3000,
      system: [{ type: "text", text: VISIT_SYSTEM, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [
        {
          role: "user",
          content: `Interval starts ${since.toISOString().slice(0, 10)}.\n\n${factsBlock(facts)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { error: "Nadi declined to draft that note." };
    }
    const text = response.content
      .filter((b): b is { type: "text"; text: string; citations: null } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const [, summaryPart = "", questionsPart = ""] = text.match(/SUMMARY\s*([\s\S]*?)QUESTIONS\s*([\s\S]*)/i) ?? [];
    const questions = questionsPart
      .split("\n")
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter((line) => line.length > 8);

    return {
      summary: summaryPart.trim() || text.trim(),
      questions: questions.slice(0, 6),
      facts,
      since,
    };
  } catch (error) {
    return { error: friendlyError(error) };
  }
}

export type { Facts as VisitFacts };
export { gatherFacts, metricLabel };

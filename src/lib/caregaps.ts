import "server-only";
import { db } from "./db";
import { openText } from "./crypto";
import { getConditions, getProfile, ageFrom, type Ctx } from "./record";
import { metricLabel } from "./metrics";
import type { ProfileData } from "./types";

/**
 * The care-gap engine is a rules table, not a model.
 *
 * Each rule states the guideline it comes from, who it applies to, how often
 * it repeats, and the record query that satisfies it. Because it is
 * deterministic, every recommendation can show its source and why it applies
 * to you — and it cannot invent a screening that does not exist.
 *
 * These are prompts for a conversation with a clinician. They are not a
 * diagnosis and they do not replace your doctor's judgement.
 */

export type RuleContext = {
  age: number | null;
  sexAtBirth: ProfileData["sexAtBirth"];
  conditions: string[];
  smoker: boolean;
  bmi: number | null;
};

export type CareRule = {
  id: string;
  title: string;
  detail: string;
  guideline: string;
  intervalMonths: number;
  /** Rules that only ever need doing once in a lifetime. */
  once?: boolean;
  applies: (ctx: RuleContext) => boolean;
  because: (ctx: RuleContext) => string;
  /** Any observation of these metrics counts as the screening having happened. */
  satisfiedByMetrics?: string[];
  category: "lab" | "screening" | "exam" | "immunisation";
};

export const CARE_RULES: CareRule[] = [
  {
    id: "hba1c",
    title: "HbA1c",
    detail: "Glycaemic control is checked every three months while a treatment target is not yet met, and every six months once it is stable.",
    guideline: "ADA Standards of Care",
    intervalMonths: 3,
    category: "lab",
    applies: (c) => c.conditions.includes("diabetes_t2") || c.conditions.includes("diabetes_t1"),
    because: () => "you have diabetes on your record",
    satisfiedByMetrics: ["hba1c"],
  },
  {
    id: "lipid_panel",
    title: "Lipid panel",
    detail: "Cholesterol is rechecked annually where cardiovascular risk is raised, and every four to six years otherwise.",
    guideline: "USPSTF · ADA Standards of Care",
    intervalMonths: 12,
    category: "lab",
    applies: (c) =>
      c.conditions.includes("diabetes_t2") ||
      c.conditions.includes("hypertension") ||
      c.conditions.includes("hyperlipidemia") ||
      (c.age != null && c.age >= 40 && c.age <= 75),
    because: (c) =>
      c.conditions.includes("diabetes_t2")
        ? "diabetes raises cardiovascular risk"
        : "adults aged 40–75 are screened for lipid disorders",
    satisfiedByMetrics: ["ldl", "hdl", "cholesterol_total", "triglycerides"],
  },
  {
    id: "kidney_function",
    title: "Kidney function (eGFR & creatinine)",
    detail: "Kidney function is checked at least annually with diabetes or hypertension, because both are leading causes of chronic kidney disease.",
    guideline: "KDIGO · ADA Standards of Care",
    intervalMonths: 12,
    category: "lab",
    applies: (c) => c.conditions.includes("diabetes_t2") || c.conditions.includes("hypertension") || c.conditions.includes("ckd"),
    because: () => "diabetes or hypertension on your record",
    satisfiedByMetrics: ["egfr", "creatinine"],
  },
  {
    id: "blood_pressure",
    title: "Blood pressure check",
    detail: "All adults have blood pressure measured at least annually; more often where it has been raised.",
    guideline: "USPSTF",
    intervalMonths: 12,
    category: "exam",
    applies: (c) => c.age != null && c.age >= 18,
    because: () => "every adult is screened for high blood pressure",
    satisfiedByMetrics: ["bp_systolic"],
  },
  {
    id: "diabetic_eye_exam",
    title: "Dilated eye exam",
    detail: "A dilated retinal exam finds diabetic retinopathy before it affects vision, when it is still treatable.",
    guideline: "ADA Standards of Care",
    intervalMonths: 12,
    category: "exam",
    applies: (c) => c.conditions.includes("diabetes_t2") || c.conditions.includes("diabetes_t1"),
    because: () => "annual retinal screening is recommended with diabetes",
  },
  {
    id: "diabetic_foot_exam",
    title: "Comprehensive foot exam",
    detail: "An annual foot exam checks sensation and circulation, catching neuropathy early.",
    guideline: "ADA Standards of Care",
    intervalMonths: 12,
    category: "exam",
    applies: (c) => c.conditions.includes("diabetes_t2") || c.conditions.includes("diabetes_t1"),
    because: () => "annual foot screening is recommended with diabetes",
  },
  {
    id: "urine_acr",
    title: "Urine albumin-to-creatinine ratio",
    detail: "Albumin in urine is the earliest sign of diabetic kidney disease, well before eGFR falls.",
    guideline: "ADA Standards of Care · KDIGO",
    intervalMonths: 12,
    category: "lab",
    applies: (c) => c.conditions.includes("diabetes_t2") || c.conditions.includes("diabetes_t1") || c.conditions.includes("hypertension"),
    because: () => "diabetes or hypertension on your record",
  },
  {
    id: "colorectal_screening",
    title: "Colorectal cancer screening",
    detail: "Screening begins at 45. Colonoscopy repeats every ten years; stool-based tests repeat annually or every three years.",
    guideline: "USPSTF (2021)",
    intervalMonths: 120,
    category: "screening",
    applies: (c) => c.age != null && c.age >= 45 && c.age <= 75,
    because: (c) => `screening is recommended from age 45 to 75, and you are ${c.age}`,
  },
  {
    id: "mammogram",
    title: "Mammogram",
    detail: "Biennial screening mammography for women aged 40 to 74.",
    guideline: "USPSTF (2024)",
    intervalMonths: 24,
    category: "screening",
    applies: (c) => c.sexAtBirth === "female" && c.age != null && c.age >= 40 && c.age <= 74,
    because: () => "biennial screening is recommended for women aged 40–74",
  },
  {
    id: "cervical_screening",
    title: "Cervical cancer screening",
    detail: "Cytology every three years, or HPV testing every five years, from 21 to 65.",
    guideline: "USPSTF",
    intervalMonths: 36,
    category: "screening",
    applies: (c) => c.sexAtBirth === "female" && c.age != null && c.age >= 21 && c.age <= 65,
    because: () => "screening is recommended from age 21 to 65",
  },
  {
    id: "osteoporosis",
    title: "Bone density scan (DEXA)",
    detail: "Screening for osteoporosis in women aged 65 and over.",
    guideline: "USPSTF",
    intervalMonths: 24,
    category: "screening",
    applies: (c) => c.sexAtBirth === "female" && c.age != null && c.age >= 65,
    because: () => "screening is recommended for women aged 65 and over",
  },
  {
    id: "prostate_discussion",
    title: "Prostate screening discussion",
    detail: "Whether to test PSA is a shared decision between 55 and 69 — the benefit is real but small, and so are the harms of over-treatment.",
    guideline: "USPSTF (shared decision-making)",
    intervalMonths: 12,
    category: "screening",
    applies: (c) => c.sexAtBirth === "male" && c.age != null && c.age >= 55 && c.age <= 69,
    because: () => "shared decision-making is recommended for men aged 55–69",
  },
  {
    id: "lung_ct",
    title: "Low-dose CT for lung cancer",
    detail: "Annual low-dose CT for adults 50–80 with a 20 pack-year history who smoke now or quit within 15 years.",
    guideline: "USPSTF (2021)",
    intervalMonths: 12,
    category: "screening",
    applies: (c) => c.smoker && c.age != null && c.age >= 50 && c.age <= 80,
    because: () => "a smoking history in the eligible age range",
  },
  {
    id: "diabetes_screening",
    title: "Screening for prediabetes and diabetes",
    detail: "Adults 35 to 70 who are overweight are screened every three years.",
    guideline: "USPSTF (2021)",
    intervalMonths: 36,
    category: "lab",
    applies: (c) =>
      !c.conditions.includes("diabetes_t2") &&
      !c.conditions.includes("diabetes_t1") &&
      c.age != null && c.age >= 35 && c.age <= 70 &&
      (c.bmi == null || c.bmi >= 25),
    because: () => "adults aged 35–70 with a raised BMI are screened",
    satisfiedByMetrics: ["hba1c", "glucose_fasting"],
  },
  {
    id: "hepatitis_c",
    title: "Hepatitis C screening",
    detail: "A one-time test for all adults aged 18 to 79.",
    guideline: "USPSTF (2020)",
    intervalMonths: 1200,
    once: true,
    category: "lab",
    applies: (c) => c.age != null && c.age >= 18 && c.age <= 79,
    because: () => "a one-time test is recommended for all adults 18–79",
  },
  {
    id: "influenza_vaccine",
    title: "Influenza vaccine",
    detail: "Annual vaccination, ideally before the local season starts.",
    guideline: "CDC · ACIP",
    intervalMonths: 12,
    category: "immunisation",
    applies: (c) => c.age != null && c.age >= 6,
    because: () => "annual vaccination is recommended for everyone over six months",
  },
  {
    id: "tdap_booster",
    title: "Tetanus booster (Td/Tdap)",
    detail: "A booster every ten years after the primary series.",
    guideline: "CDC · ACIP",
    intervalMonths: 120,
    category: "immunisation",
    applies: (c) => c.age != null && c.age >= 19,
    because: () => "a booster is recommended every ten years",
  },
  {
    id: "shingles_vaccine",
    title: "Shingles vaccine",
    detail: "Two doses of recombinant zoster vaccine from age 50.",
    guideline: "CDC · ACIP",
    intervalMonths: 1200,
    once: true,
    category: "immunisation",
    applies: (c) => c.age != null && c.age >= 50,
    because: () => "vaccination is recommended from age 50",
  },
];

export type GapStatus = "overdue" | "due_soon" | "up_to_date" | "never_done";

export type CareGap = {
  rule: CareRule;
  status: GapStatus;
  lastDoneAt: Date | null;
  dueAt: Date | null;
  daysUntilDue: number | null;
  monthsOverdue: number | null;
  because: string;
  evidence: string | null;
};

const DUE_SOON_DAYS = 30;

function humanDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "every 12 months", "every 10 years", "once in a lifetime". */
export function intervalLabel(rule: CareRule): string {
  if (rule.once) return "once in a lifetime";
  if (rule.intervalMonths % 12 === 0) {
    const years = rule.intervalMonths / 12;
    return `every ${years === 1 ? "year" : `${years} years`}`;
  }
  return `every ${rule.intervalMonths} months`;
}

export async function evaluateCareGaps(ctx: Ctx): Promise<CareGap[]> {
  const satisfyingMetrics = [...new Set(CARE_RULES.flatMap((rule) => rule.satisfiedByMetrics ?? []))];

  const [profile, conditions, evidenceRows, states] = await Promise.all([
    getProfile(ctx),
    getConditions(ctx),
    // Any observation counts as the screening having happened, whatever its
    // kind — a blood-pressure check is a vital, not a lab.
    db.observation.findMany({
      where: { userId: ctx.user.id, metric: { in: satisfyingMetrics } },
      orderBy: { effectiveAt: "desc" },
      distinct: ["metric"],
    }),
    db.careGapState.findMany({ where: { userId: ctx.user.id } }),
  ]);

  const activeTags = conditions.filter((c) => c.active).map((c) => c.tag);
  const weight = await db.observation.findFirst({
    where: { userId: ctx.user.id, metric: "weight" },
    orderBy: { effectiveAt: "desc" },
  });
  let bmi: number | null = null;
  if (weight && profile.heightCm) {
    const kg = Number(openText(ctx.dek, weight.valueEnc));
    const m = profile.heightCm / 100;
    bmi = kg / (m * m);
  }

  const ruleCtx: RuleContext = {
    age: ageFrom(profile.dob),
    sexAtBirth: profile.sexAtBirth,
    conditions: activeTags,
    smoker: profile.lifestyle?.smoking === "current" || profile.lifestyle?.smoking === "former",
    bmi,
  };

  const gaps: CareGap[] = [];
  for (const rule of CARE_RULES) {
    if (!rule.applies(ruleCtx)) continue;
    const state = states.find((s) => s.ruleId === rule.id);
    if (state?.dismissed) continue;

    let lastDoneAt: Date | null = state?.lastDoneAt ?? null;
    let evidence: string | null = lastDoneAt ? `Recorded as done on ${humanDate(lastDoneAt)}` : null;

    if (rule.satisfiedByMetrics?.length) {
      const matching = evidenceRows
        .filter((row) => rule.satisfiedByMetrics!.includes(row.metric))
        .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0];
      if (matching && (!lastDoneAt || matching.effectiveAt > lastDoneAt)) {
        lastDoneAt = matching.effectiveAt;
        const value = openText(ctx.dek, matching.valueEnc);
        evidence = `${metricLabel(matching.metric)} ${value}${matching.unit ? ` ${matching.unit}` : ""} on ${humanDate(matching.effectiveAt)}`;
      }
    }

    const dueAt = lastDoneAt
      ? new Date(new Date(lastDoneAt).setMonth(lastDoneAt.getMonth() + rule.intervalMonths))
      : null;
    const now = Date.now();
    const daysUntilDue = dueAt ? Math.round((dueAt.getTime() - now) / 86_400_000) : null;

    let status: GapStatus;
    if (!lastDoneAt) status = "never_done";
    else if (daysUntilDue! < 0) status = "overdue";
    else if (daysUntilDue! <= DUE_SOON_DAYS) status = "due_soon";
    else status = "up_to_date";

    if (rule.once && lastDoneAt) status = "up_to_date";

    gaps.push({
      rule,
      status,
      lastDoneAt,
      dueAt,
      daysUntilDue,
      monthsOverdue: daysUntilDue != null && daysUntilDue < 0 ? Math.floor(-daysUntilDue / 30) : null,
      because: rule.because(ruleCtx),
      evidence,
    });
  }

  const order: Record<GapStatus, number> = { overdue: 0, never_done: 1, due_soon: 2, up_to_date: 3 };
  return gaps.sort((a, b) => order[a.status] - order[b.status] || (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));
}

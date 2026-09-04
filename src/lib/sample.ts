import "server-only";
import { db } from "./db";
import { sealJson, sealText } from "./crypto";
import { writeObservation, type Ctx } from "./record";
import { matchCondition } from "./conditions";
import type { AllergyData, ConditionData, MedicationData, ProfileData } from "./types";

/**
 * A realistic sample record, so every screen has something in it before you
 * decide whether to trust the app with your own labs. `npm run wipe` clears it.
 *
 * The numbers are constructed, not copied from a real person, and they carry a
 * deliberate story: fasting glucose drifting up over the last week alongside
 * short sleep, vitamin D stubbornly low on supplementation, and an eye exam
 * that has quietly gone overdue.
 */

const DAY = 86_400_000;

/** Deterministic pseudo-random so a reseed produces the same record. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

export async function loadSampleRecord(ctx: Ctx): Promise<{ observations: number }> {
  const random = rng(20260826);
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const dayAt = (daysAgo: number, hour = 7) => {
    const date = new Date(today.getTime() - daysAgo * DAY);
    date.setHours(hour, Math.floor(random() * 50), 0, 0);
    return date;
  };

  /* profile */
  const profile: ProfileData = {
    displayName: "Sample Record",
    dob: "1974-03-12",
    sexAtBirth: "male",
    heightCm: 175,
    bloodType: "O+",
    ancestry: "South Asian",
    lifestyle: { smoking: "never", alcohol: "occasional", diet: "Vegetarian", activityPerWeek: 3, occupation: "Software" },
    goals: { hba1c: 6.0, sleepHours: 7.5, steps: 10000, weightKg: 72, notes: "Keep A1c controlled without adding another medication." },
    familyHistory: [
      { relation: "Father", conditions: ["Type 2 diabetes", "Heart disease"], ageAtOnset: 58 },
      { relation: "Mother", conditions: ["High blood pressure"], ageAtOnset: 62 },
      { relation: "Sister", conditions: ["Thyroid disease"], ageAtOnset: 41 },
    ],
  };
  await db.profile.upsert({
    where: { userId: ctx.user.id },
    create: { userId: ctx.user.id, dataEnc: sealJson(ctx.dek, profile) },
    update: { dataEnc: sealJson(ctx.dek, profile) },
  });

  /* conditions */
  for (const [name, yearsAgo] of [["Type 2 diabetes", 7], ["Hypertension", 4]] as const) {
    const matched = matchCondition(name)!;
    await db.condition.create({
      data: {
        userId: ctx.user.id,
        dataEnc: sealJson(ctx.dek, { name: matched.name, icd10: matched.icd10 } satisfies ConditionData),
        tag: matched.tag,
        onsetAt: new Date(today.getFullYear() - yearsAgo, 4, 1),
      },
    });
  }

  /* allergy */
  await db.allergy.create({
    data: {
      userId: ctx.user.id,
      severity: "severe",
      dataEnc: sealJson(ctx.dek, {
        substance: "Sulfa drugs",
        reaction: "Widespread rash",
        severity: "severe",
        notedAt: "2016-08-01",
      } satisfies AllergyData),
    },
  });

  /* medications and their dose history */
  const meds: Array<MedicationData & { adherence: number }> = [
    { name: "Metformin", dose: "1000 mg", schedule: ["08:00", "20:00"], quantityRemaining: 48, purpose: "Type 2 diabetes", adherence: 0.98 },
    { name: "Telmisartan", dose: "40 mg", schedule: ["08:00"], quantityRemaining: 6, purpose: "Blood pressure", adherence: 0.96 },
    { name: "Vitamin D3", dose: "2000 IU", schedule: ["08:00"], quantityRemaining: 55, purpose: "Low vitamin D", adherence: 0.88 },
  ];

  for (const med of meds) {
    const { adherence, ...data } = med;
    const created = await db.medication.create({
      data: {
        userId: ctx.user.id,
        dataEnc: sealJson(ctx.dek, data),
        active: true,
        startedAt: new Date(today.getTime() - 400 * DAY),
      },
    });
    for (let daysAgo = 30; daysAgo >= 0; daysAgo -= 1) {
      for (const time of data.schedule) {
        const [hour, minute] = time.split(":").map(Number);
        const scheduledAt = new Date(today.getTime() - daysAgo * DAY);
        scheduledAt.setHours(hour, minute, 0, 0);
        if (scheduledAt > new Date()) continue;
        const taken = random() < adherence;
        await db.doseEvent.create({
          data: {
            userId: ctx.user.id,
            medicationId: created.id,
            scheduledAt,
            takenAt: taken ? new Date(scheduledAt.getTime() + 1000 * 60 * Math.floor(random() * 40)) : null,
            status: taken ? "taken" : "missed",
          },
        });
      }
    }
  }

  /* daily wearables and vitals */
  let observations = 0;
  let weight = 76.4;

  for (let daysAgo = 180; daysAgo >= 0; daysAgo -= 1) {
    const weekday = new Date(today.getTime() - daysAgo * DAY).getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // The last four days: short nights, and fasting glucose follows them up.
    const shortNights = daysAgo <= 3;
    const sleep = shortNights ? 6.0 + random() * 0.7 : 6.9 + random() * 1.3;
    const steps = Math.round((isWeekend ? 5200 : 7600) + random() * 3800 - daysAgo * 2);
    const restingHr = Math.round(56 + random() * 6 + (shortNights ? 3 : 0));
    const hrv = Math.round(42 + random() * 14 - (shortNights ? 7 : 0));

    await writeObservation(ctx, { kind: "wearable", metric: "sleep_duration", value: round(sleep, 2), effectiveAt: dayAt(daysAgo, 8), source: "apple_health" });
    await writeObservation(ctx, { kind: "wearable", metric: "steps", value: Math.max(steps, 900), effectiveAt: dayAt(daysAgo, 21), source: "apple_health" });
    await writeObservation(ctx, { kind: "wearable", metric: "resting_hr", value: restingHr, effectiveAt: dayAt(daysAgo, 6), source: "apple_health" });
    await writeObservation(ctx, { kind: "wearable", metric: "hrv", value: hrv, effectiveAt: dayAt(daysAgo, 6), source: "fitbit" });
    observations += 4;

    // Fasting glucose most mornings, drifting up over the last four days.
    if (daysAgo % 1 === 0 && random() < 0.85) {
      const base = 100 + (180 - daysAgo) * 0.012;
      const bump = shortNights ? 8 + random() * 5 : 0;
      await writeObservation(ctx, {
        kind: "vital",
        metric: "glucose_fasting",
        value: Math.round(base + bump + random() * 7 - 3),
        effectiveAt: dayAt(daysAgo, 6),
        note: "Fasting, before breakfast",
        source: "manual",
      });
      observations += 1;
    }

    // Blood pressure a few times a week.
    if (random() < 0.45) {
      const systolic = Math.round(126 + random() * 10 - 4);
      await writeObservation(ctx, { kind: "vital", metric: "bp_systolic", value: systolic, effectiveAt: dayAt(daysAgo, 7), source: "manual" });
      await writeObservation(ctx, { kind: "vital", metric: "bp_diastolic", value: Math.round(80 + random() * 7 - 3), effectiveAt: dayAt(daysAgo, 7), source: "manual" });
      await writeObservation(ctx, { kind: "vital", metric: "pulse", value: Math.round(64 + random() * 10 - 4), effectiveAt: dayAt(daysAgo, 7), source: "manual" });
      observations += 3;
    }

    // Weight weekly, drifting slowly down.
    if (daysAgo % 7 === 0) {
      weight -= 0.09 + random() * 0.05;
      await writeObservation(ctx, { kind: "vital", metric: "weight", value: round(weight, 1), effectiveAt: dayAt(daysAgo, 7), source: "apple_health" });
      observations += 1;
    }

    // Nutrition on the days it was logged.
    if (random() < 0.55) {
      await writeObservation(ctx, { kind: "nutrition", metric: "carbs", value: Math.round(180 + random() * 90 + (shortNights ? 40 : 0)), effectiveAt: dayAt(daysAgo, 21), source: "myfitnesspal" });
      await writeObservation(ctx, { kind: "nutrition", metric: "calories", value: Math.round(1950 + random() * 450), effectiveAt: dayAt(daysAgo, 21), source: "myfitnesspal" });
      observations += 2;
    }
  }

  /* three lab panels */
  const panels: Array<{ daysAgo: number; name: string; lab: string; results: Array<[string, number, number | null, number | null]> }> = [
    {
      daysAgo: 14,
      name: "Comprehensive metabolic panel",
      lab: "Apollo Diagnostics",
      results: [
        ["hba1c", 6.1, 4.0, 5.6],
        ["glucose_fasting", 106, 70, 99],
        ["ldl", 118, null, 100],
        ["hdl", 44, 40, null],
        ["cholesterol_total", 192, null, 200],
        ["triglycerides", 128, null, 150],
        ["creatinine", 0.9, 0.7, 1.3],
        ["egfr", 92, 60, null],
        ["alt", 28, 7, 56],
        ["ast", 24, 10, 40],
        ["sodium", 139, 135, 145],
        ["potassium", 4.2, 3.5, 5.1],
        ["vitamin_d", 24, 30, 100],
        ["tsh", 2.1, 0.4, 4.0],
      ],
    },
    {
      daysAgo: 106,
      name: "Diabetes review panel",
      lab: "Apollo Diagnostics",
      results: [
        ["hba1c", 6.4, 4.0, 5.6],
        ["glucose_fasting", 112, 70, 99],
        ["ldl", 124, null, 100],
        ["hdl", 42, 40, null],
        ["triglycerides", 146, null, 150],
        ["creatinine", 0.92, 0.7, 1.3],
        ["egfr", 90, 60, null],
        ["vitamin_d", 27, 30, 100],
      ],
    },
    {
      daysAgo: 196,
      name: "Annual health check",
      lab: "Metropolis Labs",
      results: [
        ["hba1c", 6.6, 4.0, 5.6],
        ["glucose_fasting", 118, 70, 99],
        ["ldl", 131, null, 100],
        ["hdl", 41, 40, null],
        ["cholesterol_total", 205, null, 200],
        ["triglycerides", 158, null, 150],
        ["vitamin_d", 31, 30, 100],
        ["hemoglobin", 14.6, 13.0, 17.0],
        ["ferritin", 96, 24, 336],
        ["vitamin_b12", 318, 200, 900],
      ],
    },
  ];

  for (const panel of panels) {
    const collectedAt = dayAt(panel.daysAgo, 8);
    const created = await db.panel.create({
      data: {
        userId: ctx.user.id,
        nameEnc: sealText(ctx.dek, panel.name),
        labEnc: sealText(ctx.dek, panel.lab),
        collectedAt,
        source: "document",
      },
    });
    for (const [metricKey, value, refLow, refHigh] of panel.results) {
      await writeObservation(ctx, {
        kind: "lab",
        metric: metricKey,
        value,
        effectiveAt: collectedAt,
        refLow,
        refHigh,
        source: "document",
        panelId: created.id,
      });
      observations += 1;
    }
  }

  /* documents, with the text that backs the panels above */
  const documents = [
    {
      name: "Lab_Report_metabolic_panel.pdf",
      daysAgo: 14,
      kind: "lab_report",
      text: `APOLLO DIAGNOSTICS — COMPREHENSIVE METABOLIC PANEL
Collected: ${new Date(today.getTime() - 14 * DAY).toISOString().slice(0, 10)}   Fasting: Yes

HbA1c                       6.1 %        4.0 - 5.6
Fasting glucose             106 mg/dL    70 - 99
LDL cholesterol             118 mg/dL    < 100
HDL cholesterol             44 mg/dL     > 40
Total cholesterol           192 mg/dL    < 200
Triglycerides               128 mg/dL    < 150
Creatinine                  0.9 mg/dL    0.7 - 1.3
eGFR                        92           > 60
ALT (SGPT)                  28 U/L       7 - 56
AST (SGOT)                  24 U/L       10 - 40
Sodium                      139 mmol/L   135 - 145
Potassium                   4.2 mmol/L   3.5 - 5.1
Vitamin D (25-OH)           24.0 ng/mL   30 - 100
TSH                         2.1 mIU/L    0.4 - 4.0

Comment: Vitamin D remains below the reference interval despite supplementation.
Glycaemic control improved compared with the previous panel.`,
    },
    {
      name: "Endocrinology_visit_note.pdf",
      daysAgo: 22,
      kind: "discharge",
      text: `ENDOCRINOLOGY FOLLOW-UP — CLINIC NOTE

Reason for visit: routine diabetes review.

Assessment: Type 2 diabetes, reasonably controlled. Hypertension stable on telmisartan 40 mg.
Vitamin D deficiency, on 2000 IU daily since March, not yet corrected.

Plan:
- Continue metformin 1000 mg twice daily.
- Continue telmisartan 40 mg each morning.
- Repeat HbA1c and lipid panel in three months.
- Dilated retinal examination is overdue — referral given today.
- Continue vitamin D 2000 IU; recheck level with next panel.`,
    },
    {
      name: "Eye_exam_report_2025.jpg",
      daysAgo: 438,
      kind: "other",
      text: `DILATED RETINAL EXAMINATION

Right eye: no diabetic retinopathy. Left eye: no diabetic retinopathy.
Macula normal both eyes. Intraocular pressure within normal limits.
Recommend repeat examination in 12 months.`,
    },
  ];

  for (const doc of documents) {
    await db.document.create({
      data: {
        userId: ctx.user.id,
        filenameEnc: sealText(ctx.dek, doc.name),
        mime: doc.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        sizeBytes: doc.text.length * 12,
        storageKey: `sample/${doc.name}`,
        status: "confirmed",
        kind: doc.kind,
        pages: 1,
        textEnc: sealText(ctx.dek, doc.text),
        uploadedAt: dayAt(doc.daysAgo, 10),
        processedAt: dayAt(doc.daysAgo, 10),
      },
    });
  }

  /* connected sources, so the sources screen is not empty */
  for (const source of [
    { provider: "apple_health", label: "Apple Health", status: "connected", days: 0 },
    { provider: "fitbit", label: "Fitbit", status: "connected", days: 0 },
    { provider: "myfitnesspal", label: "MyFitnessPal", status: "expired", days: 21 },
  ]) {
    await db.connection.create({
      data: {
        userId: ctx.user.id,
        provider: source.provider,
        label: source.label,
        status: source.status,
        lastSyncAt: new Date(today.getTime() - source.days * DAY),
      },
    });
  }

  /* an eye exam that has gone overdue, recorded as done 14 months ago */
  await db.careGapState.upsert({
    where: { userId_ruleId: { userId: ctx.user.id, ruleId: "diabetic_eye_exam" } },
    create: { userId: ctx.user.id, ruleId: "diabetic_eye_exam", lastDoneAt: new Date(today.getTime() - 438 * DAY) },
    update: { lastDoneAt: new Date(today.getTime() - 438 * DAY) },
  });
  await db.careGapState.upsert({
    where: { userId_ruleId: { userId: ctx.user.id, ruleId: "influenza_vaccine" } },
    create: { userId: ctx.user.id, ruleId: "influenza_vaccine", lastDoneAt: new Date(today.getTime() - 320 * DAY) },
    update: { lastDoneAt: new Date(today.getTime() - 320 * DAY) },
  });

  return { observations };
}

export async function wipeRecord(userId: string): Promise<void> {
  await db.$transaction([
    db.observation.deleteMany({ where: { userId } }),
    db.panel.deleteMany({ where: { userId } }),
    db.doseEvent.deleteMany({ where: { userId } }),
    db.medication.deleteMany({ where: { userId } }),
    db.condition.deleteMany({ where: { userId } }),
    db.allergy.deleteMany({ where: { userId } }),
    db.document.deleteMany({ where: { userId } }),
    db.message.deleteMany({ where: { conversation: { userId } } }),
    db.conversation.deleteMany({ where: { userId } }),
    db.connection.deleteMany({ where: { userId } }),
    db.shareLink.deleteMany({ where: { userId } }),
    db.careGapState.deleteMany({ where: { userId } }),
    db.dailyRead.deleteMany({ where: { userId } }),
    db.profile.deleteMany({ where: { userId } }),
  ]);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

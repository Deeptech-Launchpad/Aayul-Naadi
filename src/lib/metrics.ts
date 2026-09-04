/**
 * The metric catalogue.
 *
 * Reference intervals here are the population defaults used when a result
 * arrives without its own range. A range that came from your lab always wins,
 * and a condition-adjusted target (see `targetFor`) is shown alongside — never
 * instead of — the population range.
 */

export type MetricCategory = "lab" | "vital" | "wearable" | "nutrition";

export type MetricDef = {
  key: string;
  label: string;
  short?: string;
  unit: string;
  category: MetricCategory;
  decimals: number;
  refLow?: number;
  refHigh?: number;
  /** Direction that counts as better when there is no upper bound worth flagging. */
  direction?: "lower" | "higher" | "band";
  loinc?: string;
  /** Aliases seen on lab reports, used to normalise extracted markers. */
  aliases?: string[];
};

export const METRICS: MetricDef[] = [
  // ── labs ────────────────────────────────────────────────────────────────
  { key: "hba1c", label: "HbA1c", unit: "%", category: "lab", decimals: 1, refLow: 4.0, refHigh: 5.6, direction: "lower", loinc: "4548-4", aliases: ["a1c", "glycated hemoglobin", "glycosylated hemoglobin", "hemoglobin a1c"] },
  { key: "glucose_fasting", label: "Fasting glucose", unit: "mg/dL", category: "lab", decimals: 0, refLow: 70, refHigh: 99, direction: "band", loinc: "1558-6", aliases: ["fasting blood sugar", "fbs", "glucose fasting", "fasting plasma glucose"] },
  { key: "glucose_random", label: "Random glucose", unit: "mg/dL", category: "vital", decimals: 0, refLow: 70, refHigh: 140, direction: "band", aliases: ["rbs", "random blood sugar", "postprandial glucose", "ppbs"] },
  { key: "ldl", label: "LDL cholesterol", unit: "mg/dL", category: "lab", decimals: 0, refHigh: 100, direction: "lower", loinc: "13457-7", aliases: ["ldl cholesterol", "ldl-c", "low density lipoprotein"] },
  { key: "hdl", label: "HDL cholesterol", unit: "mg/dL", category: "lab", decimals: 0, refLow: 40, direction: "higher", loinc: "2085-9", aliases: ["hdl cholesterol", "hdl-c", "high density lipoprotein"] },
  { key: "cholesterol_total", label: "Total cholesterol", unit: "mg/dL", category: "lab", decimals: 0, refHigh: 200, direction: "lower", loinc: "2093-3", aliases: ["total cholesterol", "cholesterol"] },
  { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", category: "lab", decimals: 0, refHigh: 150, direction: "lower", loinc: "2571-8", aliases: ["tg", "triglyceride"] },
  { key: "creatinine", label: "Creatinine", unit: "mg/dL", category: "lab", decimals: 2, refLow: 0.7, refHigh: 1.3, direction: "band", loinc: "2160-0", aliases: ["serum creatinine"] },
  { key: "egfr", label: "eGFR", unit: "mL/min/1.73m²", category: "lab", decimals: 0, refLow: 60, direction: "higher", loinc: "33914-3", aliases: ["gfr", "estimated gfr"] },
  { key: "urea", label: "Blood urea nitrogen", unit: "mg/dL", category: "lab", decimals: 0, refLow: 7, refHigh: 20, direction: "band", aliases: ["bun", "urea", "blood urea"] },
  { key: "alt", label: "ALT", unit: "U/L", category: "lab", decimals: 0, refLow: 7, refHigh: 56, direction: "band", loinc: "1742-6", aliases: ["sgpt", "alanine aminotransferase"] },
  { key: "ast", label: "AST", unit: "U/L", category: "lab", decimals: 0, refLow: 10, refHigh: 40, direction: "band", loinc: "1920-8", aliases: ["sgot", "aspartate aminotransferase"] },
  { key: "alkaline_phosphatase", label: "Alkaline phosphatase", unit: "U/L", category: "lab", decimals: 0, refLow: 44, refHigh: 147, direction: "band", aliases: ["alp"] },
  { key: "bilirubin_total", label: "Total bilirubin", unit: "mg/dL", category: "lab", decimals: 2, refLow: 0.1, refHigh: 1.2, direction: "band", aliases: ["bilirubin"] },
  { key: "albumin", label: "Albumin", unit: "g/dL", category: "lab", decimals: 1, refLow: 3.5, refHigh: 5.0, direction: "band", aliases: ["serum albumin"] },
  { key: "tsh", label: "TSH", unit: "mIU/L", category: "lab", decimals: 2, refLow: 0.4, refHigh: 4.0, direction: "band", loinc: "3016-3", aliases: ["thyroid stimulating hormone", "thyrotropin"] },
  { key: "t4_free", label: "Free T4", unit: "ng/dL", category: "lab", decimals: 2, refLow: 0.8, refHigh: 1.8, direction: "band", aliases: ["ft4", "free thyroxine"] },
  { key: "vitamin_d", label: "Vitamin D, 25-OH", unit: "ng/mL", category: "lab", decimals: 1, refLow: 30, refHigh: 100, direction: "band", loinc: "1989-3", aliases: ["25-oh vitamin d", "vitamin d 25 hydroxy", "25 hydroxyvitamin d", "vit d"] },
  { key: "vitamin_b12", label: "Vitamin B12", unit: "pg/mL", category: "lab", decimals: 0, refLow: 200, refHigh: 900, direction: "band", aliases: ["b12", "cobalamin"] },
  { key: "ferritin", label: "Ferritin", unit: "ng/mL", category: "lab", decimals: 0, refLow: 24, refHigh: 336, direction: "band", aliases: ["serum ferritin"] },
  { key: "hemoglobin", label: "Haemoglobin", unit: "g/dL", category: "lab", decimals: 1, refLow: 13.0, refHigh: 17.0, direction: "band", loinc: "718-7", aliases: ["hb", "hgb", "haemoglobin", "hemoglobin"] },
  { key: "wbc", label: "White cell count", unit: "10³/µL", category: "lab", decimals: 1, refLow: 4.0, refHigh: 11.0, direction: "band", aliases: ["wbc", "leukocytes", "total leucocyte count", "tlc"] },
  { key: "platelets", label: "Platelets", unit: "10³/µL", category: "lab", decimals: 0, refLow: 150, refHigh: 450, direction: "band", aliases: ["platelet count", "plt"] },
  { key: "sodium", label: "Sodium", unit: "mmol/L", category: "lab", decimals: 0, refLow: 135, refHigh: 145, direction: "band", aliases: ["na", "serum sodium"] },
  { key: "potassium", label: "Potassium", unit: "mmol/L", category: "lab", decimals: 1, refLow: 3.5, refHigh: 5.1, direction: "band", aliases: ["k", "serum potassium"] },
  { key: "calcium", label: "Calcium", unit: "mg/dL", category: "lab", decimals: 1, refLow: 8.6, refHigh: 10.2, direction: "band", aliases: ["serum calcium"] },
  { key: "uric_acid", label: "Uric acid", unit: "mg/dL", category: "lab", decimals: 1, refLow: 3.4, refHigh: 7.0, direction: "band", aliases: ["urate"] },
  { key: "crp", label: "C-reactive protein", unit: "mg/L", category: "lab", decimals: 1, refHigh: 3.0, direction: "lower", aliases: ["hs-crp", "crp"] },

  // ── vitals ──────────────────────────────────────────────────────────────
  { key: "bp_systolic", label: "Systolic blood pressure", short: "Systolic", unit: "mmHg", category: "vital", decimals: 0, refLow: 90, refHigh: 120, direction: "band", loinc: "8480-6", aliases: ["systolic"] },
  { key: "bp_diastolic", label: "Diastolic blood pressure", short: "Diastolic", unit: "mmHg", category: "vital", decimals: 0, refLow: 60, refHigh: 80, direction: "band", loinc: "8462-4", aliases: ["diastolic"] },
  { key: "pulse", label: "Pulse", unit: "bpm", category: "vital", decimals: 0, refLow: 50, refHigh: 100, direction: "band", aliases: ["heart rate"] },
  { key: "weight", label: "Weight", unit: "kg", category: "vital", decimals: 1, direction: "band", aliases: ["body weight"] },
  { key: "temperature", label: "Temperature", unit: "°C", category: "vital", decimals: 1, refLow: 36.1, refHigh: 37.5, direction: "band" },
  { key: "spo2", label: "Blood oxygen", unit: "%", category: "vital", decimals: 0, refLow: 95, refHigh: 100, direction: "higher", aliases: ["oxygen saturation", "spo2"] },
  { key: "waist", label: "Waist circumference", unit: "cm", category: "vital", decimals: 0, direction: "lower" },

  // ── wearables ───────────────────────────────────────────────────────────
  { key: "steps", label: "Steps", unit: "steps", category: "wearable", decimals: 0, direction: "higher" },
  { key: "sleep_duration", label: "Sleep", unit: "h", category: "wearable", decimals: 2, refLow: 7, refHigh: 9, direction: "band" },
  { key: "sleep_deep", label: "Deep sleep", unit: "h", category: "wearable", decimals: 2, direction: "higher" },
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", category: "wearable", decimals: 0, refLow: 50, refHigh: 70, direction: "lower" },
  { key: "hrv", label: "Heart rate variability", unit: "ms", category: "wearable", decimals: 0, direction: "higher" },
  { key: "active_energy", label: "Active energy", unit: "kcal", category: "wearable", decimals: 0, direction: "higher" },
  { key: "exercise_minutes", label: "Exercise", unit: "min", category: "wearable", decimals: 0, direction: "higher" },

  // ── nutrition ───────────────────────────────────────────────────────────
  { key: "calories", label: "Energy intake", unit: "kcal", category: "nutrition", decimals: 0, direction: "band" },
  { key: "carbs", label: "Carbohydrate", unit: "g", category: "nutrition", decimals: 0, direction: "band" },
  { key: "protein", label: "Protein", unit: "g", category: "nutrition", decimals: 0, direction: "higher" },
  { key: "fat", label: "Fat", unit: "g", category: "nutrition", decimals: 0, direction: "band" },
  { key: "fiber", label: "Fibre", unit: "g", category: "nutrition", decimals: 0, direction: "higher" },
  { key: "water", label: "Water", unit: "mL", category: "nutrition", decimals: 0, direction: "higher" },
];

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function metric(key: string): MetricDef {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      unit: "",
      category: "lab" as MetricCategory,
      decimals: 1,
    }
  );
}

export function metricLabel(key: string): string {
  const m = metric(key);
  return m.short ?? m.label;
}

/** Match a marker name from a lab report onto a catalogue key. */
export function normaliseMarkerName(raw: string): string | null {
  const text = raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const m of METRICS) {
    if (m.key === text.replace(/ /g, "_")) return m.key;
    if (m.label.toLowerCase() === text) return m.key;
    if (m.aliases?.some((a) => a === text)) return m.key;
  }
  for (const m of METRICS) {
    if (m.aliases?.some((a) => text.includes(a))) return m.key;
    if (text.includes(m.label.toLowerCase())) return m.key;
  }
  return null;
}

/* ── status ────────────────────────────────────────────────────────────── */

export type Status = "in_range" | "below" | "above" | "unknown";

export type Range = { low?: number | null; high?: number | null; source: string };

/**
 * The range that applies to a value: the lab's own interval if the result
 * carried one, otherwise the population default from the catalogue.
 */
export function rangeFor(
  metricKey: string,
  observed?: { refLow?: number | null; refHigh?: number | null },
): Range {
  if (observed && (observed.refLow != null || observed.refHigh != null)) {
    return { low: observed.refLow, high: observed.refHigh, source: "your lab's own reference interval" };
  }
  const m = metric(metricKey);
  return { low: m.refLow ?? null, high: m.refHigh ?? null, source: "the population reference range" };
}

export function statusFor(value: number, range: Range): Status {
  if (range.low == null && range.high == null) return "unknown";
  if (range.low != null && value < range.low) return "below";
  if (range.high != null && value > range.high) return "above";
  return "in_range";
}

/**
 * Condition-adjusted target. Shown next to — never in place of — the
 * population range, because they answer different questions.
 */
export function targetFor(
  metricKey: string,
  ctx: { conditions: string[]; age?: number | null },
): { low?: number; high?: number; label: string; because: string } | null {
  const has = (tag: string) => ctx.conditions.includes(tag);

  if (metricKey === "hba1c" && (has("diabetes_t2") || has("diabetes_t1"))) {
    return { high: 7.0, label: "under 7.0 %", because: "the usual glycaemic target with diabetes" };
  }
  if (metricKey === "ldl" && (has("diabetes_t2") || has("diabetes_t1"))) {
    return { high: 70, label: "under 70 mg/dL", because: "diabetes raises cardiovascular risk" };
  }
  if (metricKey === "ldl" && has("cad")) {
    return { high: 55, label: "under 55 mg/dL", because: "established coronary disease" };
  }
  if (metricKey === "bp_systolic" && (has("hypertension") || has("diabetes_t2"))) {
    return { high: 130, label: "under 130 mmHg", because: "your recorded conditions" };
  }
  if (metricKey === "bp_diastolic" && (has("hypertension") || has("diabetes_t2"))) {
    return { high: 80, label: "under 80 mmHg", because: "your recorded conditions" };
  }
  if (metricKey === "glucose_fasting" && (has("diabetes_t2") || has("diabetes_t1"))) {
    return { low: 80, high: 130, label: "80–130 mg/dL", because: "the usual fasting target with diabetes" };
  }
  return null;
}

/** "70–99", "< 100", "> 40" — never "–100". */
export function formatRange(range: { low?: number | null; high?: number | null }, unit?: string): string {
  const suffix = unit ? ` ${unit}` : "";
  if (range.low != null && range.high != null) return `${range.low}–${range.high}${suffix}`;
  if (range.high != null) return `< ${range.high}${suffix}`;
  if (range.low != null) return `> ${range.low}${suffix}`;
  return "no reference range";
}

export function formatValue(metricKey: string, value: number): string {
  const m = metric(metricKey);
  if (metricKey === "sleep_duration" || metricKey === "sleep_deep") {
    const totalMinutes = Math.round(Math.abs(value) * 60);
    const sign = value < 0 ? "-" : "";
    return `${sign}${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
  }
  if (m.decimals === 0 && Math.abs(value) >= 1000) return Math.round(value).toLocaleString("en-US");
  return value.toFixed(m.decimals);
}

/* ── unit conversion (display only; storage is always the catalogue unit) ─ */

export function toDisplay(metricKey: string, value: number, units: string): { value: number; unit: string } {
  const m = metric(metricKey);
  if (units !== "imperial") return { value, unit: m.unit };
  switch (metricKey) {
    case "weight":
      return { value: value * 2.20462, unit: "lb" };
    case "temperature":
      return { value: value * 1.8 + 32, unit: "°F" };
    case "waist":
      return { value: value / 2.54, unit: "in" };
    default:
      return { value, unit: m.unit };
  }
}

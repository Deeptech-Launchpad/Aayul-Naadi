/**
 * A small coded vocabulary so that what you type, what an EHR sends, and what
 * the care-gap rules look for all land on the same thing. `tag` is the coarse,
 * non-identifying key the rules match on.
 */

export type ConditionOption = { name: string; icd10: string; tag: string; aliases?: string[] };

export const CONDITION_OPTIONS: ConditionOption[] = [
  { name: "Type 2 diabetes", icd10: "E11.9", tag: "diabetes_t2", aliases: ["t2dm", "diabetes mellitus type 2", "type ii diabetes"] },
  { name: "Type 1 diabetes", icd10: "E10.9", tag: "diabetes_t1", aliases: ["t1dm", "type i diabetes"] },
  { name: "Prediabetes", icd10: "R73.03", tag: "prediabetes" },
  { name: "Hypertension", icd10: "I10", tag: "hypertension", aliases: ["high blood pressure", "htn"] },
  { name: "High cholesterol", icd10: "E78.5", tag: "hyperlipidemia", aliases: ["hyperlipidaemia", "dyslipidemia"] },
  { name: "Coronary artery disease", icd10: "I25.10", tag: "cad", aliases: ["heart disease", "ischaemic heart disease"] },
  { name: "Atrial fibrillation", icd10: "I48.91", tag: "afib" },
  { name: "Heart failure", icd10: "I50.9", tag: "heart_failure" },
  { name: "Chronic kidney disease", icd10: "N18.9", tag: "ckd" },
  { name: "Asthma", icd10: "J45.909", tag: "asthma" },
  { name: "COPD", icd10: "J44.9", tag: "copd" },
  { name: "Hypothyroidism", icd10: "E03.9", tag: "hypothyroid", aliases: ["underactive thyroid"] },
  { name: "Hyperthyroidism", icd10: "E05.90", tag: "hyperthyroid" },
  { name: "Obesity", icd10: "E66.9", tag: "obesity" },
  { name: "Fatty liver disease", icd10: "K76.0", tag: "nafld", aliases: ["nafld", "hepatic steatosis"] },
  { name: "Osteoarthritis", icd10: "M19.90", tag: "osteoarthritis", aliases: ["arthritis"] },
  { name: "Osteoporosis", icd10: "M81.0", tag: "osteoporosis" },
  { name: "Rheumatoid arthritis", icd10: "M06.9", tag: "rheumatoid" },
  { name: "Anxiety", icd10: "F41.9", tag: "anxiety" },
  { name: "Depression", icd10: "F32.9", tag: "depression" },
  { name: "Migraine", icd10: "G43.909", tag: "migraine" },
  { name: "Sleep apnoea", icd10: "G47.33", tag: "sleep_apnea", aliases: ["sleep apnea", "osa"] },
  { name: "GERD", icd10: "K21.9", tag: "gerd", aliases: ["acid reflux", "reflux"] },
  { name: "Anaemia", icd10: "D64.9", tag: "anemia", aliases: ["anemia"] },
  { name: "Vitamin D deficiency", icd10: "E55.9", tag: "vitamin_d_deficiency" },
  { name: "Gout", icd10: "M10.9", tag: "gout" },
  { name: "PCOS", icd10: "E28.2", tag: "pcos", aliases: ["polycystic ovary syndrome"] },
  { name: "Cancer (history)", icd10: "Z85.9", tag: "cancer_history" },
];

const FAMILY_CONDITIONS = [
  "Type 2 diabetes",
  "Heart disease",
  "Stroke",
  "High blood pressure",
  "Breast cancer",
  "Colorectal cancer",
  "Prostate cancer",
  "Ovarian cancer",
  "Lung cancer",
  "Alzheimer's disease",
  "Osteoporosis",
  "Thyroid disease",
  "Kidney disease",
  "Mental health condition",
];

export const FAMILY_RELATIONS = ["Mother", "Father", "Sister", "Brother", "Maternal grandparent", "Paternal grandparent", "Child"];
export { FAMILY_CONDITIONS };

export function matchCondition(input: string): ConditionOption | null {
  const text = input.toLowerCase().trim();
  return (
    CONDITION_OPTIONS.find((c) => c.name.toLowerCase() === text) ??
    CONDITION_OPTIONS.find((c) => c.aliases?.some((a) => a === text)) ??
    CONDITION_OPTIONS.find((c) => c.name.toLowerCase().includes(text) || c.aliases?.some((a) => text.includes(a))) ??
    null
  );
}

/** Common medications, used to offer sensible defaults when adding one. */
export const MEDICATION_SUGGESTIONS = [
  { name: "Metformin", dose: "500 mg", schedule: ["08:00", "20:00"], purpose: "Type 2 diabetes" },
  { name: "Telmisartan", dose: "40 mg", schedule: ["08:00"], purpose: "Blood pressure" },
  { name: "Amlodipine", dose: "5 mg", schedule: ["08:00"], purpose: "Blood pressure" },
  { name: "Atorvastatin", dose: "20 mg", schedule: ["21:00"], purpose: "Cholesterol" },
  { name: "Rosuvastatin", dose: "10 mg", schedule: ["21:00"], purpose: "Cholesterol" },
  { name: "Levothyroxine", dose: "50 mcg", schedule: ["06:30"], purpose: "Thyroid" },
  { name: "Vitamin D3", dose: "2000 IU", schedule: ["08:00"], purpose: "Vitamin D" },
  { name: "Aspirin", dose: "75 mg", schedule: ["08:00"], purpose: "Cardiovascular" },
  { name: "Omeprazole", dose: "20 mg", schedule: ["07:00"], purpose: "Reflux" },
  { name: "Losartan", dose: "50 mg", schedule: ["08:00"], purpose: "Blood pressure" },
];

export const COMMON_ALLERGENS = [
  "Penicillin",
  "Sulfa drugs",
  "Aspirin",
  "Ibuprofen",
  "Codeine",
  "Latex",
  "Peanuts",
  "Shellfish",
  "Iodinated contrast",
  "Cephalosporins",
];

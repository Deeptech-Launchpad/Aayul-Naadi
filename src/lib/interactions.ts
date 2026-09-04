/**
 * Medication safety checks.
 *
 * A deliberately small, transparent table rather than a model call: a drug
 * interaction is a fact to look up, not something to reason about. The table
 * covers the common pairs a personal record is likely to contain — it is not
 * exhaustive, and every screen that shows a result says so. A pharmacist and
 * your prescriber remain the authority.
 */

export type Severity = "info" | "caution" | "serious";

export type InteractionFinding = {
  severity: Severity;
  a: string;
  b: string;
  effect: string;
  advice: string;
};

export type AllergyFinding = {
  severity: Severity;
  medication: string;
  allergen: string;
  reason: string;
};

/** Ingredient class membership, used for both interactions and allergy matching. */
const CLASSES: Record<string, string[]> = {
  sulfonamide: ["sulfamethoxazole", "trimethoprim-sulfamethoxazole", "cotrimoxazole", "sulfasalazine", "sulfadiazine"],
  penicillin: ["amoxicillin", "ampicillin", "penicillin", "piperacillin", "amoxicillin-clavulanate", "co-amoxiclav"],
  cephalosporin: ["cephalexin", "cefuroxime", "ceftriaxone", "cefixime", "cefdinir"],
  nsaid: ["ibuprofen", "naproxen", "diclofenac", "aspirin", "indomethacin", "ketorolac", "celecoxib", "mefenamic acid"],
  statin: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
  ace_inhibitor: ["lisinopril", "ramipril", "enalapril", "perindopril", "captopril"],
  arb: ["telmisartan", "losartan", "valsartan", "olmesartan", "irbesartan", "candesartan"],
  ssri: ["sertraline", "fluoxetine", "escitalopram", "citalopram", "paroxetine"],
  macrolide: ["clarithromycin", "erythromycin", "azithromycin"],
  quinolone: ["ciprofloxacin", "levofloxacin", "moxifloxacin", "norfloxacin"],
  diuretic_k_sparing: ["spironolactone", "eplerenone", "amiloride", "triamterene"],
  metformin_class: ["metformin"],
  anticoagulant: ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "edoxaban"],
  ppi: ["omeprazole", "pantoprazole", "esomeprazole", "lansoprazole", "rabeprazole"],
};

type Pair = { a: string; b: string; severity: Severity; effect: string; advice: string };

const PAIRS: Pair[] = [
  { a: "ace_inhibitor", b: "arb", severity: "serious", effect: "Combining an ACE inhibitor with an ARB raises the risk of kidney injury, high potassium and low blood pressure without added benefit.", advice: "These are rarely prescribed together. Confirm with your prescriber that both are intended." },
  { a: "ace_inhibitor", b: "diuretic_k_sparing", severity: "caution", effect: "Both raise serum potassium; together they can push it into a dangerous range.", advice: "Potassium and kidney function are usually monitored more closely on this combination." },
  { a: "arb", b: "diuretic_k_sparing", severity: "caution", effect: "Both raise serum potassium.", advice: "Ask when your next potassium check is due." },
  { a: "nsaid", b: "ace_inhibitor", severity: "caution", effect: "NSAIDs blunt the blood-pressure effect and, with a diuretic, can strain the kidneys.", advice: "Occasional use is usually fine; regular use is worth discussing." },
  { a: "nsaid", b: "arb", severity: "caution", effect: "NSAIDs blunt the blood-pressure effect and can strain the kidneys.", advice: "Occasional use is usually fine; regular use is worth discussing." },
  { a: "nsaid", b: "anticoagulant", severity: "serious", effect: "Both increase bleeding risk, particularly gastrointestinal bleeding.", advice: "Avoid over-the-counter NSAIDs unless your prescriber has agreed to it." },
  { a: "statin", b: "macrolide", severity: "serious", effect: "Clarithromycin and erythromycin raise statin levels sharply, which can cause muscle injury.", advice: "Statins are often paused for the course of the antibiotic. Ask your prescriber." },
  { a: "ssri", b: "nsaid", severity: "caution", effect: "The combination increases the risk of gastrointestinal bleeding.", advice: "Worth mentioning if you take an NSAID regularly." },
  { a: "ssri", b: "anticoagulant", severity: "serious", effect: "Increased bleeding risk.", advice: "Report any unusual bruising or bleeding." },
  { a: "metformin_class", b: "quinolone", severity: "info", effect: "Quinolones can disturb blood glucose in either direction.", advice: "Check your glucose a little more often during the course." },
  { a: "ppi", b: "metformin_class", severity: "info", effect: "Long-term PPI use and metformin both lower vitamin B12 absorption.", advice: "B12 is worth including in your next panel." },
  { a: "anticoagulant", b: "macrolide", severity: "caution", effect: "Macrolides can raise warfarin levels and increase bleeding risk.", advice: "INR is usually checked during and after the course." },
];

/**
 * How people write an allergy versus how a drug class is named. "Sulfa drugs"
 * has to reach the sulfonamide class, or the check silently passes a
 * medication it should have flagged.
 */
const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  sulfonamide: ["sulfa", "sulpha", "sulfonamide", "sulphonamide", "septrin", "bactrim", "cotrimoxazole"],
  penicillin: ["penicillin", "amoxicillin", "augmentin", "beta lactam", "betalactam"],
  cephalosporin: ["cephalosporin", "cephalexin", "ceftriaxone", "cefuroxime"],
  nsaid: ["nsaid", "ibuprofen", "aspirin", "diclofenac", "naproxen", "brufen"],
  macrolide: ["macrolide", "erythromycin", "clarithromycin", "azithromycin"],
  quinolone: ["quinolone", "fluoroquinolone", "ciprofloxacin", "levofloxacin"],
  statin: ["statin", "atorvastatin", "simvastatin", "rosuvastatin"],
  ace_inhibitor: ["ace inhibitor", "lisinopril", "ramipril", "enalapril"],
  ssri: ["ssri", "sertraline", "fluoxetine", "escitalopram"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();

function classesOf(medicationName: string): string[] {
  const name = norm(medicationName);
  const found: string[] = [];
  for (const [cls, members] of Object.entries(CLASSES)) {
    if (members.some((m) => name.includes(m))) found.push(cls);
  }
  return found;
}

export function checkInteractions(medications: Array<{ name: string }>): InteractionFinding[] {
  const findings: InteractionFinding[] = [];
  for (let i = 0; i < medications.length; i += 1) {
    for (let j = i + 1; j < medications.length; j += 1) {
      const first = medications[i];
      const second = medications[j];
      const classesA = classesOf(first.name);
      const classesB = classesOf(second.name);
      for (const pair of PAIRS) {
        const forward = classesA.includes(pair.a) && classesB.includes(pair.b);
        const backward = classesA.includes(pair.b) && classesB.includes(pair.a);
        if (forward || backward) {
          findings.push({
            severity: pair.severity,
            a: first.name,
            b: second.name,
            effect: pair.effect,
            advice: pair.advice,
          });
        }
      }
    }
  }
  return findings;
}

export function checkAllergies(
  medications: Array<{ name: string }>,
  allergies: Array<{ substance: string; severity?: string }>,
): AllergyFinding[] {
  const findings: AllergyFinding[] = [];
  for (const med of medications) {
    const medClasses = classesOf(med.name);
    const medName = norm(med.name);
    for (const allergy of allergies) {
      const allergen = norm(allergy.substance);
      const allergenClasses = Object.entries(CLASSES)
        .filter(
          ([cls, members]) =>
            allergen.includes(cls.replace(/_/g, " ")) ||
            members.some((m) => allergen.includes(m)) ||
            (ALLERGEN_SYNONYMS[cls] ?? []).some((s) => allergen.includes(s)),
        )
        .map(([cls]) => cls);

      const sharesClass = allergenClasses.some((cls) => medClasses.includes(cls));
      const sameIngredient = allergen.length > 3 && medName.includes(allergen);

      if (sharesClass || sameIngredient) {
        findings.push({
          severity: allergy.severity === "severe" ? "serious" : "caution",
          medication: med.name,
          allergen: allergy.substance,
          reason: sameIngredient
            ? "This medication contains the substance you are recorded as allergic to."
            : `This medication is in the same class (${allergenClasses[0]?.replace(/_/g, " ")}) as a substance you are recorded as allergic to.`,
        });
      }
    }
  }
  return findings;
}

export const CHECK_DISCLAIMER =
  "These checks cover common interaction classes and are not exhaustive. Always confirm with your pharmacist or prescriber.";

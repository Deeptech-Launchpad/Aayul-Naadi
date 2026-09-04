/** Shapes stored inside encrypted JSON payloads. */

export type ProfileData = {
  displayName?: string;
  dob?: string; // ISO date
  sexAtBirth?: "male" | "female" | "intersex" | "unspecified";
  gender?: string;
  heightCm?: number;
  bloodType?: string;
  ancestry?: string;
  lifestyle?: {
    smoking?: "never" | "former" | "current";
    alcohol?: "none" | "occasional" | "weekly" | "daily";
    diet?: string;
    activityPerWeek?: number;
    occupation?: string;
  };
  goals?: {
    hba1c?: number;
    sleepHours?: number;
    steps?: number;
    weightKg?: number;
    notes?: string;
  };
  familyHistory?: Array<{
    relation: string;
    conditions: string[];
    ageAtOnset?: number | null;
    note?: string;
  }>;
  reproductive?: {
    cycleTracking?: boolean;
    lastPeriod?: string;
    pregnancies?: number;
    menopause?: string;
    notes?: string;
  };
  emergencyContact?: { name: string; relation?: string; phone?: string };
};

export type MedicationData = {
  name: string;
  rxnorm?: string;
  dose?: string;
  route?: string;
  form?: string;
  /** Local times, 24h, e.g. ["07:00", "20:00"]. */
  schedule: string[];
  quantityRemaining?: number;
  purpose?: string;
  notes?: string;
};

export type ConditionData = {
  name: string;
  icd10?: string;
  note?: string;
};

export type AllergyData = {
  substance: string;
  reaction?: string;
  severity?: "mild" | "moderate" | "severe" | "unknown";
  notedAt?: string;
};

export type ExtractedMarker = {
  name: string;
  metric: string | null;
  value: number;
  unit: string;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  collectedAt?: string | null;
  confidence: number;
  sourceText: string;
  accepted?: boolean;
};

export type ExtractionResult = {
  documentKind: string;
  labName?: string | null;
  panelName?: string | null;
  collectedAt?: string | null;
  markers: ExtractedMarker[];
  impression?: string | null;
  notes?: string | null;
};

export type Citation = {
  tool: string;
  label: string;
  detail: string;
  rows: number;
};

export type ConsentCategories = {
  labs_vitals?: boolean;
  wearables?: boolean;
  documents?: boolean;
  profile?: boolean;
  reproductive?: boolean;
};

export const CONSENT_LABELS: Array<{
  key: keyof ConsentCategories;
  title: string;
  detail: string;
  defaultOn: boolean;
}> = [
  { key: "labs_vitals", title: "Labs & biomarkers", detail: "Values, dates, reference ranges", defaultOn: true },
  { key: "wearables", title: "Vitals & wearables", detail: "Blood pressure, glucose, sleep, steps, heart rate", defaultOn: true },
  { key: "documents", title: "Documents & clinical notes", detail: "Uploaded reports and their extracted text", defaultOn: true },
  { key: "profile", title: "Profile & family history", detail: "Conditions, allergies, medications, relatives", defaultOn: true },
  { key: "reproductive", title: "Reproductive health", detail: "Cycle, pregnancy, menopause", defaultOn: false },
];

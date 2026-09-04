/**
 * De-identification before any text leaves for the model.
 *
 * Structured payloads (a series of glucose values, a medication schedule) are
 * assembled by us and carry no identifiers to begin with. The risk lives in
 * free text pulled out of documents — a lab PDF has your name, address and
 * medical record number on every page. Everything that goes into a prompt
 * passes through here first.
 */

export type DeidentOptions = {
  /** Names to redact — the account holder and anyone in the profile. */
  names?: string[];
};

/**
 * Order matters. Identifiers are removed before names, because a name that
 * appears inside an email address would otherwise break the address up and
 * leave its domain behind. Labelled record numbers are matched before the
 * generic digit run, so the redaction says what it removed.
 */
const PATTERNS: Array<{ re: RegExp; token: string }> = [
  { re: /\bhttps?:\/\/\S+/g, token: "[url]" },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, token: "[email]" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, token: "[national-id]" },
  { re: /\b(?:MRN|UHID|NHS|Patient\s*ID|Reg(?:istration)?\s*(?:No|Number)|Accession|Policy\s*(?:No|Number))\s*[:#-]?\s*[A-Z0-9-]{4,}/gi, token: "[record-id]" },
  { re: /\b[A-Z]{2}\d{6,}\b/g, token: "[record-id]" },
  { re: /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,5}[\s.-]?\d{4,6}\b/g, token: "[phone]" },
];

export function deidentify(text: string, options: DeidentOptions = {}): string {
  let output = text;

  for (const { re, token } of PATTERNS) {
    output = output.replace(re, token);
  }
  for (const name of options.names ?? []) {
    for (const part of name.split(/\s+/).filter((p) => p.length >= 3)) {
      output = output.replace(new RegExp(`\\b${escapeRegex(part)}\\b`, "gi"), "[name]");
    }
  }
  return output;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The coarse descriptor that stands in for the person. Age band, sex and
 * conditions are what make an answer clinically relevant; the name is not.
 */
export function subjectDescriptor(input: {
  age: number | null;
  sexAtBirth?: string;
  conditions: string[];
  ancestry?: string;
}): string {
  const parts: string[] = [];
  if (input.age != null) parts.push(`${input.age}y`);
  if (input.sexAtBirth && input.sexAtBirth !== "unspecified") parts.push(input.sexAtBirth);
  if (input.ancestry) parts.push(input.ancestry);
  if (input.conditions.length) parts.push(input.conditions.join(", "));
  return parts.join(" · ") || "adult, no conditions recorded";
}

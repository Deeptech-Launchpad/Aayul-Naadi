/**
 * Walks the record layer against a real database: encryption round-trips,
 * series statistics, care-gap evaluation, interaction checks and the tool
 * outputs Nadi receives.
 *
 *   npm run test:record
 */
import { db } from "../src/lib/db";
import { masterKey, unwrapKey } from "../src/lib/crypto";
import { loadSampleRecord, wipeRecord } from "../src/lib/sample";
import { getLabs, getSeries, getTimeline, getMedicationsWithAdherence, searchDocuments, getProfile } from "../src/lib/record";
import { evaluateCareGaps } from "../src/lib/caregaps";
import { checkAllergies, checkInteractions } from "../src/lib/interactions";
import { runTool } from "../src/lib/nadi";

const EMAIL = "smoke@aayu.local";

async function main() {
  const { createAccount } = await import("../src/lib/account");

  await db.user.deleteMany({ where: { email: EMAIL } });
  const user = await createAccount(EMAIL, "correct horse battery staple");
  await db.user.update({
    where: { id: user.id },
    data: {
      consent: { labs_vitals: true, wearables: true, documents: true, profile: true, reproductive: false },
      consentAt: new Date(),
      onboardedAt: new Date(),
    },
  });
  const fresh = (await db.user.findUnique({ where: { id: user.id } }))!;
  const ctx = { user: fresh, dek: unwrapKey(fresh.dekWrappedMaster, masterKey()) };

  console.log("account created:", fresh.email);

  const t0 = Date.now();
  const { observations } = await loadSampleRecord(ctx);
  console.log(`sample record: ${observations} observations in ${Date.now() - t0}ms`);

  const profile = await getProfile(ctx);
  console.log("profile decrypts:", profile.displayName, profile.dob, `${profile.familyHistory?.length} relatives`);

  const glucose = await getSeries(ctx, "glucose_fasting", { from: new Date(Date.now() - 30 * 86400000) });
  console.log(
    `glucose: n=${glucose.stats.count} mean=${glucose.stats.mean?.toFixed(1)} prev=${glucose.stats.previousMean?.toFixed(1)} trend=${glucose.stats.trendPct?.toFixed(1)}% status=${glucose.status}`,
  );

  const labs = await getLabs(ctx, { latestOnly: true });
  const flagged = labs.filter((l) => l.status !== "in_range");
  console.log(`labs: ${labs.length} markers, ${flagged.length} flagged →`, flagged.map((l) => `${l.label} ${l.value} ${l.status}`).join(", "));

  const gaps = await evaluateCareGaps(ctx);
  console.log("care gaps:");
  for (const gap of gaps) {
    console.log(`  ${gap.status.padEnd(12)} ${gap.rule.title} — ${gap.because}`);
  }

  const meds = await getMedicationsWithAdherence(ctx, 30);
  console.log("medications:", meds.map((m) => `${m.name} ${Math.round((m.adherence ?? 0) * 100)}% (${m.dosesTaken}/${m.dosesDue})`).join(", "));

  console.log("interactions:", checkInteractions(meds).map((f) => `${f.a}+${f.b}`).join(", ") || "none");
  console.log("allergy checks:", checkAllergies(meds, [{ substance: "Sulfa drugs", severity: "severe" }]).length, "findings");
  console.log("allergy match test:", checkAllergies([{ name: "Sulfamethoxazole 800 mg" }], [{ substance: "Sulfa drugs", severity: "severe" }]));

  const timeline = await getTimeline(ctx, 8);
  console.log("timeline:");
  for (const event of timeline.slice(0, 6)) {
    console.log(`  ${event.at.toISOString().slice(0, 10)} [${event.type}] ${event.title}`);
  }

  const docs = await searchDocuments(ctx, "vitamin d retinopathy");
  console.log("document search:", docs.map((d) => d.filename).join(", "));

  for (const tool of ["get_profile", "get_care_gaps"]) {
    const outcome = await runTool(ctx, tool, {});
    console.log(`\ntool ${tool} → ${outcome.citation.detail}\n${outcome.text.split("\n").slice(0, 4).join("\n")}`);
  }
  const series = await runTool(ctx, "get_series", { metric: "glucose_fasting", days: 30 });
  console.log(`\ntool get_series →\n${series.text}`);

  await wipeRecord(fresh.id);
  const left = await db.observation.count({ where: { userId: fresh.id } });
  console.log(`\nwipe: ${left} observations remain`);
  await db.user.delete({ where: { id: fresh.id } });
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

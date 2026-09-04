/**
 * Creates an account and fills it with the sample record.
 *
 *   npm run seed -- you@example.com 'a long passphrase'
 *
 * Two-factor still has to be enrolled the first time you sign in.
 */
import { db } from "../src/lib/db";
import { createAccount } from "../src/lib/account";
import { masterKey, unwrapKey } from "../src/lib/crypto";
import { loadSampleRecord } from "../src/lib/sample";

async function main() {
  const [email, passphrase] = process.argv.slice(2);
  if (!email || !passphrase) {
    console.error("Usage: npm run seed -- <email> <passphrase>");
    process.exit(1);
  }

  let user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    console.log(`Account ${email} already exists — adding the sample record to it.`);
  } else {
    user = await createAccount(email, passphrase);
    console.log(`Created ${email}.`);
  }

  user = await db.user.update({
    where: { id: user.id },
    data: {
      consent: { labs_vitals: true, wearables: true, documents: true, profile: true, reproductive: false },
      consentAt: new Date(),
      onboardedAt: new Date(),
      onboardingStep: 5,
    },
  });

  const ctx = { user, dek: unwrapKey(user.dekWrappedMaster, masterKey()) };
  const existing = await db.observation.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log(`${existing} readings already present — leaving the record alone.`);
  } else {
    const { observations } = await loadSampleRecord(ctx);
    console.log(`Loaded the sample record: ${observations} readings, 3 panels, 3 medications, 3 documents.`);
  }

  console.log("\nSign in, enrol an authenticator app, and save the recovery kit.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

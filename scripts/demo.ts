/**
 * Creates or refreshes the demo account.
 *
 *   npm run demo             create it, or top it up if it already exists
 *   npm run demo -- --reset  clear its record and reload the sample data
 *
 * The address comes from AAYU_DEMO_EMAIL. That same variable is what makes the
 * app offer a way in without a passphrase or an authenticator code, so with it
 * unset there is neither a demo account nor a demo door.
 *
 * A random passphrase is generated and thrown away. Nobody needs it: the only
 * way into this account is the button on the sign-in page, which the server
 * answers by looking up its own configured address. That also means the account
 * cannot be reached at all once AAYU_DEMO_EMAIL is removed — the row stays, but
 * no passphrase exists that opens it.
 */
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { createAccount } from "../src/lib/account";
import { masterKey, unwrapKey } from "../src/lib/crypto";
import { loadSampleRecord, wipeRecord } from "../src/lib/sample";
import { deleteAllFor } from "../src/lib/storage";

async function main() {
  const reset = process.argv.slice(2).includes("--reset");
  const email = env.demoEmail;

  if (!email) {
    console.error(
      "AAYU_DEMO_EMAIL is not set, so there is no demo account to create.\n" +
        "Add it to .env — for example AAYU_DEMO_EMAIL=demo@aayu.local — and run this again.",
    );
    process.exit(1);
  }

  let user = await db.user.findUnique({ where: { email } });

  if (user && reset) {
    await deleteAllFor(user.id);
    await wipeRecord(user.id);
    console.log(`Cleared the record on ${email}.`);
  }

  if (!user) {
    // Long, random, and immediately forgotten. The account is opened by the
    // demo button, never by typing this.
    user = await createAccount(email, crypto.randomBytes(24).toString("hex"));
    console.log(`Created ${email}.`);
  }

  user = await db.user.update({
    where: { id: user.id },
    data: {
      consent: { labs_vitals: true, wearables: true, documents: true, profile: true, reproductive: false },
      consentAt: new Date(),
      onboardedAt: new Date(),
      onboardingStep: 5,
      // No PIN: an app lock the visitor cannot unlock would strand them on /lock.
      pinHash: null,
    },
  });

  const existing = await db.observation.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log(`${existing} readings already present — leaving the record alone. Use --reset to reload it.`);
  } else {
    const ctx = { user, dek: unwrapKey(user.dekWrappedMaster, masterKey()) };
    const { observations } = await loadSampleRecord(ctx);
    console.log(`Loaded the sample record: ${observations} readings, 3 panels, 3 medications, 3 documents.`);
  }

  console.log(
    `\nThe sign-in page now offers "Look around the demo", which opens ${email}\n` +
      "with no passphrase and no authenticator code. Anyone who reaches the page\n" +
      "can use it, and everyone who does shares the same record.",
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

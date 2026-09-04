/**
 * Clears the health record for one account, keeping the account itself.
 *
 *   npm run wipe -- you@example.com
 */
import { db } from "../src/lib/db";
import { wipeRecord } from "../src/lib/sample";

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npm run wipe -- <email>");
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const before = await db.observation.count({ where: { userId: user.id } });
  await wipeRecord(user.id);
  console.log(`Cleared ${before} readings and everything attached to them. The account remains.`);
  console.log("Uploaded files on disk are removed when you delete the documents from the app.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

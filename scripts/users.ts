/**
 * Account admin for a test round.
 *
 *   npm run users                        list accounts
 *   npm run users -- delete a@b.com      delete an account and everything in it
 *   npm run users -- reset a@b.com       clear the health record, keep the login
 *
 * There is deliberately no password-reset path: the record is encrypted under a
 * key wrapped by the passphrase, so a tester who loses both the passphrase and
 * the recovery codes cannot be rescued — only deleted and started again. That is
 * the design, and it is worth telling testers before they start.
 */
import { db } from "../src/lib/db";
import { wipeRecord } from "../src/lib/sample";
import { deleteAllFor } from "../src/lib/storage";

async function list() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { observations: true, documents: true, conversations: true, sessions: true } },
    },
  });
  if (!users.length) return console.log("No accounts yet.");

  console.log(
    ["email".padEnd(34), "created".padEnd(12), "2FA".padEnd(5), "readings".padStart(9), "docs".padStart(5), "chats".padStart(6), "last seen"].join(" "),
  );
  for (const user of users) {
    const lastSeen = await db.session.findFirst({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    console.log(
      [
        user.email.padEnd(34),
        user.createdAt.toISOString().slice(0, 10).padEnd(12),
        (user.totpEnabled ? "on" : "off").padEnd(5),
        String(user._count.observations).padStart(9),
        String(user._count.documents).padStart(5),
        String(user._count.conversations).padStart(6),
        lastSeen ? lastSeen.lastSeenAt.toISOString().slice(0, 16).replace("T", " ") : "never",
      ].join(" "),
    );
  }
  console.log(`\n${users.length} account${users.length === 1 ? "" : "s"}.`);
}

async function main() {
  const [command, email] = process.argv.slice(2);

  if (!command || command === "list") {
    await list();
  } else if (command === "delete" || command === "reset") {
    if (!email) {
      console.error(`Usage: npm run users -- ${command} <email>`);
      process.exit(1);
    }
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      console.error(`No account for ${email}.`);
      process.exit(1);
    }
    const readings = await db.observation.count({ where: { userId: user.id } });

    if (command === "reset") {
      await wipeRecord(user.id);
      console.log(`Cleared ${readings} readings for ${user.email}. The login, 2FA and recovery codes are untouched.`);
    } else {
      await deleteAllFor(user.id);
      await db.user.delete({ where: { id: user.id } });
      console.log(`Deleted ${user.email}, its ${readings} readings, its uploaded files and its audit log. Nothing is recoverable.`);
    }
  } else {
    console.error(`Unknown command "${command}". Use list, reset or delete.`);
    process.exit(1);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

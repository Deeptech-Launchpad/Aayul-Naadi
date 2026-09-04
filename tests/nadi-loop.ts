/**
 * Exercises Nadi's agent loop against a stubbed Anthropic client.
 *
 *   npm run test:nadi
 *
 * The Claude API is not reached. What this proves is the part that is ours: that
 * tool calls are dispatched to the right handler with the right scope, that
 * every tool result comes back in a single user message as the API requires,
 * that citations accumulate in order, that a refusal is surfaced rather than
 * swallowed, and that the loop cannot run away.
 */
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/lib/db";
import { createAccount } from "../src/lib/account";
import { masterKey, unwrapKey } from "../src/lib/crypto";
import { loadSampleRecord, wipeRecord } from "../src/lib/sample";
import { askNadi, runTool } from "../src/lib/nadi";

const EMAIL = "nadi-loop@aayu.local";

type Turn = { content: Anthropic.ContentBlock[]; stop_reason: string };

/** Minimal stand-in for the SDK's streaming response. */
function stubClient(turns: Turn[]) {
  const requests: Anthropic.MessageCreateParams[] = [];
  let index = 0;

  const messages = {
    stream(params: Anthropic.MessageCreateParams) {
      // Snapshot: askNadi keeps mutating the same messages array between rounds.
      requests.push(JSON.parse(JSON.stringify(params)) as Anthropic.MessageCreateParams);
      const turn = turns[index++] ?? { content: [], stop_reason: "end_turn" };
      const events = turn.content.flatMap((block) =>
        block.type === "text"
          ? [{ type: "content_block_delta", delta: { type: "text_delta", text: block.text } }]
          : [],
      );
      return {
        async *[Symbol.asyncIterator]() {
          for (const event of events) yield event;
        },
        async finalMessage() {
          return { content: turn.content, stop_reason: turn.stop_reason };
        },
      };
    },
  };

  return { client: { messages } as unknown as Pick<Anthropic, "messages">, requests };
}

const text = (value: string) => ({ type: "text", text: value, citations: null }) as Anthropic.ContentBlock;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.ContentBlock;

async function main() {
  await db.user.deleteMany({ where: { email: EMAIL } });
  const created = await createAccount(EMAIL, "correct horse battery staple");
  const user = await db.user.update({
    where: { id: created.id },
    data: {
      consent: { labs_vitals: true, wearables: true, documents: true, profile: true, reproductive: false },
      consentAt: new Date(),
      onboardedAt: new Date(),
    },
  });
  const ctx = { user, dek: unwrapKey(user.dekWrappedMaster, masterKey()) };
  await loadSampleRecord(ctx);

  /* ── a two-round conversation with three tool calls ───────────────────── */
  {
    const { client, requests } = stubClient([
      {
        content: [
          text("Let me look at your record. "),
          toolUse("t1", "get_series", { metric: "glucose_fasting", days: 30 }),
          toolUse("t2", "get_medications", { days: 30 }),
        ],
        stop_reason: "tool_use",
      },
      { content: [text("Your fasting glucose is up 8 mg/dL.")], stop_reason: "end_turn" },
    ]);

    const events = [];
    for await (const event of askNadi(ctx, [{ role: "user", content: "Why is my sugar high?" }], client)) {
      events.push(event);
    }

    const answer = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    assert.equal(answer, "Let me look at your record. Your fasting glucose is up 8 mg/dL.");

    const citations = events.filter((e) => e.type === "tool");
    assert.equal(citations.length, 2, "one citation per tool call");
    assert.equal((citations[0] as { citation: { tool: string } }).citation.tool, "get_series");

    const done = events.at(-1);
    assert.equal(done?.type, "done");
    assert.equal((done as { citations: unknown[] }).citations.length, 2);

    // The API requires every tool_result for a turn in a single user message.
    assert.equal(requests.length, 2, "two API round trips");
    const followUp = requests[1].messages.at(-1)!;
    assert.equal(followUp.role, "user");
    const blocks = followUp.content as Anthropic.ToolResultBlockParam[];
    assert.equal(blocks.length, 2, "both tool results in one message");
    assert.ok(blocks.every((b) => b.type === "tool_result"));
    assert.deepEqual(blocks.map((b) => b.tool_use_id), ["t1", "t2"]);
    assert.ok(String(blocks[0].content).includes("Fasting glucose over 30 days"));

    // The tool list and system prompt are sent on every request.
    assert.ok(requests[0].tools?.length === 6, "all six tools offered");
    assert.equal(requests[0].model, process.env.AAYU_MODEL ?? "claude-opus-5");
    console.log("✓ tool dispatch, citation order and tool_result batching");
  }

  /* ── a refusal is surfaced, not swallowed ─────────────────────────────── */
  {
    const { client } = stubClient([{ content: [], stop_reason: "refusal" }]);
    const events = [];
    for await (const event of askNadi(ctx, [{ role: "user", content: "…" }], client)) events.push(event);
    assert.equal(events.at(-1)?.type, "error");
    console.log("✓ refusal surfaces as an error rather than an empty answer");
  }

  /* ── the loop cannot run away ─────────────────────────────────────────── */
  {
    const forever = Array.from({ length: 20 }, () => ({
      content: [toolUse("tx", "get_profile", {})],
      stop_reason: "tool_use",
    }));
    const { client, requests } = stubClient(forever);
    const events = [];
    for await (const event of askNadi(ctx, [{ role: "user", content: "…" }], client)) events.push(event);
    assert.ok(requests.length <= 6, `bounded at 6 rounds, made ${requests.length}`);
    assert.equal(events.at(-1)?.type, "error");
    console.log(`✓ tool loop bounded at ${requests.length} rounds`);
  }

  /* ── an unknown tool name is rejected, not executed ───────────────────── */
  {
    const outcome = await runTool(ctx, "drop_everything", { table: "users" });
    assert.ok(outcome.text.startsWith("Unknown tool"));
    assert.equal(outcome.citation.detail, "rejected");
    console.log("✓ unknown tool names are rejected");
  }

  /* ── consent gates retrieval at the query layer ───────────────────────── */
  {
    const restricted = await db.user.update({
      where: { id: user.id },
      data: { consent: { labs_vitals: false, wearables: true, documents: false, profile: true } },
    });
    const restrictedCtx = { user: restricted, dek: ctx.dek };

    const labs = await runTool(restrictedCtx, "get_labs", {});
    assert.ok(labs.text.includes("switched off"), "labs blocked by consent");
    assert.equal(labs.citation.detail, "blocked by consent settings");

    const docs = await runTool(restrictedCtx, "search_documents", { query: "vitamin" });
    assert.ok(docs.text.includes("switched off"), "documents blocked by consent");

    const profile = await runTool(restrictedCtx, "get_profile", {});
    assert.ok(profile.text.includes("subject:"), "profile still allowed");
    console.log("✓ consent categories gate retrieval, not post-filtering");
  }

  /* ── de-identification of document passages ───────────────────────────── */
  {
    const { deidentify } = await import("../src/lib/deident");
    const dirty =
      "Patient: Vellayan Lakshmanan, MRN: 88213345, vellayan@example.com, +91 98400 12345, https://portal.example.com/r/9";
    const clean = deidentify(dirty, { names: ["Vellayan Lakshmanan"] });
    assert.ok(!/vellayan/i.test(clean), "name removed, including inside the email");
    assert.ok(!clean.includes("Lakshmanan"), "surname removed");
    assert.ok(!clean.includes("88213345"), "record number removed");
    assert.ok(!clean.includes("example.com"), "email domain removed");
    assert.ok(!clean.includes("98400"), "phone removed");
    assert.ok(!clean.includes("portal"), "url removed");
    // The clinical content itself has to survive, or the redaction is useless.
    const kept = deidentify("HbA1c 6.1 % on 12 Aug 2026, metformin 1000 mg twice daily");
    assert.ok(kept.includes("HbA1c 6.1 %"), "lab value survives");
    assert.ok(kept.includes("metformin 1000 mg"), "medication and dose survive");
    console.log("✓ de-identification strips identifiers and keeps clinical content");
  }

  await wipeRecord(user.id);
  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();
  console.log("\nAll Nadi loop checks passed.");
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

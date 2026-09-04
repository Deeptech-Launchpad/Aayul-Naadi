import type Anthropic from "@anthropic-ai/sdk";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { openText, sealJson, sealText } from "@/lib/crypto";
import { askNadi, nadiAvailable } from "@/lib/nadi";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION = 4000;
const MAX_HISTORY = 24;

/**
 * Streams Nadi's answer as newline-delimited JSON events. Tool calls surface as
 * they resolve, so you watch the record being consulted rather than waiting on
 * a spinner.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await requireApiUser();
  if (!ctx) return json({ error: "Not signed in." }, 401);

  if (!nadiAvailable()) {
    return json(
      { error: "ANTHROPIC_API_KEY is not set on the server, so Nadi cannot answer. Everything else in Aayu works without it." },
      503,
    );
  }

  let payload: { question?: unknown; conversationId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const question = String(payload.question ?? "").trim();
  if (!question) return json({ error: "Ask a question." }, 400);
  if (question.length > MAX_QUESTION) return json({ error: "That question is too long." }, 400);

  // Find or start the conversation, always scoped to this user.
  let conversationId = typeof payload.conversationId === "string" ? payload.conversationId : null;
  if (conversationId) {
    const owned = await db.conversation.findFirst({
      where: { id: conversationId, userId: ctx.user.id },
      select: { id: true },
    });
    if (!owned) conversationId = null;
  }
  if (!conversationId) {
    const created = await db.conversation.create({
      data: { userId: ctx.user.id, titleEnc: sealText(ctx.dek, question.slice(0, 80)) },
    });
    conversationId = created.id;
  }

  const previous = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY,
  });

  const history: Anthropic.MessageParam[] = previous.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: openText(ctx.dek, message.contentEnc),
  }));
  history.push({ role: "user", content: question });

  await db.message.create({
    data: { conversationId, role: "user", contentEnc: sealText(ctx.dek, question) },
  });
  await audit({
    userId: ctx.user.id,
    action: "nadi.query",
    resource: `conversation:${conversationId}`,
    dek: ctx.dek,
    detail: { question },
  });

  const encoder = new TextEncoder();
  const activeConversationId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let answer = "";
      const citations: Citation[] = [];

      send({ type: "start", conversationId: activeConversationId });

      try {
        for await (const event of askNadi(ctx, history)) {
          if (event.type === "text") answer += event.text;
          if (event.type === "tool") citations.push(event.citation);
          send(event);
        }
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Nadi stopped unexpectedly." });
      }

      if (answer.trim()) {
        await db.message.create({
          data: {
            conversationId: activeConversationId,
            role: "assistant",
            contentEnc: sealText(ctx.dek, answer),
            citationsEnc: sealJson(ctx.dek, citations),
          },
        });
        await db.conversation.update({
          where: { id: activeConversationId },
          data: { updatedAt: new Date() },
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

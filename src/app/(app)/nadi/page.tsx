import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { openJsonSafe, openText } from "@/lib/crypto";
import { nadiAvailable } from "@/lib/nadi";
import { getConditions, getLabs } from "@/lib/record";
import { evaluateCareGaps } from "@/lib/caregaps";
import { AppBar } from "@/components/appbar";
import { Chat } from "@/components/chat";
import type { Citation } from "@/lib/types";

export const metadata = { title: "Nadi · Aayu" };
export const dynamic = "force-dynamic";

export default async function NadiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; ask?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;

  const conversation = params.c
    ? await db.conversation.findFirst({
        where: { id: params.c, userId: ctx.user.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 60 } },
      })
    : await db.conversation.findFirst({
        where: { userId: ctx.user.id },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 60 } },
      });

  const messages = (conversation?.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant",
    text: openText(ctx.dek, message.contentEnc),
    citations: openJsonSafe<Citation[]>(ctx.dek, message.citationsEnc, []),
  }));

  const eventCount = await db.observation.count({ where: { userId: ctx.user.id } });
  const [labs, gaps, conditions] = await Promise.all([
    getLabs(ctx, { latestOnly: true, limit: 40 }),
    evaluateCareGaps(ctx),
    getConditions(ctx),
  ]);

  // Suggestions are drawn from what is actually in the record, so the first
  // question a person asks is one Nadi can answer well.
  const flagged = labs.find((l) => l.status !== "in_range");
  const overdue = gaps.find((g) => g.status === "overdue" || g.status === "never_done");
  const suggestions = [
    flagged ? `Why is my ${flagged.label.toLowerCase()} outside range?` : null,
    "What screenings am I due for?",
    overdue ? `Tell me about the ${overdue.rule.title.toLowerCase()}` : null,
    conditions.length ? "How has my control changed this year?" : "What should I start tracking?",
    "Summarise my last lab panel in plain language",
  ].filter((s): s is string => Boolean(s)).slice(0, 4);

  return (
    <>
      <AppBar
        title="Nadi"
        subtitle={`Reading ${eventCount.toLocaleString("en-GB")} records`}
      />
      <Chat
        conversationId={conversation?.id ?? null}
        initialMessages={messages}
        suggestions={suggestions}
        available={nadiAvailable()}
        initialQuestion={params.ask ?? null}
      />
    </>
  );
}

"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { randomToken, sealJson, shareKey, tokenDigest } from "@/lib/crypto";
import { buildVisitPrep } from "@/lib/summaries";
import { env } from "@/lib/env";

export type VisitPrepState = {
  error?: string;
  summary?: string;
  questions?: string[];
  since?: string;
  shareUrl?: string;
  expiresAt?: string;
};

export async function draftVisitPrepAction(_prev: VisitPrepState, formData: FormData): Promise<VisitPrepState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const days = Number(formData.get("days") ?? 90);
  const since = new Date(Date.now() - (Number.isFinite(days) ? days : 90) * 86_400_000);

  const result = await buildVisitPrep(ctx, since);
  if ("error" in result) return { error: result.error, since: since.toISOString() };

  await audit({ userId: ctx.user.id, action: "nadi.query", resource: "visit_prep" });
  return {
    summary: result.summary,
    questions: result.questions,
    since: since.toISOString(),
  };
}

const SHARE_DAYS = 7;

export async function createShareLinkAction(_prev: VisitPrepState, formData: FormData): Promise<VisitPrepState> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");

  const summary = String(formData.get("summary") ?? "").trim();
  const questions = formData.getAll("question").map(String).filter(Boolean);
  const facts = String(formData.get("facts") ?? "");
  if (!summary) return { error: "Draft the note before sharing it." };

  // The token is never stored — only a keyed digest of it, so a database dump
  // does not yield working share links.
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + SHARE_DAYS * 86_400_000);

  await db.shareLink.create({
    data: {
      userId: ctx.user.id,
      tokenHash: tokenDigest(token),
      kind: "visit_prep",
      payloadEnc: sealJson(shareKey(token), {
        summary,
        questions,
        facts: facts ? JSON.parse(facts) : null,
        createdAt: new Date().toISOString(),
      }),
      expiresAt,
    },
  });
  await audit({
    userId: ctx.user.id,
    action: "share.create",
    resource: "visit_prep",
    dek: ctx.dek,
    detail: { expiresAt: expiresAt.toISOString() },
  });

  return {
    summary,
    questions,
    shareUrl: `${env.origin}/share/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const id = String(formData.get("id") ?? "");
  await db.shareLink.updateMany({
    where: { id, userId: ctx.user.id },
    data: { revokedAt: new Date() },
  });
  await audit({ userId: ctx.user.id, action: "share.revoke", resource: `share:${id}` });
  redirect("/profile/audit");
}

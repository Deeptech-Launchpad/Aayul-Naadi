import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { sealJson } from "./crypto";

export type AuditAction =
  | "auth.signup"
  | "auth.signin"
  | "auth.demo_signin"
  | "auth.signin_failed"
  | "auth.2fa_passed"
  | "auth.2fa_failed"
  | "auth.recovery_used"
  | "auth.signout"
  | "auth.session_revoked"
  | "auth.pin_failed"
  | "record.read"
  | "record.write"
  | "record.delete"
  | "document.upload"
  | "document.extract"
  | "document.confirm"
  | "nadi.query"
  | "share.create"
  | "share.view"
  | "share.revoke"
  | "export.create"
  | "account.delete"
  | "settings.change";

/**
 * Append-only audit trail. Pass `tx` to write inside the same transaction as
 * the action being recorded — the log must not be able to drift from reality.
 */
export async function audit(
  input: {
    userId: string;
    action: AuditAction;
    resource: string;
    outcome?: "ok" | "denied" | "error";
    detail?: unknown;
    device?: string | null;
    ipHash?: string | null;
    dek?: Buffer | null;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.auditEvent.create({
    data: {
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      outcome: input.outcome ?? "ok",
      detailEnc:
        input.detail !== undefined && input.dek ? sealJson(input.dek, input.detail) : null,
      device: input.device ?? null,
      ipHash: input.ipHash ?? null,
    },
  });
}

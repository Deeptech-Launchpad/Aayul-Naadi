/** Environment access. Every read is validated once, at first use. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get masterKey(): Buffer {
    const raw = required("AAYU_MASTER_KEY");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(
        "AAYU_MASTER_KEY must be 32 bytes, base64-encoded. Generate one with: openssl rand -base64 32",
      );
    }
    return key;
  },
  get anthropicKey(): string | null {
    return process.env.ANTHROPIC_API_KEY || null;
  },
  /**
   * Identity-linked API keys — the kind the Console issues to a person rather
   * than to a workspace — are rejected with a 400 unless the request also names
   * the workspace it acts in. Workspace-scoped keys carry that implicitly and
   * need nothing here, so this stays optional.
   */
  get anthropicWorkspaceId(): string | null {
    return process.env.ANTHROPIC_WORKSPACE_ID || null;
  },
  get model(): string {
    return process.env.AAYU_MODEL || "claude-opus-5";
  },
  get dataDir(): string {
    return process.env.AAYU_DATA_DIR || "/data/uploads";
  },
  get origin(): string {
    return process.env.AAYU_ORIGIN || "http://localhost:3000";
  },
  get secureCookies(): boolean {
    return process.env.AAYU_INSECURE_COOKIES !== "1";
  },
  /**
   * Who may create an account.
   *
   *   open    anyone who reaches the sign-up page — the default, and correct
   *           for a personal instance nobody else knows the address of
   *   invite  an invite code is required, set in AAYU_INVITE_CODE
   *   closed  nobody; existing accounts still sign in
   *
   * The moment the address is shared with anyone, `open` is the wrong setting.
   */
  get signupMode(): "open" | "invite" | "closed" {
    const mode = (process.env.AAYU_SIGNUP_MODE || "open").toLowerCase();
    if (mode === "invite" || mode === "closed") return mode;
    return "open";
  },
  get inviteCode(): string | null {
    return process.env.AAYU_INVITE_CODE || null;
  },
  /**
   * The one address that may enter without a passphrase or an authenticator
   * code, so the app can be shown to someone without handing them credentials.
   * Unset — the default — and no such door exists at all.
   *
   * The exemption is scoped to this single account. Every other account still
   * needs both factors, and nothing about their key wrapping changes. The
   * account is meant to hold the sample record; never point this at an address
   * whose record is real, because anyone who reaches the sign-in page can open
   * it.
   */
  get demoEmail(): string | null {
    return (process.env.AAYU_DEMO_EMAIL || "").trim().toLowerCase() || null;
  },
  /** Comma-separated addresses that may register, whatever the mode. Empty means no restriction. */
  get allowedEmails(): string[] {
    return (process.env.AAYU_ALLOWED_EMAILS || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  },
};

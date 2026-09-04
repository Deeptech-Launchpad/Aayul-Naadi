import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { PinPad } from "./pinpad";
import { Icon } from "@/components/icons";

export const metadata = { title: "Locked · Aayu" };

export default async function LockPage() {
  const session = await currentSession();
  if (!session) redirect("/signin");
  if (!session.user.pinHash) redirect("/today");

  return (
    <main className="auth-shell" style={{ justifyContent: "flex-start", paddingTop: 56 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 60, height: 60, borderRadius: 19,
            background: "var(--jade-mist)", color: "var(--jade)",
            display: "grid", placeItems: "center",
          }}
        >
          <Icon name="lock" size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: 22 }}>Aayu is locked</h1>
          <p style={{ fontSize: 13, color: "var(--txt-2)", marginTop: 5 }}>
            Enter your PIN to continue
          </p>
        </div>
      </div>
      <PinPad />
      <p className="disclaimer" style={{ textAlign: "center" }}>
        Locks automatically after {Math.round(session.user.lockTimeoutSec / 60)} minute
        {session.user.lockTimeoutSec === 60 ? "" : "s"} in the background.
      </p>
    </main>
  );
}

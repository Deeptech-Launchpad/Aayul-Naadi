import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/signin");
  return <div className="auth-shell" style={{ justifyContent: "flex-start", paddingTop: 28 }}>{children}</div>;
}

import { redirect } from "next/navigation";
import { isDemoAccount, requireUser } from "@/lib/auth";
import { TabBar } from "@/components/tabbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (!session.user.onboardedAt) redirect("/onboarding");

  return (
    <div className="shell">
      {isDemoAccount(session.user) && (
        <div className="demo-flag">
          <span className="dot" />
          Demo account · sample data
        </div>
      )}
      {children}
      <TabBar />
    </div>
  );
}

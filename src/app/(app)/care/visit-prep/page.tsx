import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { gatherFacts } from "@/lib/summaries";
import { nadiAvailable } from "@/lib/nadi";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { VisitPrep } from "@/components/visit-prep";

export const metadata = { title: "Visit prep · Aayu" };
export const dynamic = "force-dynamic";

export default async function VisitPrepPage() {
  const ctx = await requireUser();
  const facts = await gatherFacts(ctx);

  const activeLinks = await db.shareLink.findMany({
    where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AppBar title="Visit prep" subtitle="What changed, and what to ask" />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/care", label: "Screenings" },
            { href: "/care/medications", label: "Medications" },
            { href: "/care/visit-prep", label: "Visit prep" },
          ]}
        />
        <VisitPrep
          facts={{
            flaggedLabs: facts.flaggedLabs,
            movingSeries: facts.movingSeries,
            careGaps: facts.careGaps,
            adherence: facts.adherence,
          }}
          available={nadiAvailable()}
          activeShareCount={activeLinks.length}
        />
      </main>
    </>
  );
}

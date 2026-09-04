import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { ConnectPanel } from "@/components/connect-panel";
import { Icon } from "@/components/icons";

export const metadata = { title: "Sources · Aayu" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Logged by you",
  document: "Read from documents",
  apple_health: "Apple Health",
  fitbit: "Fitbit",
  myfitnesspal: "MyFitnessPal",
  fhir: "Health system (FHIR)",
  csv: "CSV import",
};

export default async function SourcesPage() {
  const ctx = await requireUser();
  const [connections, bySource, hasData] = await Promise.all([
    db.connection.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "asc" } }),
    db.observation.groupBy({
      by: ["source"],
      where: { userId: ctx.user.id },
      _count: { _all: true },
      _max: { effectiveAt: true },
    }),
    db.observation.count({ where: { userId: ctx.user.id } }),
  ]);

  return (
    <>
      <AppBar
        title="Sources"
        subtitle={`${bySource.length} source${bySource.length === 1 ? "" : "s"} · ${hasData.toLocaleString("en-GB")} readings`}
      />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/record", label: "Timeline" },
            { href: "/record/labs", label: "Labs" },
            { href: "/record/documents", label: "Documents" },
            { href: "/record/sources", label: "Sources" },
          ]}
        />

        {bySource.length > 0 && (
          <>
            <div className="section-title"><span>What is in your record</span></div>
            <section className="card rows">
              {bySource
                .sort((a, b) => b._count._all - a._count._all)
                .map((group) => (
                  <div className="row" key={group.source}>
                    <span className="ic j"><Icon name={iconFor(group.source)} /></span>
                    <span className="tx">
                      <b>{SOURCE_LABEL[group.source] ?? group.source}</b>
                      <small>
                        Most recent{" "}
                        {group._max.effectiveAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </small>
                    </span>
                    <span className="val">{group._count._all.toLocaleString("en-GB")}<small>readings</small></span>
                  </div>
                ))}
            </section>
          </>
        )}

        {connections.length > 0 && (
          <>
            <div className="section-title"><span>Connections</span></div>
            <section className="card rows">
              {connections.map((connection) => (
                <div className="row" key={connection.id}>
                  <span className={`ic ${connection.status === "connected" ? "j" : "w"}`}>
                    <Icon name={iconFor(connection.provider)} />
                  </span>
                  <span className="tx">
                    <b>{connection.label}</b>
                    <small>
                      {connection.lastSyncAt
                        ? `Last sync ${connection.lastSyncAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : "Never synced"}
                    </small>
                  </span>
                  <span className={`pill ${connection.status === "connected" ? "ok" : "watch"}`}>
                    {connection.status === "connected" ? "Live" : "Reconnect"}
                  </span>
                </div>
              ))}
            </section>
          </>
        )}

        <ConnectPanel compact={hasData > 0} />
      </main>
    </>
  );
}

function iconFor(source: string) {
  switch (source) {
    case "apple_health":
    case "fitbit":
      return "activity" as const;
    case "document":
      return "file" as const;
    case "fhir":
      return "flask" as const;
    case "manual":
      return "user" as const;
    default:
      return "link" as const;
  }
}

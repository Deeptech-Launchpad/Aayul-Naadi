import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLabs } from "@/lib/record";
import { formatRange, formatValue } from "@/lib/metrics";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { RangeBar } from "@/components/charts";
import { Icon } from "@/components/icons";

export const metadata = { title: "Labs · Aayu" };
export const dynamic = "force-dynamic";

export default async function LabsPage() {
  const ctx = await requireUser();
  const latest = await getLabs(ctx, { latestOnly: true, limit: 200 });
  const all = await getLabs(ctx, { limit: 800 });

  const flagged = latest.filter((l) => l.status !== "in_range");
  const inRange = latest.filter((l) => l.status === "in_range");
  const historyCount = new Map<string, number>();
  for (const result of all) historyCount.set(result.metric, (historyCount.get(result.metric) ?? 0) + 1);

  return (
    <>
      <AppBar
        title="Labs"
        subtitle={`${latest.length} markers · ${all.length} results on file`}
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

        {latest.length === 0 && (
          <div className="empty-state">
            <b>No lab results yet</b>
            Photograph a lab report on the Documents tab and Aayu will read the markers off it.
          </div>
        )}

        {flagged.length > 0 && (
          <>
            <div className="section-title"><span>Outside range · {flagged.length}</span></div>
            {flagged.map((result) => (
              <section className="card" key={result.id}>
                <div className="between">
                  <div>
                    <b style={{ fontSize: 14 }}>{result.label}</b>
                    <div style={{ fontSize: 11, color: "var(--txt-3)" }}>
                      {result.at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {result.panelName ? ` · ${result.panelName}` : ""}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 21, fontWeight: 600, color: statusColour(result.status) }}>
                    {formatValue(result.metric, result.value)}
                    <span style={{ fontSize: 10, color: "var(--txt-3)" }}> {result.unit}</span>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <RangeBar value={result.value} low={result.range.low} high={result.range.high} status={result.status} />
                </div>

                <p className="card-body" style={{ marginTop: 6 }}>
                  {result.range.low != null || result.range.high != null ? (
                    <>Reference {formatRange(result.range, result.unit)}, from {result.range.source}.</>
                  ) : (
                    <>No reference interval available for this marker.</>
                  )}
                  {result.target && (
                    <> Your applicable target is <b>{result.target.label}</b> — {result.target.because}.</>
                  )}
                </p>

                <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                  <Link href={`/metric/${result.metric}`} className="btn sm ghost">
                    {historyCount.get(result.metric) ?? 1} result{(historyCount.get(result.metric) ?? 1) === 1 ? "" : "s"} · trend
                  </Link>
                  <Link href={`/nadi?ask=${encodeURIComponent(`Why is my ${result.label.toLowerCase()} ${result.status === "above" ? "high" : "low"}?`)}`} className="btn sm">
                    <Icon name="sparkle" strokeWidth={2} /> Ask Nadi
                  </Link>
                </div>
              </section>
            ))}
          </>
        )}

        {inRange.length > 0 && (
          <>
            <div className="section-title"><span>In range · {inRange.length}</span></div>
            <section className="card rows">
              {inRange.map((result) => (
                <Link href={`/metric/${result.metric}`} className="row" key={result.id}>
                  <span className="tx">
                    <b>{result.label}</b>
                    <small>
                      {`ref ${formatRange(result.range)}`}
                      {" · "}
                      {result.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </small>
                  </span>
                  <span className="val">
                    {formatValue(result.metric, result.value)}
                    <small>{result.unit}</small>
                  </span>
                  <Icon name="chevron" className="chev" strokeWidth={2} />
                </Link>
              ))}
            </section>
          </>
        )}

        <p className="disclaimer">
          A reference interval from your own lab always takes precedence over the population default.
          Where a condition changes your target, both are shown — they answer different questions.
        </p>
      </main>
    </>
  );
}

function statusColour(status: string): string {
  if (status === "above") return "var(--high)";
  if (status === "below") return "var(--low)";
  return "var(--txt)";
}

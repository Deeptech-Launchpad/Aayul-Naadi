import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConditions, getProfile, getSeries, ageFrom } from "@/lib/record";
import { METRICS, formatRange, formatValue, metric as metricDef, metricLabel, targetFor } from "@/lib/metrics";
import { AppBar } from "@/components/appbar";
import { TrendChart } from "@/components/charts";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 182, label: "6m" },
  { days: 365, label: "1y" },
  { days: 3650, label: "All" },
];

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  return { title: `${metricLabel(metric)} · Aayu` };
}

export default async function MetricPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const ctx = await requireUser();
  const { metric: metricKey } = await params;
  const { w } = await searchParams;

  if (!METRICS.some((m) => m.key === metricKey)) notFound();

  const days = WINDOWS.find((window) => window.label === w)?.days ?? 30;
  const from = new Date(Date.now() - days * 86_400_000);
  const [series, profile, conditions] = await Promise.all([
    getSeries(ctx, metricKey, { from }),
    getProfile(ctx),
    getConditions(ctx),
  ]);

  const def = metricDef(metricKey);
  const target = targetFor(metricKey, {
    conditions: conditions.filter((c) => c.active).map((c) => c.tag),
    age: ageFrom(profile.dob),
  });
  const stats = series.stats;
  const band = target
    ? { low: target.low ?? null, high: target.high ?? null }
    : { low: series.range.low ?? null, high: series.range.high ?? null };

  return (
    <>
      <AppBar
        title={series.label}
        subtitle={
          stats.latest
            ? `${formatValue(metricKey, stats.latest.value)} ${series.unit} · ${relative(stats.latest.at)}`
            : "No readings yet"
        }
        back="/record"
      />

      <main className="shell-body">
        <nav className="seg" aria-label="Time window">
          {WINDOWS.map((window) => (
            <Link
              key={window.label}
              href={`/metric/${metricKey}?w=${window.label}`}
              data-active={(w ?? "30d") === window.label}
            >
              {window.label}
            </Link>
          ))}
        </nav>

        <section className="card" style={{ padding: "12px 10px 6px" }}>
          <TrendChart
            points={series.points.map((p) => ({ at: p.at, value: p.value }))}
            status={series.status}
            band={band.low != null || band.high != null ? band : undefined}
            unit={series.unit}
            fromLabel={series.points[0]?.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()}
            toLabel="TODAY"
          />
        </section>

        {stats.count > 0 && (
          <div className="stat-row">
            <div className="stat">
              <div className="l">Average</div>
              <div className="v">{formatValue(metricKey, stats.mean!)}</div>
            </div>
            {stats.inRangePct != null && (
              <div className="stat">
                <div className="l">In range</div>
                <div className="v">{Math.round(stats.inRangePct)}%</div>
              </div>
            )}
            <div className="stat">
              <div className="l">Trend</div>
              <div className="v" style={{ color: trendColour(stats.trendPct, def.direction) }}>
                {stats.trendPct == null ? "—" : `${stats.trendPct > 0 ? "↗" : stats.trendPct < 0 ? "↘" : "→"} ${Math.abs(stats.trendPct).toFixed(0)}%`}
              </div>
            </div>
          </div>
        )}

        <section className="card flat">
          <div className="card-title"><span>Which range applies</span></div>
          <p className="card-body">
            {series.range.low != null || series.range.high != null ? (
              <>
                The reference interval is <b>{formatRange(series.range, series.unit)}</b>, from{" "}
                {series.range.source}.
              </>
            ) : (
              <>There is no published reference interval for {series.label.toLowerCase()} — it is tracked as a trend rather than against a range.</>
            )}
            {target && (
              <> Because of {target.because}, your applicable target is <b>{target.label}</b>, and that is the band drawn on the chart.</>
            )}
          </p>
        </section>

        {stats.previousMean != null && stats.mean != null && (
          <section className="card">
            <div className="card-title"><span>Compared with the previous {days} days</span></div>
            <p className="card-body">
              This window averages <b>{formatValue(metricKey, stats.mean)} {series.unit}</b> against{" "}
              <b>{formatValue(metricKey, stats.previousMean)}</b> before it — a change of{" "}
              <b>{stats.mean > stats.previousMean ? "+" : ""}{formatValue(metricKey, stats.mean - stats.previousMean)}</b>.
              Range this window: {formatValue(metricKey, stats.min!)}–{formatValue(metricKey, stats.max!)}.
            </p>
          </section>
        )}

        <Link
          href={`/nadi?ask=${encodeURIComponent(`What is happening with my ${series.label.toLowerCase()} over the last ${days} days?`)}`}
          className="btn ghost md"
        >
          <Icon name="sparkle" strokeWidth={2} /> Ask Nadi about this trend
        </Link>

        {series.points.length > 0 && (
          <>
            <div className="section-title"><span>Readings · newest first</span></div>
            <section className="card rows">
              {[...series.points].reverse().slice(0, 40).map((point) => (
                <div className="row" key={point.id}>
                  <span className="tx">
                    <b>{point.at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b>
                    <small>
                      {point.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {point.note ? ` · ${point.note}` : ""}
                      {point.source !== "manual" ? ` · ${sourceLabel(point.source)}` : " · logged by you"}
                    </small>
                  </span>
                  <span className="val">
                    {formatValue(metricKey, point.value)}
                    <small>{series.unit}</small>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function relative(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sourceLabel(source: string): string {
  return source.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function trendColour(trendPct: number | null, direction?: string): string {
  if (trendPct == null || Math.abs(trendPct) < 3) return "var(--txt)";
  const rising = trendPct > 0;
  if (direction === "higher") return rising ? "var(--ok)" : "var(--watch)";
  if (direction === "lower") return rising ? "var(--watch)" : "var(--ok)";
  return "var(--txt)";
}

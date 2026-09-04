import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDailyRead } from "@/lib/summaries";
import { evaluateCareGaps, intervalLabel } from "@/lib/caregaps";
import { getLabs, getProfile, getSeries, getMedicationsWithAdherence } from "@/lib/record";
import { formatRange, formatValue, metric, metricLabel, toDisplay } from "@/lib/metrics";
import { nadiAvailable } from "@/lib/nadi";
import { AppBar, IconLink } from "@/components/appbar";
import { Icon } from "@/components/icons";
import { Sparkline } from "@/components/charts";
import { audit } from "@/lib/audit";

export const metadata = { title: "Today · Aayu" };
export const dynamic = "force-dynamic";

/** The four metrics on the dashboard, in priority order of what tends to move. */
const TILE_METRICS = ["glucose_fasting", "sleep_duration", "steps", "bp_systolic", "weight", "resting_hr"];

export default async function TodayPage() {
  const ctx = await requireUser();
  const [profile, gaps, labs, meds] = await Promise.all([
    getProfile(ctx),
    evaluateCareGaps(ctx),
    getLabs(ctx, { latestOnly: true, limit: 80 }),
    getMedicationsWithAdherence(ctx, 30),
  ]);

  const series = await Promise.all(
    TILE_METRICS.map((key) => getSeries(ctx, key, { from: new Date(Date.now() - 30 * 86_400_000) })),
  );
  const withData = series.filter((s) => s.points.length > 0).slice(0, 4);
  const dailyRead = await getDailyRead(ctx);

  await audit({ userId: ctx.user.id, action: "record.read", resource: "dashboard" });

  const flagged = labs.filter((l) => l.status !== "in_range");
  const outstanding = gaps.filter((g) => g.status === "overdue" || g.status === "due_soon" || g.status === "never_done");
  const attention = [
    ...flagged.map((l) => ({
      key: `lab-${l.id}`,
      href: `/metric/${l.metric}`,
      tone: l.status === "above" ? "h" : "l",
      title: `${l.label} ${l.status === "above" ? "above" : "below"} range`,
      detail: `${formatValue(l.metric, l.value)} ${l.unit} · ref ${formatRange(l.range)} · ${dateLabel(l.at)}`,
      pill: l.status,
      pillText: l.status === "above" ? "High" : "Low",
    })),
    ...outstanding.slice(0, 4).map((g) => ({
      key: `gap-${g.rule.id}`,
      href: "/care",
      tone: g.status === "overdue" || g.status === "never_done" ? "h" : "w",
      title:
        g.status === "overdue"
          ? `${g.rule.title} overdue`
          : g.status === "never_done"
            ? `${g.rule.title} not recorded`
            : `${g.rule.title} due in ${g.daysUntilDue} days`,
      detail: g.evidence ? `Last: ${g.evidence}` : `${intervalLabel(g.rule)} · ${g.rule.guideline}`,
      pill: g.status === "due_soon" ? "watch" : "high",
      pillText: g.status === "overdue" ? `${g.monthsOverdue ?? 0}mo late` : g.status === "never_done" ? "Not done" : `${g.daysUntilDue}d`,
    })),
  ];

  const dueToday = meds.reduce((count, med) => count + med.schedule.length, 0);
  const changeCount = attention.length;
  const initials = (profile.displayName ?? ctx.user.email)
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <>
      <AppBar
        title={weekdayLabel()}
        subtitle={`${longDate()} · ${changeCount === 0 ? "nothing needs attention" : `${changeCount} need${changeCount === 1 ? "s" : ""} attention`}`}
        actions={
          <>
            <IconLink href="/log" icon="plus" label="Log a reading" />
            <Link href="/profile" className="avatar" aria-label="Profile">{initials || "AA"}</Link>
          </>
        }
      />

      <main className="shell-body">
        {dailyRead ? (
          <section className="card tint">
            <div className="card-title">
              <span className="accent">Nadi · your morning read</span>
              <span>{timeLabel(dailyRead.generatedAt)}</span>
            </div>
            <p className="card-body">{dailyRead.text}</p>
            {dailyRead.citations.length > 0 && (
              <div className="cites">
                {dailyRead.citations.map((citation, i) => (
                  <span className="cite" key={i}>{citation.label} · {citation.detail}</span>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="card flat">
            <div className="card-title"><span>Morning read</span></div>
            <p className="card-body">
              {nadiAvailable()
                ? "Nadi will write your morning read once there is a little more in the record — a few readings or a lab panel is enough."
                : "Set ANTHROPIC_API_KEY on the server to have Nadi read your record each morning. Everything else works without it."}
            </p>
          </section>
        )}

        <section className="tiles">
          {withData.length === 0 && (
            <div className="tile empty wide" style={{ gridColumn: "1 / -1" }}>
              Nothing measured yet. <Link href="/log">Log your first reading</Link>.
            </div>
          )}
          {withData.map((s) => {
            const latest = s.stats.latest!;
            const shown = toDisplay(s.metric, latest.value, ctx.user.units);
            const delta =
              s.stats.previousMean != null ? latest.value - s.stats.previousMean : null;
            const def = metric(s.metric);
            const better = def.direction === "higher" ? 1 : def.direction === "lower" ? -1 : 0;
            const deltaClass =
              delta == null || Math.abs(delta) < (def.decimals === 0 ? 1 : 0.05)
                ? "flat"
                : better === 0
                  ? "flat"
                  : (delta > 0 ? 1 : -1) === better
                    ? "dn"
                    : "up";

            return (
              <Link href={`/metric/${s.metric}`} className="tile" key={s.metric}>
                <span className={`sevbar ${s.status}`} />
                <div className="lb">{metricLabel(s.metric)}</div>
                <div className="nm">
                  {formatValue(s.metric, shown.value)}
                  {shown.unit && !["h"].includes(shown.unit) && <sup>{shown.unit}</sup>}
                </div>
                <div className="dl">
                  {delta != null ? (
                    <>
                      <span className={deltaClass}>
                        {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {formatValue(s.metric, Math.abs(delta))}
                      </span>
                      vs 30-day avg
                    </>
                  ) : (
                    <>{s.stats.count} reading{s.stats.count === 1 ? "" : "s"} · 30 days</>
                  )}
                </div>
                <Sparkline values={s.points.map((p) => p.value)} status={s.status} />
              </Link>
            );
          })}
        </section>

        {attention.length > 0 && (
          <>
            <div className="section-title">
              <span>Needs attention</span>
              <Link href="/care">See all</Link>
            </div>
            <section className="card rows">
              {attention.slice(0, 5).map((item) => (
                <Link href={item.href} className="row" key={item.key}>
                  <span className={`ic ${item.tone}`}>
                    <Icon name={item.tone === "h" ? "alert" : item.tone === "w" ? "calendar" : "activity"} />
                  </span>
                  <span className="tx">
                    <b>{item.title}</b>
                    <small>{item.detail}</small>
                  </span>
                  <span className={`pill ${item.pill}`}>{item.pillText}</span>
                </Link>
              ))}
            </section>
          </>
        )}

        {meds.length > 0 && (
          <>
            <div className="section-title">
              <span>Medications</span>
              <Link href="/care/medications">Manage</Link>
            </div>
            <section className="card rows">
              {meds.slice(0, 3).map((med) => (
                <Link href="/care/medications" className="row" key={med.id}>
                  <span className="ic j"><Icon name="pill" /></span>
                  <span className="tx">
                    <b>{med.name}{med.dose ? ` ${med.dose}` : ""}</b>
                    <small>
                      {med.schedule.length ? med.schedule.join(", ") : "As needed"}
                      {med.daysRemaining != null ? ` · ${med.daysRemaining} days left` : ""}
                    </small>
                  </span>
                  {med.adherence != null && (
                    <span className={`pill ${med.adherence >= 0.9 ? "ok" : "watch"}`}>
                      {Math.round(med.adherence * 100)}%
                    </span>
                  )}
                </Link>
              ))}
            </section>
          </>
        )}

        <p className="disclaimer">
          Aayu is your own record and a reading of it. It is not a medical device, it does not
          diagnose, and it does not replace your clinician.{dueToday ? "" : ""}
        </p>
      </main>
    </>
  );
}

function weekdayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long" });
}
function longDate(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}
function timeLabel(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dateLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAllergies, getMedicationsWithAdherence } from "@/lib/record";
import { checkAllergies, checkInteractions, CHECK_DISCLAIMER } from "@/lib/interactions";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { AdherenceGrid } from "@/components/charts";
import { Icon } from "@/components/icons";
import { recordDoseAction } from "@/app/actions/care";
import { MedicationEditor, AllergyEditor } from "@/components/health-editors";

export const metadata = { title: "Medications · Aayu" };
export const dynamic = "force-dynamic";

export default async function MedicationsPage() {
  const ctx = await requireUser();
  const [meds, allergies] = await Promise.all([
    getMedicationsWithAdherence(ctx, 30),
    getAllergies(ctx),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysDoses = await db.doseEvent.findMany({
    where: { userId: ctx.user.id, scheduledAt: { gte: startOfDay } },
  });

  const last30 = await db.doseEvent.findMany({
    where: { userId: ctx.user.id, scheduledAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { scheduledAt: "asc" },
  });

  const interactions = checkInteractions(meds);
  const allergyFindings = checkAllergies(meds, allergies.map((a) => ({ substance: a.substance, severity: a.severity })));

  // One cell per day: taken if every scheduled dose that day was taken.
  const byDay = new Map<string, { taken: number; total: number }>();
  for (const dose of last30) {
    const key = dose.scheduledAt.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { taken: 0, total: 0 };
    entry.total += 1;
    if (dose.status === "taken") entry.taken += 1;
    byDay.set(key, entry);
  }
  const grid: Array<"taken" | "missed" | "none"> = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const entry = byDay.get(day);
    if (!entry || entry.total === 0) return "none";
    return entry.taken === entry.total ? "taken" : "missed";
  });

  const overallTaken = last30.filter((d) => d.status === "taken").length;
  const overallRate = last30.length ? Math.round((overallTaken / last30.length) * 100) : null;

  return (
    <>
      <AppBar
        title="Medications"
        subtitle={`${meds.length} active${overallRate != null ? ` · ${overallRate}% taken this month` : ""}`}
      />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/care", label: "Screenings" },
            { href: "/care/medications", label: "Medications" },
            { href: "/care/visit-prep", label: "Visit prep" },
          ]}
        />

        {meds.length > 0 && (
          <section className="card tint">
            <div className="card-title">
              <span className="accent">Today</span>
              <span>
                {todaysDoses.filter((d) => d.status === "taken").length} of{" "}
                {meds.reduce((sum, m) => sum + m.schedule.length, 0)} taken
              </span>
            </div>
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {meds.flatMap((med) =>
                med.schedule.map((time) => {
                  const [hour, minute] = time.split(":").map(Number);
                  const scheduledAt = new Date();
                  scheduledAt.setHours(hour, minute, 0, 0);
                  const dose = todaysDoses.find(
                    (d) => d.medicationId === med.id && d.scheduledAt.getTime() === scheduledAt.getTime(),
                  );
                  const taken = dose?.status === "taken";
                  const future = scheduledAt.getTime() > Date.now();

                  return (
                    <form
                      action={recordDoseAction}
                      key={`${med.id}-${time}`}
                      className="between"
                      style={{
                        background: "var(--surface)",
                        borderRadius: 11,
                        padding: "9px 11px",
                        opacity: future && !taken ? 0.6 : 1,
                      }}
                    >
                      <input type="hidden" name="medicationId" value={med.id} />
                      <input type="hidden" name="scheduledAt" value={scheduledAt.toISOString()} />
                      <input type="hidden" name="status" value={taken ? "skipped" : "taken"} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 13, display: "block" }}>{med.name}{med.dose ? ` ${med.dose}` : ""}</b>
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--txt-3)" }}>{time}</span>
                      </span>
                      <button
                        type="submit"
                        className={`btn sm ${taken ? "" : "ghost"}`}
                        style={{ minWidth: 92 }}
                        aria-label={taken ? `Undo ${med.name} at ${time}` : `Mark ${med.name} at ${time} taken`}
                      >
                        {taken ? <><Icon name="check" size={14} strokeWidth={2.4} /> Taken</> : future ? "Later" : "Take"}
                      </button>
                    </form>
                  );
                }),
              )}
            </div>
          </section>
        )}

        {allergyFindings.length > 0 && (
          <div className="notice error">
            <Icon name="alert" />
            <span>
              <b>Allergy match.</b>{" "}
              {allergyFindings.map((finding) => `${finding.medication} — ${finding.reason}`).join(" ")}
            </span>
          </div>
        )}

        {interactions.length > 0 ? (
          interactions.map((finding, i) => (
            <div className={`notice ${finding.severity === "serious" ? "error" : "warn"}`} key={i}>
              <Icon name="alert" />
              <span>
                <b>{finding.a} + {finding.b}.</b> {finding.effect} {finding.advice}
              </span>
            </div>
          ))
        ) : meds.length > 1 ? (
          <div className="notice info">
            <Icon name="check" />
            <span>
              <b>No known interactions</b> among your {meds.length} active medications
              {allergies.length > 0 && allergyFindings.length === 0 ? ", and none of them match a recorded allergy" : ""}.
            </span>
          </div>
        ) : null}

        {meds.length > 0 && (
          <>
            <div className="section-title"><span>Active</span></div>
            <section className="card rows">
              {meds.map((med) => (
                <div className="row" key={med.id}>
                  <span className="ic j"><Icon name="pill" /></span>
                  <span className="tx">
                    <b>{med.name}{med.dose ? ` ${med.dose}` : ""}</b>
                    <small>
                      {med.schedule.length ? med.schedule.join(", ") : "As needed"}
                      {med.purpose ? ` · ${med.purpose}` : ""}
                      {med.daysRemaining != null ? ` · ${med.daysRemaining} days of supply` : ""}
                    </small>
                  </span>
                  {med.adherence != null && (
                    <span className={`pill ${med.adherence >= 0.9 ? "ok" : med.adherence >= 0.75 ? "watch" : "high"}`}>
                      {Math.round(med.adherence * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </section>

            {meds.some((m) => m.daysRemaining != null && m.daysRemaining <= 10) && (
              <div className="notice warn">
                <Icon name="clock" />
                <span>
                  <b>Refill soon.</b>{" "}
                  {meds
                    .filter((m) => m.daysRemaining != null && m.daysRemaining <= 10)
                    .map((m) => `${m.name} has about ${m.daysRemaining} days left`)
                    .join("; ")}
                  . Projected from your dose schedule and the quantity you recorded.
                </span>
              </div>
            )}

            <div className="section-title"><span>Adherence · 30 days</span></div>
            <section className="card">
              <AdherenceGrid days={grid} />
              <p className="disclaimer" style={{ marginTop: 10 }}>
                A day counts as taken only when every scheduled dose that day was marked. Adherence
                is what lets Nadi rule a missed dose <em>out</em> as an explanation.
              </p>
            </section>
          </>
        )}

        <MedicationEditor medications={meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, schedule: m.schedule }))} />
        <AllergyEditor allergies={allergies.map((a) => ({ id: a.id, substance: a.substance, reaction: a.reaction, severity: a.severity ?? "unknown" }))} />

        <p className="disclaimer">{CHECK_DISCLAIMER}</p>
      </main>
    </>
  );
}

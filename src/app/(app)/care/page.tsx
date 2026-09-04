import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { evaluateCareGaps, intervalLabel, CARE_RULES } from "@/lib/caregaps";
import { db } from "@/lib/db";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { Icon } from "@/components/icons";
import { markCareGapDoneAction, dismissCareGapAction, restoreCareGapAction } from "@/app/actions/care";

export const metadata = { title: "Care · Aayu" };
export const dynamic = "force-dynamic";

export default async function CarePage() {
  const ctx = await requireUser();
  const [gaps, hiddenStates] = await Promise.all([
    evaluateCareGaps(ctx),
    db.careGapState.findMany({ where: { userId: ctx.user.id, dismissed: true } }),
  ]);

  const urgent = gaps.filter((g) => g.status === "overdue");
  const soon = gaps.filter((g) => g.status === "due_soon" || g.status === "never_done");
  const done = gaps.filter((g) => g.status === "up_to_date");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <AppBar
        title="Care"
        subtitle={`${urgent.length} overdue · ${soon.length} outstanding · ${done.length} up to date`}
      />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/care", label: "Screenings" },
            { href: "/care/medications", label: "Medications" },
            { href: "/care/visit-prep", label: "Visit prep" },
          ]}
        />

        {gaps.length === 0 && (
          <div className="empty-state">
            <b>No screening rules apply yet</b>
            Add your date of birth and sex at birth in your profile and the guideline rules will
            start matching.
            <div style={{ marginTop: 14 }}>
              <Link href="/profile" className="btn sm ghost">Complete your profile</Link>
            </div>
          </div>
        )}

        {urgent.map((gap) => (
          <section className="card danger" key={gap.rule.id} style={{ overflow: "hidden" }}>
            <span className="sevbar high" />
            <div style={{ paddingLeft: 8 }}>
              <div className="card-title">
                <span style={{ color: "var(--high)" }}>
                  Overdue{gap.monthsOverdue ? ` · ${gap.monthsOverdue} month${gap.monthsOverdue === 1 ? "" : "s"}` : ""}
                </span>
                <span>{intervalLabel(gap.rule)}</span>
              </div>
              <h2 style={{ fontSize: 16, marginTop: 6 }}>{gap.rule.title}</h2>
              <p className="card-body">{gap.rule.detail}</p>
              <div className="cites" style={{ marginTop: 8 }}>
                <span className="cite">{gap.rule.guideline}</span>
                <span className="cite">Applies because {gap.because}</span>
              </div>
              {gap.evidence && <p className="disclaimer" style={{ marginTop: 8 }}>Last: {gap.evidence}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                <form action={markCareGapDoneAction} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="ruleId" value={gap.rule.id} />
                  <input type="date" name="doneAt" defaultValue={today} className="input mono" style={{ height: 34, width: 140, fontSize: 12 }} aria-label="Date done" />
                  <button type="submit" className="btn sm">Mark as done</button>
                </form>
                <Link href={`/nadi?ask=${encodeURIComponent(`Tell me about the ${gap.rule.title.toLowerCase()} and why it applies to me.`)}`} className="btn sm ghost">
                  <Icon name="sparkle" size={14} strokeWidth={2} /> Ask Nadi
                </Link>
                <form action={dismissCareGapAction}>
                  <input type="hidden" name="ruleId" value={gap.rule.id} />
                  <button type="submit" className="btn sm ghost">Not relevant</button>
                </form>
              </div>
            </div>
          </section>
        ))}

        {soon.length > 0 && (
          <>
            <div className="section-title"><span>Outstanding</span></div>
            <section className="card rows">
              {soon.map((gap) => (
                <details key={gap.rule.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <summary className="row" style={{ cursor: "pointer", listStyle: "none", borderBottom: 0 }}>
                    <span className={`ic ${gap.status === "due_soon" ? "w" : ""}`}>
                      <Icon name={gap.rule.category === "immunisation" ? "shield" : gap.rule.category === "lab" ? "flask" : "calendar"} />
                    </span>
                    <span className="tx">
                      <b>{gap.rule.title}</b>
                      <small>{gap.evidence ?? `Not recorded · ${intervalLabel(gap.rule)}`}</small>
                    </span>
                    <span className={`pill ${gap.status === "due_soon" ? "watch" : ""}`}>
                      {gap.status === "due_soon" ? `${gap.daysUntilDue}d` : "Not done"}
                    </span>
                  </summary>
                  <div style={{ padding: "0 0 12px 45px" }}>
                    <p className="card-body">{gap.rule.detail}</p>
                    <div className="cites" style={{ marginTop: 7 }}>
                      <span className="cite">{gap.rule.guideline}</span>
                      <span className="cite">Because {gap.because}</span>
                    </div>
                    <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                      <form action={markCareGapDoneAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="ruleId" value={gap.rule.id} />
                        <input type="hidden" name="doneAt" value={today} />
                        <button type="submit" className="btn sm ghost">Mark as done today</button>
                      </form>
                      <form action={dismissCareGapAction}>
                        <input type="hidden" name="ruleId" value={gap.rule.id} />
                        <button type="submit" className="btn sm ghost">Hide</button>
                      </form>
                    </div>
                  </div>
                </details>
              ))}
            </section>
          </>
        )}

        {done.length > 0 && (
          <>
            <div className="section-title"><span>Up to date</span></div>
            <section className="card rows">
              {done.map((gap) => (
                <div className="row" key={gap.rule.id}>
                  <span className="ic j"><Icon name="check" strokeWidth={2.4} /></span>
                  <span className="tx">
                    <b>{gap.rule.title}</b>
                    <small>
                      {gap.dueAt
                        ? `Next due ${gap.dueAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
                        : "No repeat needed"}
                      {gap.evidence ? ` · ${gap.evidence}` : ""}
                    </small>
                  </span>
                  <span className="pill ok">Done</span>
                </div>
              ))}
            </section>
          </>
        )}

        {hiddenStates.length > 0 && (
          <details className="card">
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Hidden · {hiddenStates.length}
            </summary>
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {hiddenStates.map((state) => {
                const rule = CARE_RULES.find((r) => r.id === state.ruleId);
                return (
                  <form action={restoreCareGapAction} key={state.ruleId} className="between">
                    <span style={{ fontSize: 13 }}>{rule?.title ?? state.ruleId}</span>
                    <input type="hidden" name="ruleId" value={state.ruleId} />
                    <button type="submit" className="btn sm ghost">Restore</button>
                  </form>
                );
              })}
            </div>
          </details>
        )}

        <p className="disclaimer">
          These come from published guidelines for your age, sex and recorded conditions, matched by
          a rules table rather than by a model — which is why each one can show its source. They are
          a prompt for a conversation with your clinician, not a diagnosis.
        </p>
      </main>
    </>
  );
}

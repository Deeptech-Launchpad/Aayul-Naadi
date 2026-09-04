import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ageFrom, getAllergies, getConditions, getMedications, getProfile } from "@/lib/record";
import { AppBar } from "@/components/appbar";
import { Icon } from "@/components/icons";
import { signOutAction } from "@/app/actions/auth";

export const metadata = { title: "Profile · Aayu" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await requireUser();
  const [profile, conditions, allergies, meds, sessions, codes] = await Promise.all([
    getProfile(ctx),
    getConditions(ctx),
    getAllergies(ctx),
    getMedications(ctx, { active: true }),
    db.session.count({ where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.recoveryCode.count({ where: { userId: ctx.user.id, usedAt: null } }),
  ]);

  const age = ageFrom(profile.dob);
  const activeConditions = conditions.filter((c) => c.active);

  // Completeness is only useful if it names the next thing worth doing.
  const gaps: Array<{ label: string; href: string; benefit: string }> = [];
  if (!profile.dob) gaps.push({ label: "date of birth", href: "/profile/edit", benefit: "so age-based screening rules can apply" });
  if (!profile.sexAtBirth) gaps.push({ label: "sex at birth", href: "/profile/edit", benefit: "so the right reference ranges apply" });
  if (!profile.heightCm) gaps.push({ label: "height", href: "/profile/edit", benefit: "so BMI can be computed" });
  if (!profile.familyHistory?.length) gaps.push({ label: "family history", href: "/onboarding/family", benefit: "it can move a screening years earlier" });
  if (!activeConditions.length) gaps.push({ label: "your conditions", href: "/profile/edit", benefit: "they change targets and screening intervals" });
  if (!profile.lifestyle?.smoking) gaps.push({ label: "smoking status", href: "/onboarding/family", benefit: "it decides lung screening eligibility" });

  const fields = 6;
  const completeness = Math.round(((fields - gaps.length) / fields) * 100);
  const initials = (profile.displayName ?? ctx.user.email)
    .split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <>
      <AppBar
        title={profile.displayName || "Your profile"}
        subtitle={[age != null ? `${age} years` : null, profile.sexAtBirth, profile.bloodType, profile.heightCm ? `${profile.heightCm} cm` : null]
          .filter(Boolean)
          .join(" · ") || "Profile not filled in yet"}
        actions={<span className="avatar">{initials || "AA"}</span>}
      />

      <main className="shell-body">
        <section className="card tint">
          <div className="card-title"><span className="accent">Profile completeness</span><span>{completeness}%</span></div>
          <div className="prog" style={{ marginTop: 9 }}><i style={{ width: `${completeness}%` }} /></div>
          {gaps.length > 0 ? (
            <p className="card-body">
              Add <Link href={gaps[0].href}><b>{gaps[0].label}</b></Link> — {gaps[0].benefit}.
              {gaps.length > 1 && ` ${gaps.length - 1} other field${gaps.length === 2 ? "" : "s"} still empty.`}
            </p>
          ) : (
            <p className="card-body">Everything the rules and reference ranges need is filled in.</p>
          )}
        </section>

        <div className="section-title"><span>Your record</span></div>
        <section className="card rows">
          <Link href="/profile/edit" className="row">
            <span className="ic j"><Icon name="user" /></span>
            <span className="tx">
              <b>Personal &amp; biometrics</b>
              <small>Date of birth, sex, height, blood type, ancestry</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          <Link href="/profile/edit" className="row">
            <span className="ic j"><Icon name="drop" /></span>
            <span className="tx">
              <b>Conditions</b>
              <small>{activeConditions.length ? activeConditions.map((c) => c.name).join(", ") : "None recorded"}</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          <Link href="/care/medications" className="row">
            <span className="ic j"><Icon name="pill" /></span>
            <span className="tx">
              <b>Medications &amp; allergies</b>
              <small>{meds.length} active · {allergies.length} allerg{allergies.length === 1 ? "y" : "ies"}</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          <Link href="/onboarding/family" className="row">
            <span className={`ic ${profile.familyHistory?.length ? "j" : "w"}`}><Icon name="heart" /></span>
            <span className="tx">
              <b>Family history</b>
              <small>
                {profile.familyHistory?.length
                  ? `${profile.familyHistory.length} relative${profile.familyHistory.length === 1 ? "" : "s"} recorded`
                  : "Not recorded"}
              </small>
            </span>
            {!profile.familyHistory?.length && <span className="pill watch">Add</span>}
          </Link>
          <Link href="/onboarding/family" className="row">
            <span className="ic j"><Icon name="activity" /></span>
            <span className="tx">
              <b>Lifestyle &amp; goals</b>
              <small>
                {[profile.lifestyle?.smoking && `${profile.lifestyle.smoking} smoker`, profile.lifestyle?.diet, profile.goals?.steps ? `${profile.goals.steps} steps` : null]
                  .filter(Boolean)
                  .join(" · ") || "Not recorded"}
              </small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          {ctx.user.consent && (ctx.user.consent as Record<string, boolean>).reproductive && (
            <Link href="/profile/edit" className="row">
              <span className="ic j"><Icon name="clock" /></span>
              <span className="tx">
                <b>Reproductive health</b>
                <small>{profile.reproductive ? "Recorded" : "Not recorded"}</small>
              </span>
              <Icon name="chevron" className="chev" strokeWidth={2} />
            </Link>
          )}
        </section>

        <div className="section-title"><span>Account</span></div>
        <section className="card rows">
          <Link href="/profile/security" className="row">
            <span className="ic j"><Icon name="shield" /></span>
            <span className="tx">
              <b>Security &amp; privacy</b>
              <small>
                {ctx.user.totpEnabled ? "2FA on" : "2FA off"} · {sessions} device{sessions === 1 ? "" : "s"} · {codes} recovery codes
              </small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          <Link href="/profile/audit" className="row">
            <span className="ic j"><Icon name="record" /></span>
            <span className="tx">
              <b>Access log, export &amp; erase</b>
              <small>Every read and write of your health data</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
          <Link href="/record/sources" className="row">
            <span className="ic j"><Icon name="link" /></span>
            <span className="tx">
              <b>Connected sources &amp; import</b>
              <small>{ctx.user.units === "metric" ? "Metric units" : "Imperial units"} · {ctx.user.email}</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </Link>
        </section>

        <form action={signOutAction}>
          <button type="submit" className="btn ghost md">
            <Icon name="logout" /> Sign out
          </button>
        </form>

        <p className="disclaimer">
          Aayu is a personal tool for managing your own record. It is not a medical device, does not
          diagnose, and does not provide treatment advice.
        </p>
      </main>
    </>
  );
}

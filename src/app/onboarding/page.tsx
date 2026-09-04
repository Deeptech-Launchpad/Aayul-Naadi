import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { acceptConsentAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/form";
import { StepHeader } from "@/components/steps";
import { Icon } from "@/components/icons";
import { CONSENT_LABELS, type ConsentCategories } from "@/lib/types";

export const metadata = { title: "What Nadi may read · Aayu" };

export default async function ConsentPage() {
  const session = await currentSession();
  if (!session) redirect("/signin");
  const consent = (session.user.consent ?? {}) as ConsentCategories;
  const hasChosen = session.user.consentAt != null;

  return (
    <>
      <StepHeader
        step={1}
        title="What Nadi may read"
        intro="Nadi only sees the categories you switch on here, and only the slices relevant to the question you ask. You can change any of this later under Profile → Security & privacy."
      />

      <ActionForm action={acceptConsentAction}>
        <div className="card rows">
          {CONSENT_LABELS.map((item) => (
            <label className="row" key={item.key} style={{ cursor: "pointer" }}>
              <span className={`ic ${item.defaultOn ? "j" : ""}`}>
                <Icon name={iconFor(item.key)} />
              </span>
              <span className="tx">
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </span>
              <input
                type="checkbox"
                name={item.key}
                defaultChecked={hasChosen ? consent[item.key] === true : item.defaultOn}
                style={{ width: 20, height: 20, accentColor: "var(--jade)" }}
                aria-label={item.title}
              />
            </label>
          ))}
        </div>

        <div className="notice info">
          <Icon name="shield" />
          <span>
            Your data is never used to train any model. Requests to Claude carry your health values
            but not your name, email, address or record identifiers.
          </span>
        </div>

        <SubmitButton pendingLabel="Saving…">Agree &amp; continue</SubmitButton>
      </ActionForm>

      <p className="disclaimer">
        Sensitive categories start switched off and have to be turned on deliberately. A category
        that is off is excluded when the record is queried, not filtered out afterwards.
      </p>
    </>
  );
}

function iconFor(key: string) {
  switch (key) {
    case "labs_vitals": return "flask" as const;
    case "wearables": return "activity" as const;
    case "documents": return "file" as const;
    case "profile": return "user" as const;
    default: return "clock" as const;
  }
}

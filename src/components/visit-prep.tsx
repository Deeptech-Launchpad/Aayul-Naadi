"use client";

import { useActionState, useState } from "react";
import { createShareLinkAction, draftVisitPrepAction, type VisitPrepState } from "@/app/actions/share";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";

const WINDOWS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 3 months" },
  { days: 180, label: "Last 6 months" },
];

export function VisitPrep({
  facts,
  available,
  activeShareCount,
}: {
  facts: { flaggedLabs: string[]; movingSeries: string[]; careGaps: string[]; adherence: string[] };
  available: boolean;
  activeShareCount: number;
}) {
  const [draftState, draftAction] = useActionState(draftVisitPrepAction, {} as VisitPrepState);
  const [shareState, shareAction] = useActionState(createShareLinkAction, {} as VisitPrepState);
  const [days, setDays] = useState(90);
  const [copied, setCopied] = useState(false);

  const summary = shareState.summary ?? draftState.summary;
  const questions = shareState.questions ?? draftState.questions ?? [];
  const shareUrl = shareState.shareUrl;

  const factCount =
    facts.flaggedLabs.length + facts.movingSeries.length + facts.careGaps.length;

  return (
    <div className="stack">
      <section className="card flat">
        <div className="card-title"><span>What Aayu has for this visit</span><span>{factCount} facts</span></div>
        <p className="card-body">
          These are computed from your record, not written by a model. Nadi turns them into a note
          and a set of questions — it does not add facts of its own.
        </p>
        <div className="stack-sm" style={{ marginTop: 11 }}>
          <FactList title="Outside range" items={facts.flaggedLabs} tone="high" />
          <FactList title="Moved recently" items={facts.movingSeries} tone="watch" />
          <FactList title="Care gaps" items={facts.careGaps} tone="watch" />
          <FactList title="Adherence" items={facts.adherence} tone="ok" />
        </div>
      </section>

      <form action={draftAction} className="stack-sm">
        <FormError message={draftState.error} />
        <div className="field">
          <span className="label">Interval</span>
          <div className="seg">
            {WINDOWS.map((window) => (
              <button type="button" key={window.days} data-active={days === window.days} onClick={() => setDays(window.days)}>
                {window.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="days" value={days} />
        </div>
        <SubmitButton className="btn md" pendingLabel="Drafting…">
          <Icon name="sparkle" strokeWidth={2} />
          {summary ? "Redraft with Nadi" : "Draft the note with Nadi"}
        </SubmitButton>
        {!available && (
          <p className="disclaimer">
            Nadi needs ANTHROPIC_API_KEY to draft. The facts above are complete without it — you can
            take them to your appointment as they are.
          </p>
        )}
      </form>

      {summary && (
        <form action={shareAction} className="stack">
          <FormError message={shareState.error} />
          <input type="hidden" name="summary" value={summary} />

          <div className="section-title"><span>Summary</span></div>
          <section className="card"><p className="card-body">{summary}</p></section>

          {questions.length > 0 && (
            <>
              <div className="section-title"><span>Ask about</span></div>
              <section className="card rows">
                {questions.map((question, i) => (
                  <div className="row" key={i}>
                    <span className="ic j mono" style={{ fontSize: 12, fontWeight: 600 }}>{i + 1}</span>
                    <span className="tx"><b style={{ fontWeight: 500 }}>{question}</b></span>
                    <input type="hidden" name="question" value={question} />
                  </div>
                ))}
              </section>
            </>
          )}

          <div className="notice warn">
            <Icon name="shield" />
            <span>
              A share link opens read-only, expires in <b>seven days</b>, can be revoked at any time,
              and every open is recorded in your access log. It is the only route by which anything
              leaves your account.
            </span>
          </div>

          <div className="btn-row">
            <button type="button" className="btn ghost md" onClick={() => window.print()}>
              <Icon name="file" /> Print / save PDF
            </button>
            <SubmitButton className="btn md" pendingLabel="Creating…">
              <Icon name="share" /> Create share link
            </SubmitButton>
          </div>
        </form>
      )}

      {shareUrl && (
        <section className="card tint">
          <div className="card-title">
            <span className="accent">Share link created</span>
            <span>
              Expires {shareState.expiresAt ? new Date(shareState.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
            </span>
          </div>
          <div className="card flat mono" style={{ marginTop: 10, fontSize: 11, wordBreak: "break-all", padding: "9px 11px" }}>
            {shareUrl}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn ghost md"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
            >
              <Icon name={copied ? "check" : "link"} /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>
      )}

      {activeShareCount > 0 && (
        <p className="disclaimer">
          You have {activeShareCount} active share link{activeShareCount === 1 ? "" : "s"}. Revoke
          them from your access log at any time.
        </p>
      )}
    </div>
  );
}

function FactList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className={`pill ${tone}`}>{title}</span>
      <ul style={{ margin: "7px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--txt-2)", lineHeight: 1.55 }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}

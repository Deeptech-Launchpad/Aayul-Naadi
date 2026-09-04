"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { Citation } from "@/lib/types";

type Message = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  citations: Citation[];
};

export function Chat({
  conversationId: initialConversationId,
  initialMessages,
  suggestions,
  available,
  initialQuestion,
}: {
  conversationId: string | null;
  initialMessages: Message[];
  suggestions: string[];
  available: boolean;
  initialQuestion: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingCitations, setPendingCitations] = useState<Citation[]>([]);
  const [openDrawer, setOpenDrawer] = useState<Citation[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(scrollToEnd, [messages, scrollToEnd]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || busy) return;
      setBusy(true);
      setDraft("");
      setPendingCitations([]);
      setMessages((current) => [
        ...current,
        { id: `q-${Date.now()}`, role: "user", text: question, citations: [] },
      ]);

      const answerId = `a-${Date.now()}`;
      let answer = "";
      const citations: Citation[] = [];

      try {
        const response = await fetch("/api/nadi/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, conversationId }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => ({ error: "Nadi is not reachable." }));
          setMessages((current) => [
            ...current,
            { id: answerId, role: "error", text: detail.error ?? "Nadi is not reachable.", citations: [] },
          ]);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let placed = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }

            if (event.type === "start" && typeof event.conversationId === "string") {
              setConversationId(event.conversationId);
            }
            if (event.type === "tool" && event.citation) {
              citations.push(event.citation as Citation);
              setPendingCitations([...citations]);
            }
            if (event.type === "text" && typeof event.text === "string") {
              answer += event.text;
              if (!placed) {
                placed = true;
                setMessages((current) => [
                  ...current,
                  { id: answerId, role: "assistant", text: answer, citations: [] },
                ]);
              } else {
                setMessages((current) =>
                  current.map((m) => (m.id === answerId ? { ...m, text: answer } : m)),
                );
              }
            }
            if (event.type === "error" && typeof event.message === "string") {
              setMessages((current) => [
                ...current,
                { id: `e-${Date.now()}`, role: "error", text: event.message as string, citations: [] },
              ]);
            }
          }
        }

        setMessages((current) =>
          current.map((m) => (m.id === answerId ? { ...m, citations } : m)),
        );
      } catch {
        setMessages((current) => [
          ...current,
          { id: `e-${Date.now()}`, role: "error", text: "The connection dropped before Nadi finished.", citations: [] },
        ]);
      } finally {
        setBusy(false);
        setPendingCitations([]);
      }
    },
    [busy, conversationId],
  );

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      void ask(initialQuestion);
    }
  }, [initialQuestion, ask]);

  return (
    <main className="shell-body" style={{ flex: 1 }}>
      {!available && (
        <div className="notice warn">
          <Icon name="alert" />
          <span>
            <b>Nadi is not configured.</b> Set <span className="mono">ANTHROPIC_API_KEY</span> in the
            server environment and restart. Every other part of Aayu works without it.
          </span>
        </div>
      )}

      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="empty-state">
            <b>Ask about your own record</b>
            Nadi reads your labs, readings, medications and documents before answering, and shows
            you exactly what it read.
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`msg ${message.role === "user" ? "me" : message.role === "error" ? "err" : "ai"}`}>
            {message.text}
            {message.citations.length > 0 && (
              <div className="cites">
                {message.citations.map((citation, i) => (
                  <button type="button" className="cite" key={i} onClick={() => setOpenDrawer(message.citations)}>
                    {citation.label} · {citation.detail}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="msg ai" aria-live="polite">
            <span className="typing"><i /><i /><i /></span>
            {pendingCitations.length > 0 && (
              <div className="cites">
                {pendingCitations.map((citation, i) => (
                  <span className="cite" key={i}>{citation.label} · {citation.detail}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => void ask(suggestion)} disabled={!available}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          placeholder={available ? "Ask about your health…" : "Nadi needs an API key"}
          rows={1}
          disabled={!available}
          aria-label="Ask Nadi"
        />
        <button type="submit" className="send" disabled={busy || !draft.trim() || !available} aria-label="Send">
          <Icon name="send" strokeWidth={2} />
        </button>
      </form>

      <p className="disclaimer">
        Nadi answers from your record and cites what it read. It does not diagnose, does not advise
        on medication doses, and is not a substitute for your clinician.
      </p>

      {openDrawer && <GroundingDrawer citations={openDrawer} onClose={() => setOpenDrawer(null)} />}
    </main>
  );
}

/** What Nadi read — the screen that answers "so what actually left my phone?" */
function GroundingDrawer({ citations, onClose }: { citations: Citation[]; onClose: () => void }) {
  const totalRows = citations.reduce((sum, c) => sum + c.rows, 0);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="What Nadi read" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="grab" />
        <div>
          <h2 style={{ fontSize: 20 }}>What Nadi read</h2>
          <p style={{ fontSize: 12.5, color: "var(--txt-2)", marginTop: 4 }}>
            {citations.length} quer{citations.length === 1 ? "y" : "ies"} against your record,
            returning {totalRows} row{totalRows === 1 ? "" : "s"}. Nothing else was sent.
          </p>
        </div>

        <div className="card rows">
          {citations.map((citation, i) => (
            <div className="row" key={i}>
              <span className="ic j"><Icon name="flask" /></span>
              <span className="tx">
                <b className="mono" style={{ fontSize: 12.5 }}>{citation.tool}</b>
                <small>{citation.label} · {citation.detail}</small>
              </span>
              <span className="pill jade">{citation.rows} rows</span>
            </div>
          ))}
        </div>

        <div className="notice info">
          <Icon name="shield" />
          <span>
            Requests carry your health values and a coarse subject description — age, sex,
            conditions. Your name, email, address and record identifiers are stripped before
            anything is sent, and your data is never used to train a model.
          </span>
        </div>

        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

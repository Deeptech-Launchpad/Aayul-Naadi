# How Aayu is built

Notes for whoever maintains this next — probably you, in six months.

---

## The one idea

There is **one record**, and every screen is a lens on it. Ingest screens write to
it, dashboard screens read from it, and Nadi reasons over it through typed tools.
Nothing keeps a second copy, which is why the timeline can hold a lab result, a
wearable sample and a photographed report in the same ordered stream.

The second idea follows from the first: **deterministic code decides, the model
explains**. Range flags, screening due-dates, interaction warnings and adherence
maths are computed in `src/lib/`. Claude reads, extracts and explains. That split
is why every recommendation can show its guideline source and why the same
question twice gives the same numbers.

---

## Storage and encryption

Structural columns — ids, kinds, timestamps, status — are plaintext, because
they are what indexes and queries are built on. Every column holding health
content is `Bytes` and stores an AES-256-GCM payload.

```
seal(key, plaintext) → [1 byte version][12 byte IV][ciphertext][16 byte tag]
```

Each user has a random 32-byte **data key** (DEK). It is stored twice, wrapped:

| Column | Wrapped with | Why it exists |
| --- | --- | --- |
| `dekWrappedMaster` | `AAYU_MASTER_KEY` from the environment | What the app uses at runtime, and what lets background work run without a session |
| `dekWrappedPass` | Argon2id(passphrase, `kdfSalt`) | Survives a master-key rotation, and keeps the passphrase a real second factor for the data |

**What this does and does not give you.** A stolen database dump is ciphertext —
the master key lives in the environment, not the database. It is *not* end-to-end
encryption: a running server can decrypt, because document extraction and the
morning read have to work while you are asleep. The app says this on the security
screen rather than claiming otherwise.

Numeric observation values are encrypted too, so statistics are computed in
JavaScript after decryption rather than in SQL. At personal-record scale — tens of
thousands of rows — that costs single-digit milliseconds and buys a straight
answer to "is my glucose history in the clear?".

---

## Authorisation

Every read goes through `src/lib/record.ts`, and every function there takes a
`Ctx` — `{ user, dek }` — and filters on `user.id`. There is no query builder that
does not. The classic health-app breach is an identifier in a URL that nobody
checked; here a query that forgets the scope does not have the data to run.

Nadi's tools sit on top of that same layer, so there is no argument Claude can
pass that reaches another person's record.

---

## The agent loop

`askNadi()` in `src/lib/nadi.ts` is a manual streaming loop rather than the SDK's
tool runner, because it needs to do three things at once: stream text to the
browser as it arrives, execute tools and turn each into a citation, and cap the
number of rounds.

```
for round in 0..5:
  stream = client.messages.stream({ system, tools, messages })
  for event in stream:        → yield text deltas to the caller
  final = await stream.finalMessage()
  if final.stop_reason == "refusal":  → yield error, stop
  messages.push(assistant: final.content)
  if final.stop_reason != "tool_use": → yield done, stop
  results = [runTool(ctx, block) for each tool_use block]
  messages.push(user: results)        ← all results in ONE message
```

That last line matters: splitting tool results across several user messages
teaches the model to stop making parallel calls. `tests/nadi-loop.ts` asserts it.

The route (`/api/nadi/chat`) serialises each event as newline-delimited JSON, so
the client can render text, citations and errors as they happen without
Server-Sent Events plumbing.

### The five-and-one tools

`get_profile`, `get_labs`, `get_series`, `get_medications`, `search_documents`,
`get_care_gaps`. Each is scoped server-side, gated by the consent categories from
onboarding, and returns rows that become the citation chips under the answer.
Consent is enforced at the query layer — a category that is off is never
retrieved, not retrieved-then-filtered.

---

## Document extraction

`src/lib/extract.ts` sends the page to Claude with a Zod schema and gets back a
marker list with, for each one, a confidence and the verbatim line it was read
from. Nothing is written. The review screen promotes anything below the
confidence threshold, or anything that did not map onto a known marker, and the
person confirms or corrects before a single value reaches the record.

Marker names are normalised through `src/lib/metrics.ts`, so a panel from a
different lab lands on the same trend line as the last one.

---

## The care-gap engine

`src/lib/caregaps.ts` is a table of rules, each with a guideline source, an
applicability predicate, an interval, and the record query that satisfies it.
Evaluation is a fold over that table. Because it is deterministic it can always
explain itself, and it cannot invent a screening that does not exist.

Adding a rule is adding a row. Keep the `guideline` field honest — it is shown to
the person and it is what makes the recommendation checkable.

---

## Why plain CSS and vendored fonts

The design system is ~700 lines of CSS with a token layer for light and dark. No
utility framework: the token set already existed from the design book, and one
less build step is one less thing to break on a VPS.

Fonts are committed as `.woff2` files under `src/fonts/`. The CSP admits no
external origins, and a build should not fail because a font CDN is unreachable.

---

## Where to be careful

- **`AAYU_MASTER_KEY` is not rotatable in place.** Every wrapped DEK would need
  re-wrapping. Export, redeploy, import.
- **`writeObservation` deduplicates** on `metric:minute:value`. Two genuinely
  distinct readings of the same value in the same minute collapse into one. That
  is the right trade for merging a PDF and a FHIR feed; be aware of it.
- **Audit rows are written in the same transaction as the action** where a
  transaction exists. Keep it that way — a log that can drift is not a log.
- **Middleware runs in the Edge runtime, where `process.env` is inlined at build
  time.** A configuration read there is frozen to whatever the build saw. That is
  why `src/middleware.ts` decides HSTS and `upgrade-insecure-requests` from
  `X-Forwarded-Proto` on the request rather than from an environment variable.
- **Nothing in `src/lib/` may import `next/navigation`.** `src/lib/account.ts`
  exists precisely so the CLI scripts and tests can create accounts without
  pulling React into a Node process.

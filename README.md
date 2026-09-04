# Aayu

**Continuous personal health intelligence.** Your labs, clinical records, wearables and
health documents in one record — and a reasoning layer, Nadi, that answers questions
about it with a citation behind every claim.

Self-hosted. One account, one person, one record.

---

## What it does

| Screen | What it is |
| --- | --- |
| **Today** | The dashboard: what changed since you last looked, what is out of range, what needs an action. Opens with a one-paragraph morning read written from the day's actual facts. |
| **Record** | One continuous timeline across every source, plus labs with reference ranges, the document library and connected sources. |
| **Nadi** | Grounded chat. Claude reaches your record only through five typed tools, and the answer shows exactly which queries produced it. |
| **Care** | Screenings and care gaps from a guideline rules table, medications with adherence and interaction checks, and a visit-prep note you can share with your doctor. |
| **Profile** | Conditions, allergies, family history, lifestyle and goals — plus the security centre, the access log, export and erase. |

Documents are the interesting part: photograph a lab report and Claude reads it, proposes
each marker with a confidence and the verbatim line it read it from, and **nothing is
written to your record until you confirm it**.

Two documents worth opening before the code:

- [`docs/aayu-walkthrough.html`](docs/aayu-walkthrough.html) — every screen photographed
  from the running production build, in both themes.
- [`docs/aayu-ux-spec.html`](docs/aayu-ux-spec.html) — the design book: brand, all 24
  screens as specified, and the security model.

---

## Deploying to a VPS

Tested against Docker on a Hostinger VPS. Anything with Docker and a domain works.

### 1. Point a domain at the box

Create an `A` record for e.g. `health.yourdomain.com` pointing at the VPS IP.
Let's Encrypt cannot issue a certificate until this resolves.

### 2. Clone and configure

```bash
git clone https://github.com/vellayan-code/Personal-Health-App.git aayu
cd aayu
cp .env.example .env
```

Fill in `.env`:

```bash
# The database password. Hex, not base64 — it goes inside DATABASE_URL, where
# base64's "+" and "/" break the connection string.
POSTGRES_PASSWORD=$(openssl rand -hex 24)

# The encryption key for every health field and every uploaded file.
# Losing it makes the record permanently undecryptable. Back it up offline,
# somewhere that is not this server.
AAYU_MASTER_KEY=$(openssl rand -base64 32)

# From console.anthropic.com. Without it the app still works — you lose Nadi,
# document reading and the morning read; everything else is unaffected.
ANTHROPIC_API_KEY=sk-ant-...
# Only if that key is identity-linked rather than workspace-scoped.
# ANTHROPIC_WORKSPACE_ID=wrkspc_...

AAYU_DOMAIN=health.yourdomain.com
AAYU_ORIGIN=https://health.yourdomain.com
```

`DATABASE_URL` must use the same password you set above.

### 3. Start it

Check what is already on the box first — it changes nothing and tells you which
mode you need:

```bash
sh scripts/preflight.sh
```

On a server with nothing on ports 80/443, Aayu brings its own TLS:

```bash
docker compose --profile tls up -d --build
docker compose logs -f app
```

On a server that already serves other sites, Aayu publishes to localhost only
and your existing nginx/Caddy/Apache forwards to it — ports 80 and 443 are never
touched:

```bash
echo "AAYU_PORT=3000" >> .env
docker compose -f docker-compose.yml -f docker-compose.proxied.yml up -d --build
```

Then add one server block to the proxy you already run; snippets are in
`docs/reverse-proxy/`. Full detail in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The schema is applied on first boot by a one-shot `migrate` container. In TLS
mode Caddy is the only container that publishes a port and gets its certificate
automatically; in proxied mode nothing is exposed beyond the loopback address.

Open `https://health.yourdomain.com`, create your account, enrol an authenticator app,
and save the recovery kit.

### 4. Back up

```bash
# Database
docker compose exec db pg_dump -U aayu aayu | gzip > aayu-$(date +%F).sql.gz

# Uploaded files (already encrypted at rest)
docker run --rm -v aayu_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/aayu-uploads-$(date +%F).tar.gz -C /data .
```

Both are useless without `AAYU_MASTER_KEY`. Keep that key somewhere else.

### Updating

```bash
git pull && docker compose up -d --build
```

---

## Running it locally

```bash
npm install
cp .env.example .env          # set AAYU_MASTER_KEY and DATABASE_URL
npx prisma db push
npm run dev
```

Point `DATABASE_URL` at any Postgres. Set `AAYU_INSECURE_COOKIES=1` when serving over
plain `http://localhost`, so the session cookie is not dropped.

### Sample data

```bash
npm run seed -- you@example.com 'a long passphrase you will remember'
```

Creates the account and fills it with a constructed 180-day record: wearables, three lab
panels, three medications with dose history, three documents, and a story worth reading
(fasting glucose drifting up alongside four short nights, vitamin D stubbornly low on
supplementation, an eye exam quietly overdue). You still enrol 2FA on first sign-in.

```bash
npm run wipe -- you@example.com     # clears the record, keeps the account
```

The same two actions are in the app: **Onboarding → Load sample record**, and
**Profile → Access log → Clear the record**.

### Importing your own data

- **Apple Health** — Health app → your photo → Export All Health Data → import the `.zip`
- **A health system** — export a FHIR R4 bundle from your patient portal and import the `.json`
- **Anything else** — a CSV with date, metric and value columns
- **Paper and PDFs** — photograph them; Claude reads the markers off the page

All parsing happens on your own server. The importers are in `src/lib/import.ts`.

---

## Security

| Layer | What is implemented |
| --- | --- |
| Identity | Argon2id passphrase hashing (64 MiB, t=3), mandatory TOTP second factor, ten single-use recovery codes, weak-passphrase rejection |
| Sessions | Opaque server-side sessions in `httpOnly · Secure · SameSite=Strict` cookies, 30-day lifetime, per-device revocation, PIN app-lock |
| At rest | Per-user data key; AES-256-GCM on every health field and every uploaded file. The key is wrapped twice — once by your passphrase, once by `AAYU_MASTER_KEY` |
| In transit | TLS 1.3 via Caddy, HSTS preload, strict CSP, no third-party scripts on any authenticated page |
| Model boundary | De-identification before every Claude call — name, email, phone, record IDs stripped and replaced with a coarse subject descriptor. Your data is never used to train a model |
| Prompt injection | Document text is wrapped as untrusted data with explicit instructions not to follow it; tools are allow-listed and scoped to your user id server-side; every model output is schema-validated |
| Authorisation | Every query carries the session's user id at the data-access layer, so a query that forgets the scope does not compile |
| Audit | Append-only log of every read and write, written in the same transaction as the action, readable in full at Profile → Access log |
| Sharing | Signed, expiring, revocable links; the payload is encrypted under a key derived from the link itself, so the server's master key alone cannot open it |
| Erasure | Clear the record, or delete the account — genuinely, including files on disk |

**Two things stated plainly.** This is not end-to-end encryption: while the app is
running it can decrypt your record, because background work (document extraction, the
morning read) has to. A stolen database dump on its own is ciphertext, which is the
guarantee that actually holds. And Aayu is a personal tool, not a HIPAA-covered entity
and not a medical device — it does not diagnose, does not advise on medication doses,
and does not handle emergencies.

### Where Claude is used, and where it deliberately is not

Claude explains; code decides.

- **Claude**: grounded chat, document extraction, the morning read, visit-prep drafting, plain-language explanation.
- **Code**: reference-range flags, care-gap and screening rules, interaction and allergy checks, statistics, deduplication.

That split is why every recommendation can show its guideline source, and why the same
question asked twice gives the same numbers.

---

## Architecture

```
Next.js 16 (App Router, React 19, server actions)
  ├─ src/lib/crypto.ts      AES-256-GCM sealing, Argon2id, key wrapping
  ├─ src/lib/auth.ts        sessions, TOTP, recovery codes, app lock
  ├─ src/lib/record.ts      the data-access layer — every read is user-scoped
  ├─ src/lib/metrics.ts     metric catalogue, reference ranges, condition targets
  ├─ src/lib/caregaps.ts    the guideline rules table
  ├─ src/lib/interactions.ts drug class and allergy matching
  ├─ src/lib/nadi.ts        the five tools and the streaming agent loop
  ├─ src/lib/extract.ts     document reading, schema-validated
  ├─ src/lib/import.ts      Apple Health, FHIR R4, CSV
  └─ src/lib/summaries.ts   morning read, visit prep
Postgres 16 via Prisma · Caddy for TLS · Docker Compose
```

Fonts are vendored rather than fetched, because the CSP admits no external origins and a
build must not depend on reaching Google.

---

## Giving it to other people

Sign-up is open by default, which is right for a personal instance nobody else
knows the address of and wrong the moment you share the URL. Before inviting
anyone, set `AAYU_SIGNUP_MODE=invite` with an `AAYU_INVITE_CODE`, and read
[`docs/TESTING.md`](docs/TESTING.md) — it covers closing registration, the
decision about whether testers may upload real medical records, resetting
accounts (`npm run users`), and a brief you can send them as it stands.

## What has been verified, and what has not

Run it all with `npm test` (typecheck + record layer + Nadi loop), and
`npm run test:e2e` against a running server. Over plain `http://localhost` that
server needs `AAYU_INSECURE_COOKIES=1`, or the browser refuses the `Secure`
session cookie and sign-up cannot complete — the flag doing its job.

**Verified end to end, in a real browser, against the production build:**
sign-up, TOTP enrolment with a live code, the recovery kit, all five onboarding
steps, loading the sample record, all 24 screens rendering, logging a blood
pressure reading and seeing it reach the metric trend, marking a care gap done,
recording a dose, the FHIR export (1,407 resources), sign-out, sign-in with
second factor, rejection of a wrong passphrase, and the redirect of an
unauthenticated request. Zero browser console errors.

**Verified behind a real reverse proxy:** the whole onboarding flow through
nginx on a separate port — Server Actions, 2FA, the sample record, static assets,
a FHIR export and logging a reading — confirming the proxied mode works on a
server that already runs other sites.

**Verified against the database:** encryption round-trips for every payload
type, series statistics against known inputs, care-gap evaluation across twelve
rules, drug-interaction and allergy-class matching, document search, and the
exact text each Nadi tool returns.

**Verified against a stubbed Anthropic client:** tool dispatch and scoping, that
every tool result returns in a single user message as the API requires, citation
ordering, refusal handling, the six-round loop bound, rejection of unknown tool
names, that consent gates retrieval rather than filtering afterwards, and that
de-identification strips names, record numbers, emails, phone numbers and URLs
while leaving clinical values intact.

**Not verified here, because this build environment has no Anthropic API key and
no access to Docker Hub:** the live Claude round-trip (grounded chat, document
extraction, the morning read, visit-prep drafting) and `docker build` itself.
The request shapes follow the current API and the loop around them is tested; the
container's contents are the standalone server that *was* run and exercised
directly. Both will exercise themselves the first time you deploy — if either
misbehaves, the app degrades to a working record without Nadi rather than
failing.

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm test             # typecheck, record layer, Nadi loop
npm run test:e2e     # browser walk-through against a running server
npm run seed         # create an account with the sample record
npm run demo         # create the demo account (needs AAYU_DEMO_EMAIL)
npm run wipe         # clear one account's record
npm run db:push      # apply the schema
```

---

## Not a medical device

Aayu organises your own health record and explains what is in it. It does not diagnose,
does not recommend treatment, does not advise on medication doses, and is not a
substitute for your clinician. If you are having a medical emergency, call your local
emergency number.

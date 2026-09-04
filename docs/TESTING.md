# Running a test round

Aayu was built as a personal record for one person. Handing it to other people
changes two things, and both are worth settling before you send anyone a link.

---

## Before you invite anyone

### 1. Close registration

Until you do this, anyone who finds the URL can create an account on your
server. In `.env`:

```ini
AAYU_SIGNUP_MODE=invite
AAYU_INVITE_CODE=<something long you send with the invitation>
```

Optionally pin it to named addresses as well — enforced in every mode:

```ini
AAYU_ALLOWED_EMAILS=alice@example.com,bob@example.com
```

Then `docker compose … up -d app`. The sign-up page grows an invite field, and
`AAYU_SIGNUP_MODE=closed` shuts it entirely once everyone is in.

### 2. Optionally, open a demo account

Someone you want to *show* the app to is a different case from someone you want
to *test* it. A viewer should not have to create an account, choose a
passphrase and enrol an authenticator app before seeing anything.

```ini
AAYU_DEMO_EMAIL=demo@aayu.local
```

Restart the app and run `npm run demo` — or, under Docker:

```bash
docker compose exec app npm run demo
```

The sign-in page grows a **Look around the demo** button that opens that one
account with no passphrase and no code. Everything works: the record, trends,
care gaps, interactions, Nadi.

What this is not: it is not a per-visitor account. Everyone who clicks the
button lands in the same record and sees each other's changes. Three operations
are switched off there — the app lock, clearing the record and deleting the
account — because any of them would break the demo for whoever arrives next.
Everything else, including uploads and share links, is live.

Two rules worth keeping:

- Point it only at an account holding the sample data. Anyone who reaches the
  sign-in page can open it, so an address whose record is real is an address
  whose record is public.
- `npm run demo -- --reset` reloads the sample record when visitors have made a
  mess of it. Worth running before a demo you care about.

Unset `AAYU_DEMO_EMAIL` and restart, and the button and the exemption both
disappear. The account row stays behind but nothing opens it — the passphrase
generated when it was created was never recorded.

### 3. Decide what data testers may put in

This is the decision that matters most, and it is yours to make deliberately.

**Recommended for a first round: nobody uploads real medical records.** Every
tester loads the sample record during onboarding and exercises the app against
that, adding invented readings of their own. You get honest feedback on the
product without becoming the custodian of anyone else's medical history.

If you do want real data in the test, understand what changes. You stop being
someone with a personal tool and become an organisation holding other people's
health records — with the obligations that carries wherever your testers live,
whatever this app's technical protections are. Aayu is not a HIPAA-covered
entity, has no Business Associate Agreement, and has had no formal security
review. Say so plainly in the invitation, get explicit agreement, and keep the
round small.

### 4. Turn on backups

Before anyone puts anything in. From `docs/DEPLOYMENT.md`:

```bash
mkdir -p ~/backups && chmod 700 ~/backups
crontab -e     # the pg_dump and uploads lines
```

### 5. Know how you will reset an account

There is no password-reset email, by design: the record is encrypted under a key
wrapped by the passphrase. A tester who loses both their passphrase and their
recovery codes cannot be rescued — only deleted and started over. Tell them
this before they begin; it is the single most likely support request.

```bash
npm run users                      # who has an account, and how much is in it
npm run users -- reset a@b.com     # clear the record, keep the login
npm run users -- delete a@b.com    # remove the account entirely
```

Run these on the server from `~/aayu-app`, with `DATABASE_URL` pointing at the
container's database, or inside it with `docker compose exec`.

---

## What to give each tester

Send them four things:

1. The URL, and the invite code.
2. **A warning that this is a test instance** and their data may be deleted
   without notice.
3. Whether to use real health data. Be explicit — do not leave it to them.
4. The brief below.

---

## The tester brief

> **Aayu — test build**
>
> This is an early build of a personal health record. It reads your labs,
> readings, medications and documents, and can answer questions about them.
> It is not a medical device, it does not diagnose, and it does not give
> treatment advice. Nothing in it should change what you do about your health
> without talking to your clinician.
>
> **Please do not upload real medical records in this round.** When you sign up,
> choose "Load sample record" — it fills the app with a realistic six-month
> history so every screen has something in it.
>
> **Setting up takes about three minutes:**
> 1. Create an account with a passphrase you will not lose. There is no
>    "forgot passphrase" email — your data is encrypted with it.
> 2. Enrol an authenticator app when asked. This is not optional.
> 3. **Save your recovery codes.** They are shown once. Lose the passphrase and
>    the codes and the account is gone.
> 4. Work through the five onboarding steps and load the sample record.
>
> **Then spend fifteen minutes on these, in this order:**
>
> | | What to do | What I want to know |
> |---|---|---|
> | 1 | Read the Today screen cold | Did you understand what needed your attention without being told? |
> | 2 | Tap a metric tile, change the window to 6m | Is the trend and its target band clear? |
> | 3 | Open Labs, read one flagged result | Did the reference range and the "your target" line make sense together? |
> | 4 | Ask Nadi something about the record | Did the answer look grounded? Did you trust the citations? |
> | 5 | Photograph any lab report — yours or one from the internet | Did it read the values correctly? Did the confirm step feel safe? |
> | 6 | Open Care | Did the reasons given for each screening make sense? |
> | 7 | Log a blood pressure reading | How many taps? Anything confusing? |
> | 8 | Open Profile → Security & privacy | Did you feel in control? Anything alarming or unclear? |
>
> **Tell me:**
> - Anything you did not understand, in your words.
> - Anything that felt wrong, slow or untrustworthy.
> - Any number that looked incorrect — those matter most.
> - What you would use this for, if anything, and what would stop you.
>
> On a phone, add it to your home screen — it installs like an app.

---

## What to watch on your side

During the round:

```bash
docker compose -p aayu logs -f app        # errors as they happen
npm run users                             # who is actually using it
```

The access log inside each account shows what that person did. You cannot read
their health data — it is encrypted under their key — and that is worth telling
them, because it is unusual and it is true.

Anthropic API spend is worth watching too: every tester asking questions and
uploading documents draws on the same key. Set a monthly limit in the console
before the round, not after.

---

## Known gaps to mention up front

Testers will find these anyway; saying them first buys you credibility.

- **No password reset.** By design. Recovery codes are the only route back in.
- **No live provider sync.** SMART on FHIR and Fitbit need credentials this
  build does not ship; file import covers the same ground.
- **Interaction checks are not exhaustive.** They cover common classes and say
  so on screen.
- **No mobile app.** It is a web app that installs to the home screen.
- **One person per account.** No sharing, no family view, no clinician login.

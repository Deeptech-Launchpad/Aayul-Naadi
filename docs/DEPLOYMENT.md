# Deploying Aayu to a Hostinger VPS

Start to finish, about twenty minutes. Everything runs in Docker; the only thing you
install on the host is Docker itself.

---

## Which mode you need

Run this on the server first. It changes nothing — it reads what is already
there and tells you which of the two deployments applies:

```bash
sh scripts/preflight.sh
```

| Situation | Mode | Command |
| --- | --- | --- |
| Nothing owns ports 80/443 | Aayu brings its own TLS via Caddy | `docker compose --profile tls up -d --build` |
| The box already serves other sites | Aayu publishes to localhost; your existing proxy forwards to it | `docker compose -f docker-compose.yml -f docker-compose.proxied.yml up -d --build` |

If you already run other applications on this server, **you want the second
one** — jump to [Sharing a server with other apps](#sharing-a-server-with-other-apps).
The first mode starts a Caddy that wants port 80, and on a box where something
else already has it, that either fails to start or takes your other sites
offline.

## Before you start

- A VPS with at least **2 GB RAM** (the build needs it; the running app is happy in less)
- A domain or subdomain you control
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com) — optional,
  but without it you lose Nadi, document reading and the morning read

---

## 1. Point the domain at the VPS

In your DNS provider, add an `A` record:

```
health.yourdomain.com   →   <your VPS IP>
```

Check it before going further — Let's Encrypt cannot issue a certificate until it resolves:

```bash
dig +short health.yourdomain.com
```

---

## 2. Prepare the VPS

SSH in as root, then:

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# A non-root user to run the app
adduser --disabled-password --gecos "" aayu
usermod -aG docker aayu

# Firewall: SSH and HTTPS only
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Postgres is never exposed — it is reachable only on the Docker network.

---

## 3. Clone and configure

```bash
su - aayu
git clone https://github.com/vellayan-code/Personal-Health-App.git aayu
cd aayu
cp .env.example .env
```

Generate the secrets:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "AAYU_MASTER_KEY=$(openssl rand -base64 32)"
```

The database password is **hex, not base64**, and the difference matters: it is
embedded in `DATABASE_URL`, where base64's `+` and `/` are not valid unencoded.
Prisma reports that as `invalid port number in database URL` and the `migrate`
container exits 1. The master key is a plain environment variable, never part of
a URL, so base64 is right for it.

Edit `.env`:

```ini
POSTGRES_USER=aayu
POSTGRES_PASSWORD=<the password you generated>
POSTGRES_DB=aayu
DATABASE_URL=postgresql://aayu:<the same password>@db:5432/aayu?schema=public

AAYU_MASTER_KEY=<the key you generated>

ANTHROPIC_API_KEY=sk-ant-...
# Only if that key is identity-linked rather than workspace-scoped — see below.
# ANTHROPIC_WORKSPACE_ID=wrkspc_...
AAYU_MODEL=claude-opus-5

AAYU_DOMAIN=health.yourdomain.com
AAYU_ORIGIN=https://health.yourdomain.com
```

> **Back up `AAYU_MASTER_KEY` now, somewhere that is not this server.** Every health field
> and every uploaded file is encrypted with a key wrapped by it. Lose it and the record is
> permanently unreadable — that is the design, not a bug.

Lock the file down:

```bash
chmod 600 .env
```

---

## 4. Start

```bash
docker compose up -d --build
docker compose logs -f app
```

The first build takes a few minutes. You want to see:

```
Applying database schema…
Starting Aayu on port 3000…
```

Caddy requests a certificate on the first HTTPS request, which takes a few seconds.

---

## 5. Create your account

Open `https://health.yourdomain.com` and work through:

1. **Create account** — a passphrase you will not lose, at least 12 characters
2. **Two-factor** — scan the QR with your authenticator app
3. **Recovery kit** — ten codes, shown once. Save them off the phone you just enrolled
4. **Onboarding** — consent, basics, conditions, family history, then either load the
   sample record or import your own

---

## 6. Put your own data in

**Apple Health.** Health app → your photo, top right → *Export All Health Data* → AirDrop
or email the `.zip` to yourself → in Aayu, Record → Sources → Import.

**A hospital or lab portal.** If it offers a FHIR or "download my data" export, import the
`.json`. Otherwise download the PDFs and photograph or upload them — Aayu reads markers off
the page and asks you to confirm each one.

**Paper reports.** Record → Documents → Take photo. Good light, page flat, whole page in
frame.

If you loaded the sample record first, clear it before adding your own:
**Profile → Access log → Clear or delete my data → Clear the record**.

---

## Sharing a server with other apps

Nothing here touches your existing sites. Aayu publishes on the loopback
interface only, keeps its containers, volumes and network under its own
`COMPOSE_PROJECT_NAME`, and never binds 80 or 443.

### 1. Pick a port and start it

```bash
sh scripts/preflight.sh          # suggests a free port
cd ~/aayu
echo "AAYU_PORT=3000" >> .env    # use whatever preflight suggested
```

Set `AAYU_ORIGIN` in `.env` to the public URL you will serve it on
(`https://health.yourdomain.com`), then:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxied.yml up -d --build
curl -sS http://127.0.0.1:3000/api/health     # {"status":"ok"}
```

At this point Aayu is running and reachable only from the server itself.

### 2. Add one server block to the proxy you already run

Copy the snippet for whichever proxy is in front of your other apps, change the
domain and port, and reload:

- nginx — [`docs/reverse-proxy/nginx.conf`](reverse-proxy/nginx.conf), or
  [`nginx-existing-cert.conf`](reverse-proxy/nginx-existing-cert.conf) if you
  already hold a certificate for the domain
- Caddy — [`docs/reverse-proxy/Caddyfile.snippet`](reverse-proxy/Caddyfile.snippet)
- Apache — [`docs/reverse-proxy/apache.conf`](reverse-proxy/apache.conf)

Three things in those snippets are not optional:

| Setting | Why |
| --- | --- |
| `X-Forwarded-Host` set to your domain | Next validates every Server Action against it. Wrong or missing and every form in the app fails with *Invalid Server Actions request* |
| `X-Forwarded-Proto: https` | How the app decides to send HSTS and `upgrade-insecure-requests` |
| Response buffering **off** | Nadi streams its answers token by token; a buffering proxy makes the chat look frozen until the whole reply is ready |

A 30 MB body limit also matters — a photographed lab report is easily several
megabytes, and the app's own ceiling is 25 MB.

### 3. Certificate

The nginx vhost above listens on **port 80 only**, on purpose. certbot needs a
working port-80 block with the right `server_name` to validate the domain, and
it then writes the TLS block itself:

```bash
sudo certbot --nginx -d health.yourdomain.com
```

That rewrites the file: it adds the 443 server block, points it at the new
certificate, and turns the port-80 block into a redirect.

**Never install a vhost that declares `listen 443 ssl` before the certificate
exists.** `nginx -t` fails on it, so the reload is refused — and a restart in
that state takes every other site on the box down with it.

Two version traps on the same theme, both of which fail `nginx -t`:

- `listen [::]:80` needs the host to have IPv6. Add it only if it does.
- `http2 on;` is nginx 1.25+. On 1.24 — which is what Ubuntu 24.04 ships —
  write `listen 443 ssl http2;` instead. Check with `nginx -v`.

With Caddy none of this applies; the certificate is automatic once DNS resolves.

### Running alongside another Postgres

Aayu's database container publishes no port at all, so it cannot collide with a
Postgres already on the host or in another stack. It is a separate instance with
its own volume — Aayu never touches another application's data.

If you would rather point Aayu at an existing Postgres, set `DATABASE_URL` to
that server and drop the `db` and `migrate` services from the compose command;
apply the schema yourself with `npx prisma db push`.

## Backups

Add to `crontab -e` as the `aayu` user:

```cron
0 3 * * * cd ~/aayu && docker compose exec -T db pg_dump -U aayu aayu | gzip > ~/backups/aayu-$(date +\%F).sql.gz
5 3 * * * docker run --rm -v aayu_uploads:/data -v ~/backups:/backup alpine tar czf /backup/uploads-$(date +\%F).tar.gz -C /data .
0 4 * * * find ~/backups -name 'aayu-*.sql.gz' -mtime +30 -delete
```

```bash
mkdir -p ~/backups && chmod 700 ~/backups
```

Copy them off the VPS periodically. Both are encrypted at rest and useless without
`AAYU_MASTER_KEY`, which is exactly why that key belongs somewhere else.

### Restoring

```bash
gunzip -c ~/backups/aayu-2026-08-25.sql.gz | docker compose exec -T db psql -U aayu -d aayu
```

---

## Operating it

```bash
docker compose ps                     # what is running
docker compose logs -f app            # application log
docker compose restart app            # restart after an .env change
git pull && docker compose up -d --build   # update
docker compose down                   # stop (volumes survive)
```

### Rotating the API key

Edit `.env`, then `docker compose up -d app`. No data is affected.

### Rotating the master key

Not a one-liner: every wrapped data key has to be re-wrapped. Export your record first
(Profile → Access log → Export), stand up a fresh instance with the new key, and import.

---

## Troubleshooting

**Caddy will not get a certificate.** DNS has not propagated, or ports 80/443 are blocked.
`dig +short health.yourdomain.com` and `ufw status`. On a shared box you should
not be running Aayu's Caddy at all — see
[Sharing a server with other apps](#sharing-a-server-with-other-apps).

**Every form fails with "Invalid Server Actions request".** Your reverse proxy
is not passing the original host. Set both `Host` and `X-Forwarded-Host` to the
public domain — the snippets in `docs/reverse-proxy/` do this.

**The Nadi chat hangs, then shows the whole answer at once.** The proxy is
buffering the response. `proxy_buffering off` in nginx, `flush_interval -1` in
Caddy, `SetEnv proxy-sendchunked 1` in Apache.

**The page is blank and the console is full of `ERR_SSL_PROTOCOL_ERROR`.** Your
proxy is sending `X-Forwarded-Proto: https` on a listener that actually serves
plain HTTP — typically a hardcoded `https` in the config, or the window after
you add the vhost but before certbot issues the certificate. The app believes it
is on HTTPS, sends `upgrade-insecure-requests`, and the browser then tries to
fetch every script over TLS from a port that has none. Use `$scheme` in nginx
rather than a literal, and the problem disappears the moment the certificate is
in place.

**Port 80 is already in use.** You are in the wrong mode — use the proxied one,
which never binds 80 or 443.

**`AAYU_MASTER_KEY is not set`.** The app refuses to start without it, deliberately. Check
`.env` is in the same directory as `docker-compose.yml`.

**`migrate` exits 1 and the app never starts.** Read the reason with
`docker compose -p aayu logs migrate`. Almost always the `DATABASE_URL`:

- `invalid port number in database URL` — the password contains `+`, `/` or `@`.
  Regenerate it with `openssl rand -hex 24` and update it in **both**
  `POSTGRES_PASSWORD` and `DATABASE_URL`, then
  `docker compose -p aayu down -v` and bring it up again. The volume has to go,
  because Postgres set its password on first boot.
- `password authentication failed` — the password in `DATABASE_URL` does not
  match `POSTGRES_PASSWORD`.

**The build runs out of memory.** Add swap:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Nadi says it is not configured.** `ANTHROPIC_API_KEY` is missing or rejected.
`docker compose logs app | grep -i anthropic`.

**Nadi answers with `anthropic-workspace-id is required`.** The key is
identity-linked — issued to a person rather than to a workspace — and every
request has to name the workspace it acts in. Either set
`ANTHROPIC_WORKSPACE_ID` in `.env` and restart the app, or create a
workspace-scoped key in the Console and use that instead. The workspace id is
in the Console's URL while the workspace is open.

**A document will not read.** Check the size (25 MB limit) and that it is a PDF or a
photograph. The file is stored either way — open it from the library to see the reason.

---

## What is exposed

Standalone mode:

| Port | Container | Reachable from |
| --- | --- | --- |
| 443 | Caddy | The internet |
| 80 | Caddy | The internet — redirects to 443 |
| 3000 | App | The Docker network only |
| 5432 | Postgres | The Docker network only |

Proxied mode, on a shared server:

| Port | Container | Reachable from |
| --- | --- | --- |
| — | Caddy | Not started |
| 127.0.0.1:`AAYU_PORT` | App | The server itself, so your existing proxy can reach it |
| 5432 | Postgres | The Docker network only |

The app container runs as a non-root user. Uploaded files live on a named volume,
encrypted. Application logs never contain health data, and Caddy's access log drops the
request URI and masks client IPs.

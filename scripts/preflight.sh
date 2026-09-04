#!/bin/sh
# Aayu — server preflight. READ ONLY: this script changes nothing.
#
#   sh scripts/preflight.sh
#
# Run it on the VPS before deploying, especially when other applications
# already live there. It reports what is listening, what a reverse proxy
# situation looks like, and which free port Aayu should use. Paste the whole
# output back to whoever is helping you deploy.

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Is a TCP port being listened on? ss and netstat are the readable options;
# /proc/net/tcp is the one that is always there. Returns 0 busy, 1 free,
# 2 could not tell — never guess "free" when the answer is unknown.
port_busy() {
  _p=$1
  if have ss; then
    ss -ltn 2>/dev/null | grep -qE "[:.]$_p[[:space:]]" && return 0 || return 1
  fi
  if have netstat; then
    netstat -ltn 2>/dev/null | grep -qE "[:.]$_p[[:space:]]" && return 0 || return 1
  fi
  if [ -r /proc/net/tcp ]; then
    _hex=$(printf '%04X' "$_p")
    if awk -v h=":$_hex" '$4=="0A" && index($2,h)' /proc/net/tcp /proc/net/tcp6 2>/dev/null | grep -q .; then
      return 0
    fi
    return 1
  fi
  return 2
}

echo "═══ Aayu preflight ═══  $(date -u '+%Y-%m-%d %H:%M UTC')"

say "Host"
if [ -r /etc/os-release ]; then . /etc/os-release; echo "os        : ${PRETTY_NAME:-unknown}"; fi
echo "kernel    : $(uname -r)"
echo "arch      : $(uname -m)"
echo "cpus      : $(nproc 2>/dev/null || echo '?')"
if have free; then
  echo "memory    : $(free -m | awk '/^Mem:/ {printf "%s MB total, %s MB available", $2, $7}')"
  echo "swap      : $(free -m | awk '/^Swap:/ {printf "%s MB", $2}')"
fi
echo "disk (/)  : $(df -h / | awk 'NR==2 {printf "%s free of %s", $4, $2}')"

say "Requirements"
# Checked against docs/DEPLOYMENT.md#requirements. Read only, like the rest.
req_fail=0
req_warn=0
req() {
  case "$2" in
    ok)   printf '  ✓ %-11s %s\n' "$1" "$3" ;;
    warn) printf '  ! %-11s %s\n' "$1" "$3"; req_warn=$((req_warn + 1)) ;;
    *)    printf '  ✗ %-11s %s\n' "$1" "$3"; req_fail=$((req_fail + 1)) ;;
  esac
}

case "$(uname -m)" in
  x86_64|amd64)  req "arch" ok "$(uname -m)" ;;
  aarch64|arm64) req "arch" warn "$(uname -m) — the images are multi-arch but ARM is untested here" ;;
  *)             req "arch" fail "$(uname -m) — not a supported architecture" ;;
esac

cpus=$(nproc 2>/dev/null || echo 0)
if [ "$cpus" -ge 2 ]; then
  req "cpu" ok "$cpus cores"
elif [ "$cpus" -ge 1 ]; then
  req "cpu" warn "$cpus core — runs fine; expect 5–10 minutes for the first build"
else
  req "cpu" warn "could not determine the core count"
fi

if have free; then
  mem_mb=$(free -m | awk '/^Mem:/ {print $2}')
  swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
  [ -n "$mem_mb" ] || mem_mb=0
  [ -n "$swap_mb" ] || swap_mb=0
  if [ "$mem_mb" -ge 3800 ]; then
    req "memory" ok "${mem_mb} MB — KVM 1 or larger"
  elif [ "$mem_mb" -ge 1900 ]; then
    req "memory" warn "${mem_mb} MB — meets the 2 GB floor, but the build is tight; add swap if it is killed"
  elif [ $((mem_mb + swap_mb)) -ge 1900 ]; then
    req "memory" warn "${mem_mb} MB RAM + ${swap_mb} MB swap — the build will be slow but should finish"
  else
    req "memory" fail "${mem_mb} MB RAM, ${swap_mb} MB swap — under the 2 GB floor; 'next build' will be OOM-killed. Add swap first."
  fi
else
  req "memory" warn "no 'free' on this host — could not check"
fi

disk_gb=$(df -Pk / 2>/dev/null | awk 'NR==2 {printf "%d", $4 / 1048576}')
if [ -z "$disk_gb" ]; then
  req "disk" warn "could not read free space on /"
elif [ "$disk_gb" -ge 20 ]; then
  req "disk" ok "${disk_gb} GB free on /"
elif [ "$disk_gb" -ge 15 ]; then
  req "disk" warn "${disk_gb} GB free on / — enough to deploy, little room for image churn"
else
  req "disk" fail "${disk_gb} GB free on / — images, volumes and build cache want roughly 15 GB"
fi

if have docker; then
  req "docker" ok "$(docker --version 2>/dev/null | sed 's/^Docker version /version /')"
  if docker compose version >/dev/null 2>&1; then
    req "compose" ok "v2 plugin, $(docker compose version --short 2>/dev/null)"
  elif have docker-compose; then
    req "compose" fail "only the legacy v1 'docker-compose' is here; the compose files need the v2 plugin"
  else
    req "compose" fail "not installed — it ships with the Docker installer"
  fi
else
  req "docker" fail "not installed  →  curl -fsSL https://get.docker.com | sh"
  req "compose" fail "not installed — it ships with the Docker installer"
fi

for tool in git openssl curl; do
  if have "$tool"; then req "$tool" ok "present"; else req "$tool" fail "not installed"; fi
done

if have ss || have netstat; then
  req "iproute2" ok "present"
else
  req "iproute2" warn "no ss or netstat — the port checks below fall back to /proc and may be inconclusive"
fi

if [ "$req_fail" -gt 0 ]; then
  echo "  → $req_fail requirement(s) unmet. docs/DEPLOYMENT.md#requirements has the fix for each."
elif [ "$req_warn" -gt 0 ]; then
  echo "  → Deployable. $req_warn thing(s) above are worth reading first."
else
  echo "  → All requirements met."
fi

say "Docker"
if have docker; then
  echo "docker    : $(docker --version 2>/dev/null)"
  if docker compose version >/dev/null 2>&1; then
    echo "compose   : $(docker compose version --short 2>/dev/null)"
  elif have docker-compose; then
    echo "compose   : $(docker-compose --version 2>/dev/null)  [legacy v1 — 'docker compose' plugin preferred]"
  else
    echo "compose   : NOT INSTALLED"
  fi
  if docker info >/dev/null 2>&1; then
    echo "daemon    : running"
    echo "--- running containers ---"
    docker ps --format '  {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || true
  else
    echo "daemon    : not reachable as this user (try sudo, or add yourself to the docker group)"
  fi
else
  echo "docker    : NOT INSTALLED  →  curl -fsSL https://get.docker.com | sh"
fi

say "What is listening"
if have ss; then
  ss -ltnp 2>/dev/null | awk 'NR==1 || $4 ~ /:(80|443|3000|3001|3002|5432|8080|8443)$/'
elif have netstat; then
  netstat -ltnp 2>/dev/null | awk 'NR<=2 || $4 ~ /:(80|443|3000|3001|3002|5432|8080|8443)$/'
else
  echo "  (neither ss nor netstat available)"
fi

say "Ports 80 / 443"
for port in 80 443; do
  owner=$( { ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null; } | grep -E "[:.]$port[[:space:]]" | head -1 )
  port_busy "$port"; state=$?
  case $state in
    0) if [ -n "$owner" ]; then
         echo "  $port : IN USE →$(echo "$owner" | sed 's/.*users:/ /')"
       else
         echo "  $port : IN USE (run as root to see which process)"
       fi ;;
    1) echo "  $port : free" ;;
    *) echo "  $port : UNKNOWN — no ss, netstat or /proc/net/tcp on this host" ;;
  esac
done

say "Reverse proxy on this box"
found_proxy=""
for proxy in nginx caddy apache2 httpd traefik haproxy; do
  if have "$proxy"; then
    state=$(systemctl is-active "$proxy" 2>/dev/null || echo "unknown")
    echo "  $proxy: installed, service $state"
    found_proxy="$found_proxy $proxy"
  fi
done
if docker ps --format '{{.Image}}' 2>/dev/null | grep -qiE 'nginx|caddy|traefik|nginx-proxy-manager|coolify'; then
  echo "  a proxy appears to be running as a container:"
  docker ps --format '    {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null | grep -iE 'nginx|caddy|traefik|coolify' || true
  found_proxy="$found_proxy container"
fi
[ -z "$found_proxy" ] && echo "  none detected"

for dir in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/caddy /etc/apache2/sites-enabled; do
  if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    echo "  config in $dir:"
    for f in "$dir"/*; do
      [ -f "$f" ] || continue
      names=$(grep -hE '^[[:space:]]*server_name' "$f" 2>/dev/null | tr -d ';' | sed 's/^[[:space:]]*server_name[[:space:]]*//' | tr '\n' ' ')
      tls=$(grep -qE '^[[:space:]]*(ssl_certificate|SSLCertificateFile)' "$f" 2>/dev/null && echo "TLS configured" || echo "NO TLS")
      echo "    $(basename "$f")  →  ${names:-no server_name}  [$tls]"
    done
  fi
done
if [ -d /etc/letsencrypt/live ]; then
  echo "  certbot certificates: $(ls -1 /etc/letsencrypt/live 2>/dev/null | grep -v README | tr '\n' ' ')"
fi

say "An existing Aayu deployment on this box"
if have docker && docker info >/dev/null 2>&1; then
  found=0

  # Containers use {{.Names}} (plural); volumes and networks use {{.Name}}.
  containers=$(docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | grep -i aayu || true)
  if [ -n "$containers" ]; then
    found=1
    echo "  containers:"
    echo "$containers" | sed 's/^/    /'
  fi

  volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -i aayu || true)
  if [ -n "$volumes" ]; then
    found=1
    echo "  volumes:   $(echo "$volumes" | tr '\n' ' ')"
  fi

  networks=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -i aayu || true)
  if [ -n "$networks" ]; then
    found=1
    echo "  networks:  $(echo "$networks" | tr '\n' ' ')"
  fi

  projects=$(docker ps -a --filter 'label=com.docker.compose.project' \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | sort -u | grep -i aayu || true)
  if [ -n "$projects" ]; then
    echo "  compose project(s): $(echo "$projects" | tr '\n' ' ')"
    for proj in $projects; do
      dir=$(docker ps -a --filter "label=com.docker.compose.project=$proj" \
        --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | sort -u | head -1)
      [ -n "$dir" ] && echo "    $proj was deployed from $dir"
    done
  fi

  if [ "$found" = "1" ]; then
    cat <<'WARN'

  ⚠ Aayu is already deployed here. Bringing another copy up with the same
    project name will replace those containers and reuse that database volume.
    If the old deployment used a different AAYU_MASTER_KEY, its data cannot be
    decrypted by the new one. Decide deliberately before you deploy:

      docker compose -p aayu ps -a          what is there
      docker compose -p aayu logs --tail 50 why it is or is not working
      docker compose -p aayu down           stop it, keep the data
      docker compose -p aayu down -v        stop it and DELETE the data
WARN
  else
    echo "  none — nothing to collide with"
  fi
fi

say "A free port for Aayu"
suggested=""
for port in 3000 3001 3002 3003 3010 4000 8081; do
  if port_busy "$port"; then continue; fi
  [ $? -eq 2 ] && break
  suggested=$port
  break
done
if [ -n "$suggested" ]; then
  echo "  AAYU_PORT=$suggested   (free)"
else
  echo "  could not determine a free port — pick one by hand and check it with:"
  echo "      ss -ltn | grep :PORT"
fi

say "Recommendation"
port_busy 80; p80=$?
if [ "$p80" = "2" ]; then
  cat <<'MSG'
  Could not tell what is listening on this host, so neither mode can be
  recommended safely. Install iproute2 (`apt-get install -y iproute2`) and run
  this again — deploying blind risks taking your existing sites offline.
MSG
elif [ "$p80" = "1" ]; then
  cat <<'MSG'
  Ports 80 and 443 look free, so Aayu can bring its own TLS:

      docker compose up -d --build

MSG
else
  cat <<MSG
  Something already owns port 80, so Aayu must sit behind it rather than
  replace it. Use the proxied mode — it starts no Caddy and publishes only to
  localhost, leaving your existing sites untouched:

      echo "AAYU_PORT=${suggested:-3000}" >> .env
      docker compose -f docker-compose.yml -f docker-compose.proxied.yml up -d --build

  Then add one server block to whatever is already serving your other apps.
  Snippets for nginx, Caddy and Apache are in docs/reverse-proxy/.
MSG
fi

echo
echo "═══ end of preflight ═══"

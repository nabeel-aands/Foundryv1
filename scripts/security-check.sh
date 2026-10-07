#!/usr/bin/env bash
# Black-box checks for Gate items 4 (unauthenticated matrix), 8 (jobs and webhook refuse
# unauthorised calls) and 10 (headers). Sends no real secret. Safe to run against production.
#   scripts/security-check.sh https://foundry.example.com
set -u
HOST="${1:?usage: security-check.sh https://host}"
HOST="${HOST%/}"
pass=0; fail=0

# check <label> <expected status regex> <curl args...>
check() {
  local label="$1" want="$2"; shift 2
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$@")
  if [[ "$got" =~ ^($want)$ ]]; then pass=$((pass+1)); printf "  ok    %-62s %s\n" "$label" "$got"
  else fail=$((fail+1)); printf "  FAIL  %-62s got %s, want %s\n" "$label" "$got" "$want"; fi
}

echo "== Pages with no cookie: redirect to sign-in =="
for p in / /roadmap /library /resources /ask /build /admin /admin/access /admin/inventory; do
  check "GET $p" "30[1278]" "$HOST$p"
  loc=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 20 "$HOST$p")
  [[ "$loc" == *"/auth/login"* ]] || { fail=$((fail+1)); echo "  FAIL  $p redirects to '$loc', not /auth/login"; }
done

echo "== API with no cookie: 401 =="
check "POST /api/ask"  "401" -X POST -H "content-type: application/json" -d '{}' "$HOST/api/ask"
check "GET  /api/ask"  "401|405" "$HOST/api/ask"
check "GET  /api/version" "401" "$HOST/api/version"

echo "== Public by design: 200 =="
for p in /api/health /terms /privacy /auth/signed-out; do check "GET $p" "200" "$HOST$p"; done

echo "== Forged and garbage session cookies are refused =="
check "garbage cookie on /roadmap" "30[1278]" -H "Cookie: foundry_session=abc.def" "$HOST/roadmap"
check "unsigned cookie on /api/version" "401" -H "Cookie: foundry_session=$(printf '{"exp":9999999999}' | base64 | tr '+/' '-_' | tr -d '=').AAAA" "$HOST/api/version"
check "empty cookie on /api/version" "401" -H "Cookie: foundry_session=" "$HOST/api/version"

echo "== Job routes refuse unauthorised calls =="
for r in /api/jobs/sync /api/jobs/drain; do
  check "$r no header" "401" "$HOST$r"
  check "$r wrong bearer" "401" -H "Authorization: Bearer not-the-secret" "$HOST$r"
  check "$r short bearer" "401" -H "Authorization: Bearer x" "$HOST$r"
  check "$r long bearer" "401" -H "Authorization: Bearer $(head -c 300 /dev/zero | tr '\0' 'a')" "$HOST$r"
  check "$r basic scheme" "401" -H "Authorization: Basic abc" "$HOST$r"
done

echo "== Webhook refuses unsigned calls (401, or 404 if none is registered) =="
W="$HOST/api/webhooks/airtable"
check "POST no signature" "401|404" -X POST -d '{}' "$W"
check "POST wrong signature" "401|404" -X POST -H "X-Airtable-Content-MAC: hmac-sha256=deadbeef" -d '{}' "$W"
check "POST wrong-length signature" "401|404" -X POST -H "X-Airtable-Content-MAC: x" -d '{}' "$W"
check "GET not allowed" "404|405" "$W"

echo "== Auth routes =="
check "/auth/login redirects (no 5xx)" "30[1278]" "$HOST/auth/login"
for rt in '//evil.com' '/\evil.com' 'https://evil.com' 'javascript:alert(1)'; do
  loc=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 20 -G --data-urlencode "returnTo=$rt" "$HOST/auth/login")
  [[ "$loc" == *"accounts.google.com"* || "$loc" == "$HOST"* ]] && { pass=$((pass+1)); echo "  ok    login with returnTo=$rt goes only to Google or this site"; } \
    || { fail=$((fail+1)); echo "  FAIL  login with returnTo=$rt redirects to $loc"; }
done
forged=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 20 -H "Host: evil.example" "$HOST/auth/login")
if [[ "$forged" == *"evil.example"* ]]; then fail=$((fail+1)); echo "  FAIL  forged Host header reflected: $forged"; else pass=$((pass+1)); echo "  ok    forged Host header not reflected"; fi
check "/auth/callback without state is refused cleanly" "30[1278]|400|401" "$HOST/auth/callback?code=x&state=y"

echo "== Response headers =="
hdrs=$(curl -s -D - -o /dev/null --max-time 20 "$HOST/terms" | tr -d '\r')
for h in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy content-security-policy-report-only; do
  grep -qi "^$h:" <<<"$hdrs" && { pass=$((pass+1)); echo "  ok    $h"; } || { fail=$((fail+1)); echo "  FAIL  missing $h"; }
done
grep -qi "^x-powered-by:" <<<"$hdrs" && { fail=$((fail+1)); echo "  FAIL  x-powered-by is present"; } || { pass=$((pass+1)); echo "  ok    no x-powered-by"; }

echo "== Health leaks nothing it should not =="
body=$(curl -s --max-time 20 "$HOST/api/health")
if grep -qiE '"id"|webhookId|@[a-z0-9.-]+\.[a-z]{2,}|sk-ant|eyJ' <<<"$body"; then fail=$((fail+1)); echo "  FAIL  /api/health body looks sensitive"; else pass=$((pass+1)); echo "  ok    /api/health body"; fi
grep -q '"mode":"oidc"' <<<"$body" && { pass=$((pass+1)); echo "  ok    mode is oidc"; } || { fail=$((fail+1)); echo "  FAIL  mode is not oidc (demo or open mode in production?)"; }

echo; echo "passed $pass, failed $fail"
[[ $fail -eq 0 ]]

#!/usr/bin/env bash
# Framing headers + fonts on the live hosts (docs/embed-design.md Part 8).
#   bash scripts/embed-check.sh [expect]   expect = none (no embedders yet) | zare (after set-zare-embed --apply)
# Optional env: SLUG (default clenstvi-2027), PORTAL_TOKEN (a real token; default a dummy -- the
# proxy sets the headers by host + path, so the header check is the same).
set -u
EXPECT="${1:-zare}"
SLUG="${SLUG:-clenstvi-2027}"
TOKEN="${PORTAL_TOKEN:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA}"
ZARE="frame-ancestors 'self' https://www.zare.cz https://zare.cz"
fail=0
hdr() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2- ; }
check() { # name got want
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 -- got [$2] want [$3]"; fail=1; fi
}
check "tabornik.online/login CSP" "$(hdr https://tabornik.online/login content-security-policy)" "frame-ancestors 'none'"
check "tabornik.online/login X-Frame-Options" "$(hdr https://tabornik.online/login x-frame-options)" "DENY"
for url in "https://prihlasky.kasicka.eu/r/$SLUG" "https://rodice.kasicka.eu/p/$TOKEN"; do
  if [ "$EXPECT" = "none" ]; then
    check "$url CSP" "$(hdr "$url" content-security-policy)" "frame-ancestors 'none'"
  else
    check "$url CSP" "$(hdr "$url" content-security-policy)" "$ZARE"
    check "$url no X-Frame-Options" "$(hdr "$url" x-frame-options)" ""
  fi
done
check "rodice landing CSP" "$(hdr https://rodice.kasicka.eu/ content-security-policy)" "frame-ancestors 'none'"
check "rodice landing X-Frame-Options" "$(hdr https://rodice.kasicka.eu/ x-frame-options)" "DENY"
for url in "https://prihlasky.kasicka.eu/r/$SLUG" "https://rodice.kasicka.eu/" "https://prihlasky.kasicka.eu/r/$SLUG?embed=1"; do
  n=$(curl -s "$url" | grep -cE "fonts\.(googleapis|gstatic)\.com")
  check "$url: no Google Fonts request" "$n" "0"
done
[ $fail = 0 ] && echo "all passed" || echo "FAILED"
exit $fail

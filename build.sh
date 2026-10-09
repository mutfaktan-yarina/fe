#!/usr/bin/env bash
# build.sh: partials/*.html parçalarını sayfalara yerinde işler (derleme adımı yok, çıktı commit'lenir). Bağımlılık: bash + awk.
#   ./build.sh           işaretli blokları yeniden yazar (idempotent)
#   ./build.sh --check   dosyaları değiştirmez; güncel olmayanı yazıp çıkış 1; sonra (node varsa) tools/check-links.mjs
# İşaret:  <!-- @include ad anahtar=değer anahtar="boşluklu değer" -->  ...üretilen blok...  <!-- @end ad -->
# Partial söz dizimi: {{k}} · {{k|varsayılan}} · {{aria:k}} (active=k ise aria-current="page") · {{id:k}} (k doluysa id="…")
#   tek satırlık {{css}} / {{scripts}} (boşlukla ayrılmış ad listesi → <link> / <script defer>)
#   satır blokları: {{#k}}…{{/}} (k dolu) · {{^k}}…{{/}} (k boş) · {{#k=v}} / {{^k=v}}
# Çıkış: 0 tamam · 1 --check'te fark ya da kırık bağlantı · 2 hata (eşleşmeyen işaret, bilinmeyen partial, doldurulmamış {{…}})
set -euo pipefail
cd "$(dirname "$0")"

mode=build
case "${1:-}" in
  "") ;;
  --check) mode=check ;;
  *) echo "kullanım: ./build.sh [--check]" >&2; exit 2 ;;
esac

PROG=$(cat <<'AWK'
function fail(msg) {
  printf "build.sh: %s:%d: %s\n", FILENAME, FNR, msg > "/dev/stderr"
  bad = 1
  exit 2
}
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }

# name: partial adı; satır listesi PL[ad,i] içine bir kez yüklenir
function load(name,    f, line, n, r) {
  if (name in NL) return
  f = "partials/" name ".html"
  n = 0
  while ((r = (getline line < f)) > 0) PL[name, ++n] = line
  close(f)
  if (r < 0) fail("bilinmeyen partial: " name)
  NL[name] = n
}

# öznitelik dizgesi → A[anahtar]
function parse_attrs(s,    i, j, e, k, v) {
  split("", A)
  s = trim(s)
  while (s != "") {
    i = index(s, "=")
    j = index(s, " ")
    if (i == 0 || (j > 0 && j < i)) {
      if (j == 0) { A[s] = "1"; s = "" }
      else { A[substr(s, 1, j - 1)] = "1"; s = trim(substr(s, j + 1)) }
      continue
    }
    k = substr(s, 1, i - 1)
    s = substr(s, i + 1)
    if (substr(s, 1, 1) == "\"") {
      s = substr(s, 2)
      e = index(s, "\"")
      if (e == 0) fail("kapanmamış tırnak: " k)
      v = substr(s, 1, e - 1)
      s = trim(substr(s, e + 1))
    } else {
      e = index(s, " ")
      if (e == 0) { v = s; s = "" } else { v = substr(s, 1, e - 1); s = trim(substr(s, e + 1)) }
    }
    A[k] = v
  }
}

function cond_true(expr,    neg, p, k, v, r) {
  neg = (substr(expr, 1, 1) == "^")
  expr = substr(expr, 2)
  p = index(expr, "=")
  if (p) { k = substr(expr, 1, p - 1); v = substr(expr, p + 1); r = ((k in A) && A[k] == v) }
  else { k = expr; r = ((k in A) && A[k] != "") }
  return neg ? !r : r
}

function resolve(tok,    k, d, p) {
  if (substr(tok, 1, 5) == "aria:") {
    k = substr(tok, 6)
    return (("active" in A) && A["active"] == k) ? " aria-current=\"page\"" : ""
  }
  if (substr(tok, 1, 3) == "id:") {
    k = substr(tok, 4)
    return ((k in A) && A[k] != "") ? " id=\"" A[k] "\"" : ""
  }
  p = index(tok, "|")
  if (p) { k = substr(tok, 1, p - 1); d = substr(tok, p + 1); return (k in A) ? A[k] : d }
  if (!(tok in A)) fail("doldurulmamış {{" tok "}} (partial: " cur ")")
  return A[tok]
}

function subst(s,    out, p, q, tok) {
  out = ""
  while ((p = index(s, "{{")) > 0) {
    q = index(s, "}}")
    if (q == 0 || q < p) fail("kapanmamış {{ (partial: " cur ")")
    out = out substr(s, 1, p - 1)
    tok = substr(s, p + 2, q - p - 2)
    s = substr(s, q + 2)
    out = out resolve(tok)
  }
  return out s
}

function emit(s) { if (s == "") print ""; else print bind s }

function render(name,    i, n, line, t, lead, depth, nfalse, m, k, TK, ST, tag) {
  load(name)
  n = NL[name]
  depth = 0; nfalse = 0
  for (i = 1; i <= n; i++) {
    line = PL[name, i]
    t = trim(line)
    if (t ~ /^\{\{[#^][^}]*\}\}$/) {
      depth++
      ST[depth] = cond_true(substr(t, 3, length(t) - 4))
      if (!ST[depth]) nfalse++
      continue
    }
    if (t == "{{/}}") {
      if (depth == 0) fail("eşleşmeyen {{/}} (partial: " name ")")
      if (!ST[depth]) nfalse--
      depth--
      continue
    }
    if (nfalse > 0) continue
    match(line, /^[ \t]*/)
    lead = substr(line, 1, RLENGTH)
    if (t == "{{css}}" || t == "{{scripts}}") {
      tag = substr(t, 3, length(t) - 4)
      if (!(tag in A)) { if (tag == "css") fail("css özniteliği eksik"); continue }
      m = split(A[tag], TK, " ")
      for (k = 1; k <= m; k++) {
        if (tag == "css") emit(lead "<link rel=\"stylesheet\" href=\"" TK[k] ".css\">")
        else emit(lead "<script src=\"" TK[k] ".js\" defer></script>")
      }
      continue
    }
    emit(subst(line))
  }
  if (depth != 0) fail("kapanmamış koşul bloğu (partial: " name ")")
}

{
  t = trim($0)
  if (t ~ /^<!-- @include [a-z0-9-]+( [^>]*)? -->$/) {
    if (inb) fail("@include \"" cur "\" bloğu @end ile kapanmadan yeni @include başladı")
    body = t
    sub(/^<!-- @include /, "", body)
    sub(/ -->$/, "", body)
    sp = index(body, " ")
    if (sp == 0) { cur = body; attrs = "" } else { cur = substr(body, 1, sp - 1); attrs = substr(body, sp + 1) }
    match($0, /^[ \t]*/)
    bind = substr($0, 1, RLENGTH)
    parse_attrs(attrs)
    print $0
    print bind "<!-- DÜZENLEME: partials/" cur ".html dosyasını değiştirin, sonra ./build.sh çalıştırın -->"
    render(cur)
    inb = 1
    next
  }
  if (t ~ /^<!-- @end [a-z0-9-]+ -->$/) {
    name = t
    sub(/^<!-- @end /, "", name)
    sub(/ -->$/, "", name)
    if (!inb) fail("eşleşmeyen @end " name)
    if (name != cur) fail("@end " name " ama açık blok: " cur)
    print bind "<!-- @end " cur " -->"
    inb = 0
    next
  }
  if (inb) next
  print $0
}
END {
  if (bad) exit 2
  if (inb) { printf "build.sh: %s: kapanmamış @include %s (@end yok)\n", FILENAME, cur > "/dev/stderr"; exit 2 }
}
AWK
)

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
rc=0
stale=()
for f in ./*.html; do
  f=${f#./}
  [ -f "$f" ] || continue
  awk "$PROG" "$f" > "$tmp" || { echo "build.sh: $f işlenemedi" >&2; exit 2; }
  if cmp -s "$tmp" "$f"; then continue; fi
  if [ "$mode" = check ]; then
    stale+=("$f")
  else
    new=$(mktemp "$f.XXXXXX")
    cp -p "$f" "$new"
    cat "$tmp" > "$new"
    mv "$new" "$f"
    echo "güncellendi: $f"
  fi
done

if [ "$mode" = check ]; then
  if [ "${#stale[@]}" -gt 0 ]; then
    for f in "${stale[@]}"; do echo "güncel değil (./build.sh çalıştırın): $f" >&2; done
    rc=1
  fi
  if command -v node >/dev/null 2>&1; then
    node tools/check-links.mjs || rc=1
  else
    echo "uyarı: node bulunamadı, tools/check-links.mjs atlandı" >&2
  fi
fi
exit "$rc"

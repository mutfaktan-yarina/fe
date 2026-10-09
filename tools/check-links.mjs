#!/usr/bin/env node
// Kırık link denetleyicisi: bağımlılık yok. Kullanım: node tools/check-links.mjs
// Kontrol edilenler:
//   HTML: href / src / action / poster / srcset (yerel dosya var mı, #çapa hedef sayfada var mı)
//   JS  : location.href/assign/replace ve window.open ile gidilen *.html hedefleri
//   CSS : url(...) ve @import (dosyaya göre göreli)
// Çıkış kodu: kırık bağlantı varsa 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', '.plan', 'node_modules', 'tests', 'tools', 'partials']);
const files = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : files(path.join(dir, e.name), ext))
  : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []);
const read = f => fs.readFileSync(f, 'utf8');
const rel = f => path.relative(root, f);
const isExternal = u => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u);   // http:, mailto:, tel:, data:, javascript:, //cdn…
const idsCache = new Map();
const idsOf = f => {
  if (!idsCache.has(f)) idsCache.set(f, new Set([...read(f).matchAll(/\s(?:id|name)="([^"]+)"/g)].map(m => m[1])));
  return idsCache.get(f);
};

const broken = [];
const linkedPages = new Set();
const report = (from, url, why) => broken.push(`${rel(from)}  →  ${url}   (${why})`);

function check(from, raw, { anchorsOk = true } = {}) {
  const url = raw.trim();
  if (!url || isExternal(url)) return;
  const [beforeHash, hash = ''] = url.split('#');
  const pathPart = beforeHash.split('?')[0];
  if (pathPart.includes('${') || pathPart.includes('{{')) return;   // yol dinamikse atla; yalnız sorgu dizgesi şablonluysa denetle
  const target = pathPart === '' ? from : path.resolve(path.dirname(from), pathPart);
  if (pathPart !== '' && !fs.existsSync(target)) return report(from, url, 'dosya yok');
  if (pathPart !== '' && fs.statSync(target).isDirectory()) return;
  if (target.endsWith('.html')) linkedPages.add(target);
  if (anchorsOk && hash && target.endsWith('.html') && !idsOf(target).has(hash) && !['top'].includes(hash))
    report(from, url, `#${hash} hedef sayfada yok`);
}

// HTML
const htmlFiles = files(root, '.html');
for (const f of htmlFiles) {
  const html = read(f).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/\s(?:href|src|action|poster)="([^"]*)"/g)) check(f, m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) m[1].split(',').forEach(s => check(f, s.trim().split(/\s+/)[0]));
}
// JS: sayfa gezinmeleri
for (const f of files(root, '.js')) {
  const js = read(f);
  for (const m of js.matchAll(/(?:location\.(?:href|assign|replace)\s*(?:=|\()\s*|window\.open\(\s*)['"`]([^'"`]+)['"`]/g)) check(f, m[1], { anchorsOk: true });
  // birleştirmeyle kurulan adresler: 'sayfa.html?ref=' + x  → yalnız *.html başlangıcını denetle
  for (const m of js.matchAll(/['"`]([A-Za-z0-9_./-]+\.html)(?=[?#'"`])/g)) check(f, m[1], { anchorsOk: false });
}
// CSS
for (const f of files(root, '.css')) {
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) check(f, m[1], { anchorsOk: false });
  for (const m of css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) check(f, m[1], { anchorsOk: false });
}

const unique = [...new Set(broken)];
const orphans = htmlFiles.filter(f => !linkedPages.has(f) && path.basename(f) !== 'index.html');
console.log(`Sayfa: ${htmlFiles.length} · kırık bağlantı: ${unique.length}` + (orphans.length ? ` · hiçbir yerden bağlanmayan sayfa: ${orphans.map(rel).join(', ')}` : ''));
unique.forEach(l => console.log('  ✗ ' + l));
process.exit(unique.length ? 1 : 0);

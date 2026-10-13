// Yaş şartı testi: node --test tools/age-eligibility.test.mjs
// Kural: 31.12.2026 itibarıyla 18–30 yaş = doğum 1996-01-01 … 2008-12-31 (iki uç dahil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const win = {};
vm.runInNewContext(readFileSync(new URL('../ui.js', import.meta.url), 'utf8'), { window: win, document: new Proxy({}, { get: () => () => {} }), localStorage: {} });
const ok = win.MYUI.isAgeEligible;

test('31.12.2026 tarihinde 18 olan (2008-12-31) kabul edilir', () => assert.equal(ok('2008-12-31'), true));
test('31.12.2026 tarihinde 17 olan (2009-01-01) reddedilir', () => assert.equal(ok('2009-01-01'), false));
test('31.12.2026 tarihinde 30 olan (1996-01-01) kabul edilir', () => assert.equal(ok('1996-01-01'), true));
test('31.12.2026 tarihinde 31 olan (1995-12-31) reddedilir', () => assert.equal(ok('1995-12-31'), false));
test('geçersiz tarih ve biçimler reddedilir', () => {
  for (const v of ['', null, undefined, '2000-02-30', '2001-02-29', '2000-13-01', '31.12.2008']) assert.equal(ok(v), false, String(v));
});
test('artık yıl günü kabul edilir', () => assert.equal(ok('2000-02-29'), true));

/* Mutfaktan Yarına — puanlama modülü (spec §5).
 * UMD, bağımlılıksız: tarayıcıda window.MYScoring, Node'da module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MYScoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Sabitler ----
  const LIMIT = 25;                    // Jüri Aday Listesi kontenjanı
  const MIN_AGE = 18;                  // başvuru tarihinde tamamlanmış yaş
  const BIRTH_CUTOFF = '1997-01-01';   // 31 Aralık 2026'ya kadar 30'u doldurmamış

  const BIZTYPES = ['sahis', 'sirket', 'kooperatif'];

  const Q12_MAX = 20;                  // kadın oranı (kadın / toplam × 20)
  const Q13_FALLBACK_MAX = 15;         // Δ ≥ +3
  const Q13_STEPS = { 0: 4, 1: 8, 2: 11 }; // Δ<0 → 0, Δ≥3 → 15
  const Q14 = { none: 3.5, zero: 0, less_half: 5, half_more: 7, all: 10 };
  const Q15 = { yes: 5, no: 0 };
  const Q21 = { yes: 8, no: 0 };
  const Q21_COOP = 8;                  // kooperatif her zaman 8
  const Q22 = { mutfak: 6, masa: 6, istihdam: 6, dekorasyon: 3, tanitim: 3, borc: 3 };
  const Q22_PICKS = 2;
  const Q22_MAX = 12;

  const PRE_QUESTIONS = 6;
  const PRE_ITEM_MAX = 5;
  const SYSTEM_MAX = 70;
  const PRE_MAX = PRE_QUESTIONS * PRE_ITEM_MAX; // 30

  // ---- Yardımcılar ----
  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function has(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key);
  }

  function count(value, name) {
    if (value === null || value === undefined || value === '') {
      throw new Error(name + ' değeri eksik');
    }
    const n = Number(value);
    if (!isFinite(n) || n < 0) {
      throw new Error(name + ' geçersiz: ' + value);
    }
    return n;
  }

  function lookup(map, key, name) {
    if (!has(map, key)) throw new Error(name + ' bilinmeyen değer: ' + key);
    return map[key];
  }

  function pad(n, len) {
    let s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  // 'YYYY-MM-DD' ve gerçek bir takvim günü ise true.
  function isValidISO(iso) {
    if (typeof iso !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  function localTodayISO() {
    const now = new Date();
    return pad(now.getFullYear(), 4) + '-' + pad(now.getMonth() + 1, 2) + '-' + pad(now.getDate(), 2);
  }

  // ---- Puanlama kuralları ----
  function scoreQ12(female, total) {
    if (total <= 0) return 0;
    const ratio = Math.min(Math.max(female / total, 0), 1);
    return Math.round(ratio * Q12_MAX * 10) / 10;
  }

  function scoreQ13(q11, q13) {
    const delta = q11 - q13;
    if (delta < 0) return 0;
    if (delta >= 3) return Q13_FALLBACK_MAX;
    return Q13_STEPS[delta];
  }

  function scoreQ22(picks) {
    if (!Array.isArray(picks) || picks.length !== Q22_PICKS) {
      throw new Error('q22 tam ' + Q22_PICKS + ' seçim olmalı');
    }
    if (picks[0] === picks[1]) throw new Error('q22 seçimleri farklı olmalı');
    const sum = picks.reduce(function (acc, key) {
      return acc + lookup(Q22, key, 'q22');
    }, 0);
    if (sum > Q22_MAX) throw new Error('q22 toplamı ' + Q22_MAX + ' puanı aşamaz');
    return sum;
  }

  /**
   * Sistem Puanı (70).
   * @param {{biztype:string,q11:number,q12:number,q13:number,q14:string,q15:string,q21:string,q22:string[]}} a
   * @returns {{part1:number,part2:number,total:number,items:{q12:number,q13:number,q14:number,q15:number,q21:number,q22:number}}}
   */
  function systemScore(a) {
    if (!a || typeof a !== 'object') throw new Error('Başvuru verisi eksik');
    if (BIZTYPES.indexOf(a.biztype) === -1) throw new Error('biztype bilinmeyen değer: ' + a.biztype);

    const q11 = count(a.q11, 'q11');
    const q12 = count(a.q12, 'q12');
    const q13 = count(a.q13, 'q13');

    const items = {
      q12: scoreQ12(q12, q11),
      q13: scoreQ13(q11, q13),
      q14: lookup(Q14, a.q14, 'q14'),
      q15: lookup(Q15, a.q15, 'q15'),
      q21: a.biztype === 'kooperatif' ? Q21_COOP : lookup(Q21, a.q21, 'q21'),
      q22: scoreQ22(a.q22)
    };

    const part1 = round1(items.q12 + items.q13 + items.q14 + items.q15);
    const part2 = round1(items.q21 + items.q22);
    return { part1: part1, part2: part2, total: round1(part1 + part2), items: items };
  }

  /**
   * Başvuru tarihinde >= 18 tam yaş (gün/ay dahil) VE doğum >= 1997-01-01.
   * Geçersiz tarih -> false.
   */
  function isAgeEligible(birthISO, todayISO) {
    const today = todayISO === undefined ? localTodayISO() : todayISO;
    if (!isValidISO(birthISO) || !isValidISO(today)) return false;
    if (birthISO < BIRTH_CUTOFF) return false;
    // Bugünün gün/ayı, 18 yıl öncesine taşınır; doğum tarihi bu eşiğe eşit ya da öncesi olmalı.
    const threshold = pad(+today.slice(0, 4) - MIN_AGE, 4) + today.slice(4);
    return birthISO <= threshold;
  }

  /** Ön Değerlendirme Puanı (30): 6 soru, her biri 0..5. */
  function preTotal(scores) {
    if (!Array.isArray(scores) || scores.length !== PRE_QUESTIONS) {
      throw new Error('preTotal ' + PRE_QUESTIONS + ' puan bekler');
    }
    let sum = 0;
    for (let i = 0; i < scores.length; i++) {
      const n = scores[i];
      if (typeof n !== 'number' || !isFinite(n) || n < 0 || n > PRE_ITEM_MAX) {
        throw new Error('Ö' + (i + 1) + ' puanı 0..' + PRE_ITEM_MAX + ' olmalı');
      }
      sum += n;
    }
    return round1(sum);
  }

  /** Toplam Ön Sıralama Puanı (100) = Sistem Puanı (70) + Ön Değerlendirme Puanı (30). */
  function totalPre(systemTotal, preTotalScore) {
    if (typeof systemTotal !== 'number' || !isFinite(systemTotal) || systemTotal < 0 || systemTotal > SYSTEM_MAX) {
      throw new Error('Sistem Puanı 0..' + SYSTEM_MAX + ' olmalı');
    }
    if (typeof preTotalScore !== 'number' || !isFinite(preTotalScore) || preTotalScore < 0 || preTotalScore > PRE_MAX) {
      throw new Error('Ön Değerlendirme Puanı 0..' + PRE_MAX + ' olmalı');
    }
    return round1(systemTotal + preTotalScore);
  }

  /**
   * Jüri Aday Listesi: totalScore azalan; ilk 25 + 25. ile eşit puanlı herkes.
   * totalScore'u sayı olmayan (null/undefined/NaN) kayıtlar hariç.
   */
  function juryCandidates(apps) {
    if (!Array.isArray(apps)) return [];
    const scored = apps.filter(function (app) {
      return app && typeof app.totalScore === 'number' && isFinite(app.totalScore);
    });
    // Array.prototype.sort kararlı: eşit puanlı kayıtlar giriş sırasını korur.
    scored.sort(function (a, b) { return b.totalScore - a.totalScore; });
    if (scored.length <= LIMIT) return scored;
    const cutoff = scored[LIMIT - 1].totalScore;
    return scored.filter(function (app) { return app.totalScore >= cutoff; });
  }

  return {
    systemScore: systemScore,
    isAgeEligible: isAgeEligible,
    preTotal: preTotal,
    totalPre: totalPre,
    juryCandidates: juryCandidates
  };
});

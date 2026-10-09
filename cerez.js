// cerez.js - Çerez tercih paneli (yalnızca arayüz). Seçim tarayıcıda 'cerez_tercih' anahtarında saklanır.
// TODO(analytics): Google Analytics bağlandığında 'cerez:degisti' olayını dinleyip yalnızca analytics === true ise yükleyin.
(() => {
  const KEY = 'cerez_tercih';
  const CATS = [
    { id: 'zorunlu', name: 'Kesinlikle Gerekli', desc: 'Site/başvuru sistemi işlevi, oturum ve/veya güvenlik', locked: true },
    { id: 'islevsel', name: 'İşlevsel', desc: 'Tercihlerin hatırlanması / ek işlevler' },
    { id: 'analitik', name: 'Performans / Analitik', desc: 'İstatistik, performans ölçümü ve site geliştirme' }
  ];

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  };
  const write = (v) => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* depolama kapalı: panel her ziyarette görünür */ }
  };

  let panel = null;

  function save(choice) {
    const value = { zorunlu: true, islevsel: !!choice.islevsel, analitik: !!choice.analitik, tarih: new Date().toISOString() };
    write(value);
    document.dispatchEvent(new CustomEvent('cerez:degisti', { detail: value }));
    close();
  }

  function close() {
    if (panel) { panel.remove(); panel = null; }
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => (k === 'text' ? (n.textContent = v) : n.setAttribute(k, v)));
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }

  function open() {
    if (panel) return;
    const saved = read() || {};
    const checks = {};

    const list = el('ul', { hidden: '' });
    CATS.forEach((c) => {
      const input = el('input', { type: 'checkbox', id: 'cerez-' + c.id });
      if (c.locked) { input.checked = true; input.disabled = true; } else { input.checked = !!saved[c.id]; checks[c.id] = input; }
      list.appendChild(el('li', {}, [
        el('label', { for: input.id }, [input, el('span', {}, [el('strong', { text: c.name }), el('small', { text: c.desc })])])
      ]));
    });

    const link = el('a', { href: 'cerez-politikasi.html', text: 'Çerez Aydınlatma Metni ve Politikası' });
    const text = el('p', {}, [
      document.createTextNode('Sitemizin çalışması için kesinlikle gerekli çerezler kullanılır. İşlevsel ve performans / analitik çerezler yalnızca onayınızla etkinleştirilir. Ayrıntılar için '),
      link,
      document.createTextNode("'nı inceleyebilirsiniz.")
    ]);

    const btnReject = el('button', { type: 'button', class: 'btn btn-outline', text: 'Reddet' });
    const btnPrefs = el('button', { type: 'button', class: 'btn btn-outline', 'aria-expanded': 'false', text: 'Tercihler' });
    const btnAccept = el('button', { type: 'button', class: 'btn', text: 'Kabul Et' });
    const btnSave = el('button', { type: 'button', class: 'btn', text: 'Seçimi Kaydet', hidden: '' });

    btnReject.addEventListener('click', () => save({}));
    btnAccept.addEventListener('click', () => save({ islevsel: true, analitik: true }));
    btnSave.addEventListener('click', () => save({ islevsel: checks.islevsel.checked, analitik: checks.analitik.checked }));
    btnPrefs.addEventListener('click', () => {
      const show = list.hidden;
      list.hidden = !show;
      btnSave.hidden = !show;
      btnPrefs.setAttribute('aria-expanded', String(show));
    });

    panel = el('section', { id: 'cerez-panel', role: 'dialog', 'aria-labelledby': 'cerez-baslik' }, [
      el('h2', { id: 'cerez-baslik', text: 'Çerez Tercihleri' }),
      text,
      list,
      el('div', {}, [btnReject, btnPrefs, btnSave, btnAccept])
    ]);
    document.body.appendChild(panel);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!read()) open();
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cerez-ac]');
      if (t) { e.preventDefault(); open(); }
    });
  });
})();

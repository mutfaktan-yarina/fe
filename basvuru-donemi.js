// Başvuru dönemi kapısı (kayit.html, basvuru.html): takvim "açık" değilse [data-apply-gate] öğeleri gizlenir ve
// yerine bilgi kutusu gösterilir. Takvim okunamazsa sayfa olduğu gibi kalır (sunucu yine de dönem dışını reddeder).
(function () {
  'use strict';
  var CLOSED_TEXT = [
    'Başvurularımız tamamlanmıştır. İlginiz için teşekkür ederiz.',
    'Sonuçlar 25 Aralık 2026 tarihinde açıklanacaktır.',
    'Kaydolduğunuz e-posta adreslerinizi ve resmi duyuru kanallarımızı takip edin.'
  ];

  function trDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  }

  function show(gates, state, cal) {
    var box = document.createElement('section');
    box.id = 'apply-closed';
    box.className = 'apply-closed-notice';
    box.setAttribute('role', 'status');
    box.dataset.state = state;
    var h = document.createElement('h2');
    h.textContent = state === 'before' ? 'Başvurular henüz başlamadı' : 'Başvurular tamamlandı';
    box.appendChild(h);
    var lines = state === 'before'
      ? ['Başvurular ' + (trDate(cal.apply_open) || 'ilan edilen') + ' tarihinde açılacaktır.']
      : CLOSED_TEXT;
    lines.forEach(function (t) {
      var p = document.createElement('p');
      p.textContent = t;
      box.appendChild(p);
    });
    var links = document.createElement('p');
    var home = document.createElement('a');
    home.href = 'index.html';
    home.textContent = 'Ana Sayfaya Dön';
    links.appendChild(home);
    if (document.body.dataset.applyGatePanel) {
      var panel = document.createElement('a');
      panel.href = 'panel.html';
      panel.textContent = 'Başvuru Panelime Git';
      links.appendChild(panel);
    }
    box.appendChild(links);
    gates[0].parentNode.insertBefore(box, gates[0]);
    gates.forEach(function (g) { g.hidden = true; g.setAttribute('inert', ''); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var gates = Array.prototype.slice.call(document.querySelectorAll('[data-apply-gate]'));
    if (!gates.length || !window.MYAPI || !window.MYAPI.getCalendar) return;
    window.MYAPI.getCalendar().then(function (cal) {
      if (!cal || (cal.apply_state !== 'closed' && cal.apply_state !== 'before')) return;
      show(gates, cal.apply_state, cal);
    }).catch(function () { /* takvim okunamadı: formu olduğu gibi bırak */ });
  });
})();

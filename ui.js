// MYUI — Ortak arayüz yardımcıları (spec §5b)
window.MYUI = (() => {
  'use strict';

  /**
   * localStorage'den JSON oku; bozuk/yok -> fallback
   */
  function readJSON(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * localStorage'ye JSON yaz (try/catch'li)
   */
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Sessiz başarısızlık (kotası dolu vb.)
    }
  }

  /**
   * E-posta regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   */
  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  /**
   * Modal yönetimi: açık modallar bir yığında tutulur; tek klavye ve tıklama dinleyicisi en üstteki modalı yönetir.
   *  - Açılışta odak modalın ilk etkileşimli öğesine (görünene kadar birkaç kare denenir: visibility geçişi)
   *  - Tab / Shift+Tab modal içinde döner (odak tuzağı), Esc en üstteki modalı kapatır
   *  - Kapanışta odak modalı açan öğeye döner; body.no-scroll yalnızca son modal kapanınca kalkar
   */
  const openModals = [];
  const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

  function focusableIn(el) {
    return [...el.querySelectorAll(FOCUSABLE)].filter(n =>
      !n.disabled && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden');
  }

  function focusInto(el, triesLeft = 3) {
    const target = focusableIn(el)[0] || el;
    if (target === el) el.setAttribute('tabindex', '-1');
    target.focus();
    if (!el.contains(document.activeElement) && triesLeft > 0) {
      requestAnimationFrame(() => {
        if (openModals.some(m => m.el === el)) focusInto(el, triesLeft - 1);
      });
    }
  }

  let downOnBackdrop = null;
  document.addEventListener('mousedown', (e) => { downOnBackdrop = e.target; });

  document.addEventListener('keydown', (e) => {
    const top = openModals[openModals.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(top.el);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusableIn(top.el);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!top.el.contains(active) || (e.shiftKey && active === first)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Arka plan (modal kabının kendisi): basma ve bırakma ikisi de arka planda olmalı (içeriden seçim sürüklemesi kapatmasın)
  document.addEventListener('click', (e) => {
    const top = openModals[openModals.length - 1];
    if (top && e.target === top.el && downOnBackdrop === top.el) closeModal(top.el);
  });

  /**
   * Modal aç: active, hidden kaldır, body.no-scroll ekle, odak modala geç
   */
  function openModal(el) {
    if (!el || openModals.some(m => m.el === el)) return;
    const trigger = document.activeElement !== document.body ? document.activeElement : null;
    openModals.push({ el, trigger });
    el.classList.add('active');
    el.removeAttribute('hidden');
    document.body.classList.add('no-scroll');
    focusInto(el);
  }

  /**
   * Modal kapat: active kaldır, hidden ekle; son modalsa body.no-scroll kalkar; odak açan öğeye döner
   */
  function closeModal(el) {
    if (!el) return;
    const i = openModals.findIndex(m => m.el === el);
    const trigger = i >= 0 ? openModals.splice(i, 1)[0].trigger : null;
    el.classList.remove('active');
    el.setAttribute('hidden', '');
    if (!openModals.length) document.body.classList.remove('no-scroll');
    if (trigger && trigger.isConnected) trigger.focus();
  }

  /**
   * Şifre göster/gizle toggle: tek SVG çifti, aria-label "Şifreyi Göster/Gizle"
   */
  function bindPasswordToggle(btn, ...inputs) {
    if (!btn || inputs.length === 0) return;

    btn.setAttribute('aria-label', 'Şifreyi Göster');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = inputs[0].type === 'password';
      inputs.forEach(inp => {
        inp.type = isPassword ? 'text' : 'password';
      });
      btn.setAttribute('aria-label', isPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster');
      btn.innerHTML = isPassword
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
  }

  /**
   * Şifre gücü: uzunluk>=8, büyük+küçük, rakam, sembol -> 0-4 puan
   * score: 0='Çok Zayıf', 1='Zayıf', 2='Orta', 3='Güçlü', 4='Çok Güçlü'
   */
  function passwordStrength(pwd) {
    if (!pwd) return { score: 0, label: 'Çok Zayıf' };

    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    const labels = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
    return { score, label: labels[score] };
  }

  // Yönetim/editör üst çubuğu (partials/header-editor.html) tek yerden kurulur: kimlik, rol rozeti, yönetici
  // bağlantıları ve çıkış. Sayfa betikleri yalnızca kendi oturum korumasını yapar.
  function initTopbar() {
    const bar = document.querySelector('.topbar .editor-identity');
    const user = readJSON('currentUser');
    if (!bar || !user) return;
    const isAdmin = user.role === 'admin';
    const stored = readJSON('editorUser') || user;
    const email = (stored.email || '').trim();
    const name = (stored.name || stored.display_name || '').trim();
    const nameEl = document.getElementById('currentEditorName');
    const mailEl = document.getElementById('currentEditorMail');
    if (nameEl) nameEl.textContent = name && name !== email ? name : (isAdmin ? 'Sistem Yöneticisi' : 'Değerlendirici Editör');
    if (mailEl) {
      mailEl.textContent = email;
      mailEl.style.display = email ? '' : 'none';
    }
    if (isAdmin) {
      document.querySelectorAll('[data-admin-only]').forEach(el => el.removeAttribute('hidden'));
      const badge = bar.querySelector('.role-badge:not([id])');
      if (badge) {
        badge.textContent = 'Yönetici (Admin)';
        badge.dataset.role = 'admin';
      }
    }
    const logout = document.getElementById('btnLogout');
    if (logout) {
      logout.addEventListener('click', async (e) => {
        e.preventDefault();
        if (window.MYAPI) {
          try { await MYAPI.logout(); } catch (err) { /* oturum zaten kapalı olabilir */ }
        }
        try { localStorage.removeItem('currentUser'); } catch (err) { /* yoksay */ }
        window.location.href = 'giris.html';
      });
    }
  }
  document.addEventListener('DOMContentLoaded', initTopbar);

  /**
   * Onay / bilgi penceresi: tarayıcının confirm()/alert() yerine. <dialog id="confirmDialog"> ilk çağrıda
   * oluşturulur (sayfalara işaret koymak gerekmez). Promise<boolean> döner: Onay -> true, Vazgeç/Esc -> false.
   * { title, text, ok = 'Tamam', cancel = 'Vazgeç', danger = false, info = false } (info: yalnız tek düğme)
   */
  let confirmPending = null; // açık pencerenin Promise'ini çözen işlev
  function confirmDialog({ title, text, ok = 'Tamam', cancel = 'Vazgeç', danger = false, info = false }) {
    let dlg = document.getElementById('confirmDialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'confirmDialog';
      dlg.setAttribute('aria-labelledby', 'confirmTitle');
      dlg.innerHTML = '<form method="dialog"><h3 id="confirmTitle"></h3><p></p>' +
        '<div><button type="submit" value="cancel"></button><button type="submit" value="ok" autofocus></button></div></form>';
      document.body.appendChild(dlg);
      // 'close' olayı kapanıştan sonra gecikmeli gelir; pencere yeniden açılmışsa bu olay eskisine aittir, yok sayılır.
      dlg.addEventListener('close', () => {
        if (dlg.open || !confirmPending) return;
        const done = confirmPending;
        confirmPending = null;
        done(dlg.returnValue === 'ok');
      });
    }
    // Açık/askıdaki bir önceki pencere varsa vazgeçilmiş sayılır; yanıtı yeni pencereye karışmaz.
    if (confirmPending) { const prev = confirmPending; confirmPending = null; prev(false); }
    if (dlg.open) dlg.close('cancel');
    dlg.querySelector('h3').textContent = title;
    dlg.querySelector('p').textContent = text;
    const okBtn = dlg.querySelector('button[value=ok]');
    okBtn.textContent = ok;
    okBtn.dataset.danger = String(danger);
    const cancelBtn = dlg.querySelector('button[value=cancel]');
    cancelBtn.textContent = cancel;
    cancelBtn.hidden = info;
    dlg.returnValue = 'cancel';
    return new Promise(resolve => {
      confirmPending = resolve;
      dlg.showModal();
    });
  }

  return {
    confirmDialog,
    readJSON,
    writeJSON,
    isEmail,
    openModal,
    closeModal,
    bindPasswordToggle,
    passwordStrength
  };
})();

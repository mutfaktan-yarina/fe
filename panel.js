document.addEventListener('DOMContentLoaded', async () => {
  // Basit istemci koruması ve oturum denetimi
  const currentUser = MYUI.readJSON('currentUser');
  if (!currentUser || (currentUser.role !== 'applicant' && currentUser.role !== 'member')) {
    window.location.replace('giris.html');
    return;
  }

  // Çıkış düğmesi sayfa verisi gelmeden de çalışmalı: işleyici ilk await'ten ÖNCE bağlanır (bağlanmasaydı erken tıklama
  // yalnızca giris.html bağlantısını izler, sunucu oturumu ve yerel kayıtlar açık kalırdı).
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    let leaving = false;
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      if (leaving) return;
      leaving = true;
      function done() {
        try { clearUserDraftData(); } catch (err) {}
        try { localStorage.removeItem('currentUser'); } catch (err) {}
        window.location.href = 'giris.html';
      }
      if (window.MYAPI && typeof window.MYAPI.logout === 'function') {
        window.MYAPI.logout().catch(function () {}).finally(done);
      } else {
        done();
      }
    });
  }

  if (window.MYAPI && typeof window.MYAPI.session === 'function') {
    window.MYAPI.session().catch((err) => {
      if (err.status === 401) {
        try { localStorage.removeItem('currentUser'); } catch (e) {}
        window.location.replace('giris.html');
      }
    });
  }

  // Doğrulama belgesi sunucuda ayrı kayıttır; sayfa yalnız sunucunun tuttuğu belgeyi gösterir.
  function adoptServerDocs(app) {
    app.verificationDocs = Array.isArray(app.verificationDocs) ? app.verificationDocs : [];
  }

  // Sunucu tek doğru kaynaktır: yeni bir tarayıcıda ya da cihazda yerel kayıt boştur; önce sunucudan okunur, sayfa
  // gerçek başvuruyla çizilir. Sunucu "başvuru yok" derse eski yerel kopya silinir (aynı tarayıcıda başka biri girmiş olabilir).
  // Sunucuya ulaşılamazsa (çevrimdışı) yerel kayıtla devam edilir.
  let loadFailed = false;
  if (window.MYAPI && typeof window.MYAPI.getApplication === 'function' && window.MYCONFIG && window.MYCONFIG.apiBase) {
    try {
      const res = await window.MYAPI.getApplication();
      if (res && res.application) {
        const remote = res.application;
        if (remote.ref && !remote.refNo) remote.refNo = remote.ref;
        adoptServerDocs(remote);
        MYUI.writeJSON(getAppKey(), remote);
      } else if (res && res.application === null) {
        try { localStorage.removeItem(getAppKey()); localStorage.removeItem(getDraftKey()); } catch (e) {}
      }
    } catch (e) {
      // 401 yukarıdaki oturum denetimiyle girişe yönlendirir; diğer hatalarda yerel kayıt kullanılır, kayıt yoksa durumun alınamadığı söylenir.
      loadFailed = !(e && e.status === 401);
    }
  }

  const modalEdit = document.getElementById('modal-edit-confirm');
  const btnOpenEdit = document.getElementById('btn-open-edit');
  const btnConfirmEdit = document.getElementById('btn-confirm-edit');
  const closeButtons = document.querySelectorAll('[data-close="modal-edit-confirm"]');
  const btnPrint = document.getElementById('btn-print');

  function getUserScopedKey(baseKey) {
    const currentUser = MYUI.readJSON('currentUser');
    if (currentUser && currentUser.email) {
      return baseKey + '_' + btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '');
    }
    return baseKey;
  }

  function getAppKey() { return getUserScopedKey('mutfaktan_application'); }
  function getDraftKey() { return getUserScopedKey('mutfaktan_app_draft'); }

  function clearUserDraftData() {
    const currentUser = MYUI.readJSON('currentUser');
    if (currentUser && currentUser.email) {
      const emailKey = btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '');
      localStorage.removeItem('mutfaktan_application_' + emailKey);
      localStorage.removeItem('mutfaktan_app_draft_' + emailKey);
      localStorage.removeItem('onDegerlendirmeAnswers_' + emailKey);
    }
    // Also clear legacy unscoped keys
    localStorage.removeItem('mutfaktan_application');
    localStorage.removeItem('mutfaktan_app_draft');
  }

  function getStoredData() {
    return MYUI.readJSON(getAppKey()) || MYUI.readJSON(getDraftKey());
  }

  function isFilled(v) {
    return v !== null && v !== undefined && v !== '';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && isFilled(value)) el.textContent = String(value);
  }

  function setVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.removeAttribute('hidden');
      el.style.display = '';
    } else {
      el.setAttribute('hidden', '');
      el.style.display = 'none';
    }
  }

  function formatBirth(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
  }

  const appData = getStoredData();

  // Ön değerlendirme yanıtları yalnızca bu başvurunun ref numarasıyla eşleşiyorsa bu başvuruya aittir.
  const storedAnswers = MYUI.readJSON(getUserScopedKey('onDegerlendirmeAnswers')) || MYUI.readJSON('onDegerlendirmeAnswers');
  const hasAnswers = !!(appData && appData.refNo && storedAnswers && storedAnswers.ref === appData.refNo);

  // Durum -> rozet metni ve süreç çizelgesindeki güncel adım (0 tabanlı).
  const STATUS_INFO = {
    draft: { text: 'Taslak — henüz gönderilmedi', stage: 0 },
    submitted: { text: 'Başvuru Alındı — İnceleme Aşamasında', stage: 1 },
    verifying: { text: 'Belge ve Bilgi Doğrulama Aşamasında', stage: 1 },
    'preeval-open': { text: 'Ön Değerlendirme Aşaması Açıldı', stage: 2 },
    answered: { text: 'Ön Değerlendirme Yanıtları Alındı', stage: 2 },
    scored: { text: 'Ön Değerlendirme Puanlandı', stage: 3 },
    rejected: { text: 'Başvuru Uygun Görülmedi', stage: 0 },
    expired: { text: 'Başvuru Süresi Doldu', stage: 0 }
  };

  let status = 'draft';
  if (appData) {
    status = appData.status || (appData.submittedAt ? 'submitted' : 'draft');
  }
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.submitted;

  const statusTextEl = document.getElementById('status-text');
  if (statusTextEl) {
    if (!appData) {
      statusTextEl.textContent = loadFailed
        ? 'Başvuru durumunuz alınamadı: sunucuya ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.'
        : 'Kayıtlı başvuru bulunamadı';
    } else if (status === 'answered' || (status === 'preeval-open' && hasAnswers)) {
      statusTextEl.textContent = 'Ön Değerlendirme Yanıtları Alındı';
    } else {
      statusTextEl.textContent = statusInfo.text;
    }
  }

  const timelineSteps = document.querySelectorAll('.timeline-steps > div');
  const stage = appData ? statusInfo.stage : 0;
  const isDraft = !!appData && status === 'draft';

  // Taslakta 1. adım "alındı" değil, yapılacak iştir; metinler gönderimden sonra HTML'deki haline döner.
  if (isDraft && timelineSteps[0]) {
    timelineSteps[0].querySelector('h3').textContent = '1. Başvuruyu Gönderin';
    timelineSteps[0].querySelector('p').textContent = 'Formu tamamlayıp gönderin; gönderilene kadar başvurunuz değerlendirilmez.';
  }
  setVisible(document.getElementById('draft-note'), isDraft);
  timelineSteps.forEach((step, i) => {
    step.classList.remove('completed', 'current', 'locked');
    const icon = step.firstElementChild;
    if (i < stage) {
      step.classList.add('completed');
      if (icon) icon.textContent = '✓';
    } else {
      step.classList.add(i === stage ? 'current' : 'locked');
      if (icon) icon.textContent = String(i + 1);
    }
  });

  if (appData) {
    setText('panel-username', appData.fullname || currentUser.name);
    setText('tbl-name', appData.fullname);
    setText('val-refno', appData.refNo);

    if (appData.submittedAt) {
      const d = new Date(appData.submittedAt);
      if (!isNaN(d.getTime())) {
        setText('val-date', d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }));
      }
    } else if (isDraft) {
      setText('val-date', 'Gönderilmedi');
    }

    if (isFilled(appData.birthdate)) setText('tbl-birth', formatBirth(appData.birthdate));
    setText('tbl-phone', appData.phone);
    setText('tbl-email', appData.email);
    setText('tbl-city', appData.city);
    setText('tbl-bizname', appData.bizname);

    if (isFilled(appData.biztype)) {
      const typeMap = {
        sahis: 'Şahıs İşletmesi',
        sirket: 'Şirket (Ltd. / A.Ş.)',
        kooperatif: 'Kadın Kooperatifi'
      };
      setText('tbl-biztype', typeMap[appData.biztype] || appData.biztype);
    }

    setText('tbl-taxno', appData.taxno);
    setText('tbl-bizyear', appData.bizyear);
    setText('tbl-address', appData.address);
    setText('tbl-msa', appData.fileName);

    if (isFilled(appData.q11)) setText('tbl-q11', `${appData.q11} Kişi`);

    if (isFilled(appData.q12)) {
      const total = parseInt(appData.q11, 10);
      const female = parseInt(appData.q12, 10);
      let ratio = '';
      if (total > 0 && !isNaN(female)) {
        ratio = ` (%${Math.round((female / total) * 100)})`;
      }
      setText('tbl-q12', `${appData.q12} Kişi${ratio}`);
    }

    if (isFilled(appData.q13)) setText('tbl-q13', `${appData.q13} Kişi`);

    if (isFilled(appData.q14)) {
      const map14 = {
        none: 'İşe başlayan olmadı',
        zero: 'Oldu, kimse kalmadı',
        less_half: 'Yarıdan azı',
        half_more: 'Yarısı ve fazlası',
        all: 'Tamamı'
      };
      setText('tbl-q14', map14[appData.q14] || appData.q14);
    }

    const yesNo = { yes: 'Evet', no: 'Hayır' };
    if (isFilled(appData.q15)) setText('tbl-q15', yesNo[appData.q15] || appData.q15);
    if (isFilled(appData.q21)) setText('tbl-q21', yesNo[appData.q21] || appData.q21);
  } else {
    setVisible(btnOpenEdit, false);
  }

  // Ön değerlendirme bandı ve doğrulama belgeleri yalnızca aşama açıkken görünür.
  const banner = document.getElementById('banner-preeval');
  const sectionVerifyDocs = document.getElementById('section-verify-docs');
  const verifyDocList = document.getElementById('verify-doc-list');
  const verifyError = document.getElementById('verify-error');
  const verifySuccess = document.getElementById('verify-uploaded-success');
  const badgeVerifyStatus = document.getElementById('badge-verify-status');
  const btnPreevalLink = document.getElementById('btn-preeval-link');

  const isPreEvalOpen = !!appData && status === 'preeval-open';
  setVisible(banner, isPreEvalOpen);
  setVisible(sectionVerifyDocs, isPreEvalOpen);

  // Show deadline banner for draft and submitted applications
  const deadlineBanner = document.getElementById('deadline-banner-panel');
  if (deadlineBanner && appData && (status === 'draft' || status === 'submitted')) {
    deadlineBanner.style.display = 'flex';
  }

  const verifyKinds = (window.MYCONFIG && window.MYCONFIG.verificationKinds) || [{ kind: 'tax', label: 'Doğrulama Belgesi', required: true }];

  function docOfKind(kind) {
    const docs = (appData && appData.verificationDocs) || [];
    return docs.find(d => d && d.kind === kind) || null;
  }

  // Zorunlu türlerin hepsi yüklendiyse (ya da yanıtlar zaten verildiyse) ön değerlendirme sorularına geçilebilir.
  function requiredDocsDone() {
    return hasAnswers || verifyKinds.filter(k => k.required).every(k => docOfKind(k.kind));
  }

  function formatDocMeta(doc) {
    const kb = doc.size >= 1024 * 1024 ? (doc.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(doc.size / 1024)) + ' KB';
    const d = doc.uploadedAt ? new Date(doc.uploadedAt) : null;
    const when = d && !isNaN(d) ? d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    return [kb, when].filter(Boolean).join(' · ');
  }

  function showRowError(row, msg) {
    const el = row.querySelector('[data-role="row-error"]');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function renderVerifyDocs() {
    if (!isPreEvalOpen || !sectionVerifyDocs || !verifyDocList) return;
    verifyDocList.replaceChildren();
    verifyKinds.forEach((k) => {
      const doc = docOfKind(k.kind);
      const row = document.createElement('li');
      row.dataset.kind = k.kind;
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem 1rem;align-items:center;justify-content:space-between;padding:0.75rem 1rem;border:1px solid var(--gray-200,#ddd);border-radius:8px;';

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = k.label + (k.required ? '' : ' (isteğe bağlı)');
      const state = document.createElement('div');
      state.dataset.role = 'doc-state';
      state.style.cssText = 'font-size:0.85rem;color:var(--gray-700);';
      state.textContent = doc ? doc.name + ' — ' + formatDocMeta(doc) : 'Belge bekleniyor';
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:0.8rem;color:var(--gray-700);';
      hint.textContent = 'PDF, JPG veya PNG — en fazla 10 MB';
      info.append(title, state, hint);

      const actions = document.createElement('div');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.jpg,.jpeg,.png';
      input.hidden = true;
      input.dataset.role = 'doc-input';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-panel-outline';
      btn.dataset.role = 'doc-button';
      btn.style.padding = '0.5rem 1rem';
      btn.textContent = doc ? 'Değiştir' : 'Yükle';
      btn.addEventListener('click', () => input.click());
      input.addEventListener('change', () => uploadOne(row, k, input, btn));
      actions.append(input, btn);

      const err = document.createElement('div');
      err.dataset.role = 'row-error';
      err.setAttribute('role', 'alert');
      err.style.cssText = 'display:none;flex-basis:100%;font-size:0.85rem;color:var(--primary);font-weight:600;';

      row.append(info, actions, err);
      verifyDocList.append(row);
    });
    const done = requiredDocsDone();
    if (badgeVerifyStatus) badgeVerifyStatus.textContent = done ? 'Belgeler Yüklendi' : 'Belge Bekleniyor';
    if (verifySuccess) verifySuccess.style.display = done ? 'block' : 'none';
  }

  // Her işlem tek dosyadır ve sonunda ekran sunucudaki gerçek duruma göre yeniden çizilir; böylece başarısız ya da
  // yarım kalan bir yükleme ekranda eski ya da olmayan bir dosya adı bırakmaz.
  async function uploadOne(row, kind, input, btn) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (verifyError) verifyError.style.display = 'none';
    showRowError(row, '');
    // Sunucu aynı kuralları uygular; burada yalnızca gereksiz yüklemeyi önleriz.
    const fileProblem = !/\.(pdf|jpe?g|png)$/i.test(file.name) ? 'Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.'
      : file.size === 0 ? 'Dosya boş; lütfen geçerli bir dosya seçiniz.'
      : file.size > 10 * 1024 * 1024 ? 'Dosya boyutu en fazla 10 MB olabilir.' : '';
    if (fileProblem) {
      input.value = '';
      showRowError(row, fileProblem);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';
    let failure = '';
    if (window.MYAPI && window.MYCONFIG && window.MYCONFIG.apiBase) {
      try {
        await MYAPI.uploadVerificationDoc(file, kind.kind);
      } catch (err) {
        failure = (err.errors && err.errors[0] && err.errors[0].text) || err.message || 'Belge yüklenemedi: ' + file.name;
      }
      try {
        const res = await window.MYAPI.getApplication();
        if (res && res.application && appData) {
          appData.verificationDocs = res.application.verificationDocs || [];
          MYUI.writeJSON(getAppKey(), appData);
        }
      } catch (e) {
        if (!failure) failure = 'Belge yüklendi ancak liste yenilenemedi; sayfayı yenileyiniz.';
      }
    } else if (appData) {
      // Çevrimdışı gösterim modu: yalnızca yerel kayıt.
      const rest = (appData.verificationDocs || []).filter(d => d.kind !== kind.kind);
      appData.verificationDocs = rest.concat([{ kind: kind.kind, name: file.name, size: file.size, uploadedAt: new Date().toISOString() }]);
      MYUI.writeJSON(getAppKey(), appData);
    }
    renderVerifyDocs();
    if (failure) {
      const fresh = verifyDocList.querySelector('[data-kind="' + kind.kind + '"]');
      if (fresh) showRowError(fresh, failure);
    }
  }

  if (isPreEvalOpen) {
    renderVerifyDocs();

    if (btnPreevalLink) {
      btnPreevalLink.addEventListener('click', (e) => {
        if (!requiredDocsDone()) {
          e.preventDefault();
          if (verifyError) {
            verifyError.textContent = 'Ön Değerlendirme sorularına erişebilmek için lütfen önce doğrulama belgelerinizi yükleyiniz.';
            verifyError.style.display = 'block';
          }
          sectionVerifyDocs.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  if (appData && status === 'preeval-open' && hasAnswers) {
    const bannerTitle = document.getElementById('preeval-banner-title');
    const bannerDesc = document.getElementById('preeval-banner-desc');
    const btnText = document.getElementById('btn-preeval-text');
    const btnLink = document.getElementById('btn-preeval-link');
    if (bannerTitle) bannerTitle.textContent = 'Ön Değerlendirme Yanıtlarınız Alındı';
    if (bannerDesc) bannerDesc.textContent = 'Yanıtlarınız kaydedilmiştir ve program ekibi tarafından incelenmektedir.';
    if (btnText) btnText.textContent = 'Cevaplarımı İncele';
    if (btnLink) btnLink.setAttribute('href', 'on-degerlendirme-formu.html?mode=view');
  }

  document.querySelectorAll('.accordion-group button').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.parentElement;
      if (!card) return;
      const isOpen = card.classList.toggle('open');
      header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnOpenEdit) {
    if (appData && status === 'draft') {
      // Taslak zaten düzenlenebilir durumda; onay penceresi gerekmez.
      const label = btnOpenEdit.querySelector('span');
      if (label) label.textContent = 'Başvuruyu Tamamla ve Gönder';
      btnOpenEdit.addEventListener('click', () => {
        window.location.href = 'basvuru.html?mode=edit';
      });
    } else {
      btnOpenEdit.addEventListener('click', () => MYUI.openModal(modalEdit));
    }
  }

  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => MYUI.closeModal(modalEdit));
  });

  if (btnConfirmEdit) {
    btnConfirmEdit.addEventListener('click', async () => {
      btnConfirmEdit.disabled = true;
      function proceed() {
        const current = getStoredData() || {};
        current.status = 'draft';
        current.updatedAt = new Date().toISOString();
        MYUI.writeJSON(getDraftKey(), current);
        MYUI.writeJSON(getAppKey(), current);
        window.location.href = 'basvuru.html?mode=edit';
      }
      if (window.MYAPI && typeof window.MYAPI.reopenApplication === 'function') {
        try {
          await window.MYAPI.reopenApplication();
          proceed();
        } catch (err) {
          btnConfirmEdit.disabled = false;
          if (err.isOfflineDemo) {
            proceed();
            return;
          }
        }
      } else {
        proceed();
      }
    });
  }

  // Şifre Değiştirme Modalı
  const modalPw = document.getElementById('modal-change-password');
  const btnOpenPw = document.getElementById('btn-open-pw-change');
  const btnSubmitPw = document.getElementById('btn-submit-pw-change');
  const inpOldPw = document.getElementById('inp-old-pw');
  const inpNewPw = document.getElementById('inp-new-pw');
  const errOldPw = document.getElementById('err-old-pw');
  const errNewPw = document.getElementById('err-new-pw');
  const msgPwSuccess = document.getElementById('msg-pw-success');

  if (btnOpenPw && modalPw) {
    btnOpenPw.addEventListener('click', () => {
      if (inpOldPw) inpOldPw.value = '';
      if (inpNewPw) inpNewPw.value = '';
      if (errOldPw) errOldPw.style.display = 'none';
      if (errNewPw) errNewPw.style.display = 'none';
      if (msgPwSuccess) msgPwSuccess.style.display = 'none';
      MYUI.openModal(modalPw);
    });
  }

  if (btnSubmitPw) {
    btnSubmitPw.addEventListener('click', async () => {
      const oldPw = inpOldPw ? inpOldPw.value : '';
      const newPw = inpNewPw ? inpNewPw.value : '';
      let valid = true;

      if (!oldPw) {
        if (errOldPw) {
          errOldPw.textContent = 'Mevcut şifrenizi giriniz.';
          errOldPw.style.display = 'block';
        }
        valid = false;
      } else if (errOldPw) {
        errOldPw.style.display = 'none';
      }

      if (!newPw || newPw.length < 8) {
        if (errNewPw) {
          errNewPw.textContent = 'Yeni şifre en az 8 karakter olmalıdır.';
          errNewPw.style.display = 'block';
        }
        valid = false;
      } else if (errNewPw) {
        errNewPw.style.display = 'none';
      }

      if (!valid) return;

      btnSubmitPw.disabled = true;
      if (window.MYAPI && typeof window.MYAPI.changePassword === 'function') {
        try {
          await window.MYAPI.changePassword({ old_password: oldPw, new_password: newPw });
          btnSubmitPw.disabled = false;
          if (msgPwSuccess) msgPwSuccess.style.display = 'block';
          if (inpOldPw) inpOldPw.value = '';
          if (inpNewPw) inpNewPw.value = '';
          setTimeout(() => {
            MYUI.closeModal(modalPw);
          }, 1500);
        } catch (err) {
          btnSubmitPw.disabled = false;
          if (err.isOfflineDemo) {
            if (msgPwSuccess) msgPwSuccess.style.display = 'block';
            setTimeout(() => { MYUI.closeModal(modalPw); }, 1500);
            return;
          }
          if (errOldPw) {
            errOldPw.textContent = err.message || 'Mevcut şifre hatalı.';
            errOldPw.style.display = 'block';
          }
        }
      } else {
        btnSubmitPw.disabled = false;
        if (msgPwSuccess) msgPwSuccess.style.display = 'block';
        setTimeout(() => { MYUI.closeModal(modalPw); }, 1500);
      }
    });
  }
});

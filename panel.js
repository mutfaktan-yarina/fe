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

  // Sunucu tek doğru kaynaktır: yeni bir tarayıcıda ya da cihazda yerel kayıt boştur; önce sunucudan okunur, sayfa
  // gerçek başvuruyla çizilir. Sunucu "başvuru yok" derse eski yerel kopya silinir (aynı tarayıcıda başka biri girmiş olabilir).
  // Sunucuya ulaşılamazsa (çevrimdışı) yerel kayıtla devam edilir.
  let loadFailed = false;
  if (window.MYAPI && typeof window.MYAPI.getApplication === 'function') {
    try {
      const res = await window.MYAPI.getApplication();
      if (res && res.application) {
        const remote = res.application;
        if (remote.ref && !remote.refNo) remote.refNo = remote.ref;
        MYUI.writeJSON(getAppKey(), remote);
      } else if (res && res.application === null) {
        try { localStorage.removeItem(getAppKey()); localStorage.removeItem(getDraftKey()); } catch (e) {}
      }
    } catch (e) {
      // 401 yukarıdaki oturum denetimiyle girişe yönlendirir; diğer hatalarda yerel kayıt kullanılır, kayıt yoksa durumun alınamadığı söylenir.
      loadFailed = !(e && e.status === 401);
    }
  }

  const btnOpenEdit = document.getElementById('btn-open-edit');
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

  // Durum -> rozet metni.
  const STATUS_INFO = {
    draft: { text: 'Taslak — henüz gönderilmedi' },
    submitted: { text: 'Başvuru Alındı — İnceleme Aşamasında' },
    verifying: { text: 'Belge ve Bilgi Doğrulama Aşamasında' },
    'preeval-open': { text: 'Ön Değerlendirme Aşaması Açıldı' },
    answered: { text: 'Ön Değerlendirme Yanıtları Alındı' },
    scored: { text: 'Ön Değerlendirme Tamamlandı' },
    rejected: { text: 'Başvuru Uygun Görülmedi' },
    expired: { text: 'Başvuru Süresi Doldu' }
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

  const isDraft = !!appData && status === 'draft';
  setVisible(document.getElementById('draft-note'), isDraft);

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
  }

  // Ön değerlendirme bandı yalnızca aşama açıkken görünür; belge yükleme ve sorular tek sayfadadır (on-degerlendirme-formu.html).
  setVisible(document.getElementById('banner-preeval'), !!appData && status === 'preeval-open');

  // Talep Edilen Belgeler: yalnız aday durumu "verifying" iken ve yalnız talep edilen türler; dosya seçilince yükleme otomatik başlar.
  const docsSection = document.getElementById('requested-docs');
  const DOC_LABELS = { tax: 'Vergi Levhası / Kooperatif Kayıtları', sgk: 'SGK Hizmet Dökümü', id: 'Kimlik Fotokopisi' };
  const DOC_ORDER = ['tax', 'sgk', 'id'];

  function renderRequestedDocs(app) {
    if (!docsSection) return;
    const requested = DOC_ORDER.filter(k => Array.isArray(app.requestedDocs) && app.requestedDocs.indexOf(k) >= 0);
    const show = app.status === 'verifying' && requested.length > 0;
    setVisible(docsSection, show);
    const list = docsSection.querySelector('ul');
    list.replaceChildren();
    if (!show) return;
    const uploaded = {};
    (app.verificationDocs || []).forEach(d => { if (d && d.kind) uploaded[d.kind] = d; });
    requested.forEach(kind => {
      const doc = uploaded[kind];
      const li = document.createElement('li');
      li.dataset.docKind = kind;
      li.dataset.state = doc ? 'uploaded' : 'pending';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = DOC_LABELS[kind];
      const note = document.createElement('span');
      note.textContent = doc ? (doc.name || 'Belge yüklendi') : 'Belge bekleniyor';
      info.append(title, note);
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.jpg,.jpeg,.png';
      input.setAttribute('aria-label', DOC_LABELS[kind] + (doc ? ' belgesini değiştir' : ' belgesini yükle'));
      input.addEventListener('change', () => uploadRequested(li, kind, input));
      label.append(input);
      const err = document.createElement('p');
      err.setAttribute('role', 'alert');
      err.hidden = true;
      li.append(info, label, err);
      list.append(li);
    });
  }

  async function uploadRequested(li, kind, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const err = li.querySelector('[role="alert"]');
    const fail = (msg) => { err.textContent = msg; err.hidden = !msg; };
    fail('');
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { input.value = ''; fail('Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.'); return; }
    if (file.size === 0) { input.value = ''; fail('Dosya boş; lütfen geçerli bir dosya seçiniz.'); return; }
    if (file.size > 10 * 1024 * 1024) { input.value = ''; fail('Dosya boyutu en fazla 10 MB olabilir.'); return; }
    input.disabled = true;
    li.querySelector('span').textContent = 'Yükleniyor...';
    let failure = '';
    try {
      await window.MYAPI.uploadVerificationDoc(file, kind);
    } catch (e) {
      failure = (e.errors && e.errors[0] && e.errors[0].text) || e.message || 'Belge yüklenemedi: ' + file.name;
    }
    try {
      const res = await window.MYAPI.getApplication();
      if (res && res.application) {
        const fresh = res.application;
        if (fresh.ref && !fresh.refNo) fresh.refNo = fresh.ref;
        MYUI.writeJSON(getAppKey(), fresh);
        // Son belge yüklenince sunucu durumu ön değerlendirmeye alır: sayfa yeni durumla yeniden çizilir.
        if (fresh.status !== 'verifying') { window.location.reload(); return; }
        renderRequestedDocs(fresh);
        if (failure) {
          const row = docsSection.querySelector('[data-doc-kind="' + kind + '"] [role="alert"]');
          if (row) { row.textContent = failure; row.hidden = false; }
        }
        return;
      }
    } catch (e) {
      if (!failure) failure = 'Belge yüklendi ancak liste yenilenemedi; sayfayı yenileyiniz.';
    }
    input.disabled = false;
    fail(failure);
  }

  if (appData) renderRequestedDocs(appData);

  // Show deadline banner for draft and submitted applications
  const deadlineBanner = document.getElementById('deadline-banner-panel');
  if (deadlineBanner && appData && (status === 'draft' || status === 'submitted')) {
    deadlineBanner.style.display = 'flex';
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

  // Gönderilen başvuru kesindir; düzenleme yalnızca henüz gönderilmemiş taslak için sunulur.
  if (btnOpenEdit) {
    if (isDraft) {
      const label = btnOpenEdit.querySelector('span');
      if (label) label.textContent = 'Başvuruyu Tamamla ve Gönder';
      btnOpenEdit.addEventListener('click', () => {
        window.location.href = 'basvuru.html';
      });
    } else {
      btnOpenEdit.remove();
    }
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

      if (!newPw || newPw.length < 12) {
        if (errNewPw) {
          errNewPw.textContent = 'Yeni şifre en az 12 karakter olmalıdır.';
          errNewPw.style.display = 'block';
        }
        valid = false;
      } else if (errNewPw) {
        errNewPw.style.display = 'none';
      }

      if (!valid) return;

      btnSubmitPw.disabled = true;
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
        if (errOldPw) {
          errOldPw.textContent = err.message || 'Mevcut şifre hatalı.';
          errOldPw.style.display = 'block';
        }
      }
    });
  }
});

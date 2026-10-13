document.addEventListener('DOMContentLoaded', async () => {
  // Basit istemci koruması (gerçek kimlik doğrulama arka uç işidir).
  const currentUser = MYUI.readJSON('currentUser');
  if (!currentUser || (currentUser.role !== 'applicant' && currentUser.role !== 'member')) {
    window.location.replace('giris.html');
    return;
  }

  const form = document.getElementById('preeval-form');
  const submitBtn = document.getElementById('btn-submit-preeval');
  const confirmCheck = document.getElementById('preeval-confirm');
  const feedbackBox = document.getElementById('preeval-feedback');
  const userEl = document.getElementById('preeval-username');
  const statusBadge = document.getElementById('preeval-status-badge');
  const logoutLink = document.getElementById('btn-logout');

  if (logoutLink) {
    logoutLink.addEventListener('click', async () => {
      if (window.MYAPI) {
        try { await MYAPI.logout(); } catch (e) {}
      }
      try {
        const k = btoa(currentUser.email || '').replace(/[^a-zA-Z0-9]/g, '');
        ['mutfaktan_application_', 'mutfaktan_app_draft_', 'onDegerlendirmeAnswers_'].forEach(b => localStorage.removeItem(b + k));
      } catch (e) {}
      try { localStorage.removeItem('currentUser'); } catch (e) {}
    });
  }

  function showFeedback(title, text) {
    if (!feedbackBox) return;
    feedbackBox.replaceChildren();
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    wrap.append(h, p);
    feedbackBox.append(wrap);
    feedbackBox.removeAttribute('hidden');
    feedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Panel sunucudaki başvuruyu kullanıcıya özel anahtara yazar; eski tek anahtar yedek olarak okunur.
  const appKey = currentUser.email ? 'mutfaktan_application_' + btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '') : 'mutfaktan_application';
  const appData = MYUI.readJSON(appKey) || MYUI.readJSON('mutfaktan_application');
  // Sunucu tek doğru kaynaktır: ref, iş türü ve pencerenin açıklığı varsa oradan alınır; yerel kayıt yalnız çevrimdışı yedektir.
  let server = null;
  if (window.MYAPI) {
    try { server = await MYAPI.getPreeval(); } catch (e) { server = null; }
    if (server && !server.ok) server = null;
  }
  // Doğrulama belgeleri sunucuda ayrı kayıttır; liste yalnızca sunucunun tuttuğu belgeleri gösterir.
  let serverDocs = null;
  if (server) {
    try {
      const res = await MYAPI.getApplication();
      if (res && res.application) serverDocs = res.application.verificationDocs || [];
    } catch (e) { serverDocs = null; }
  }
  const refNo = (server && server.ref) || (appData && appData.refNo);
  const askQ2 = server ? server.biztype === 'sirket' : (!!appData && appData.biztype === 'sirket');
  const formOpen = server ? !!server.is_open : !!appData && appData.status === 'preeval-open';

  if (userEl) {
    const displayName = (appData && appData.fullname) || currentUser.name;
    if (displayName) userEl.textContent = displayName;
  }

  // User-scoped key for pre-eval answers
  function getPreevalAnswersKey() {
    if (currentUser && currentUser.email) {
      return 'onDegerlendirmeAnswers_' + btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '');
    }
    return 'onDegerlendirmeAnswers';
  }

  // Yanıtlar yalnızca bu başvurunun ref numarasıyla eşleşiyorsa bu başvuruya aittir.
  const storedAnswers = MYUI.readJSON(getPreevalAnswersKey());
  const existingAnswers = storedAnswers && refNo && storedAnswers.ref === refNo ? storedAnswers : null;
  const isViewMode = !!existingAnswers;

  const textareas = [1, 2, 3, 4, 5, 6].map(n => ({
    key: `q${n}`,
    id: `ans-q${n}`,
    countId: `count-q${n}`
  }));

  if (!refNo) {
    if (form) form.setAttribute('hidden', '');
    showFeedback('Başvuru kaydı bulunamadı', 'Ön Değerlendirme sorularını yanıtlamak için başvurunuzu göndermiş olmanız gerekir.');
    return;
  }

  if (!isViewMode && !formOpen) {
    if (form) form.setAttribute('hidden', '');
    // Yanıtlar başka bir cihazdan gönderilmiş olabilir: yerel kayıt yoksa sunucudaki yanıtlar gösterilir.
    loadRemotePreeval().then((shown) => {
      if (!shown) {
        showFeedback('Ön Değerlendirme aşamanız henüz açılmadı', 'Bu aşama, program ekibi tarafından açılan adaylar içindir. Aşamanız açıldığında belgelerinizi bu sayfadan yükleyip soruları yanıtlayabilirsiniz.');
      }
    });
    return;
  }


  // Ö2 yalnızca "Şirket" seçenlere sorulur; şahıs ve kooperatifte alan gizli ve zorunlu değildir.
  if (!askQ2) {
    const q2Field = document.getElementById('q2-field');
    const q2Note = document.getElementById('q2-note');
    const q2El = document.getElementById('ans-q2');
    if (q2Field) q2Field.setAttribute('hidden', '');
    if (q2El) q2El.required = false;
    if (q2Note) {
      q2Note.textContent = 'Bu soru şahıs işletmeleri ve kadın kooperatifleri için sorulmaz.';
      q2Note.removeAttribute('hidden');
    }
  }

  // Evrak yükleme bölümü: yanıtlar verilmediyse yüklenebilir, verildiyse salt okunur listelenir.
  const sectionDocs = document.getElementById('section-verify-docs');
  const docList = document.getElementById('verify-doc-list');
  const docError = document.getElementById('verify-error');
  const docSuccess = document.getElementById('verify-uploaded-success');
  const docBadge = document.getElementById('badge-verify-status');
  const docKinds = (window.MYCONFIG && window.MYCONFIG.verificationKinds) || [{ kind: 'tax', label: 'Doğrulama Belgesi', required: true }];
  const readOnly = isViewMode;

  function currentDocs() {
    return (serverDocs || (appData && appData.verificationDocs) || []);
  }
  function docOfKind(kind) {
    return currentDocs().find(d => d && d.kind === kind) || null;
  }
  function requiredDocsDone() {
    return docKinds.filter(k => k.required).every(k => docOfKind(k.kind));
  }
  // Zorunlu belge yokken sorular gönderilemez (sunucu da aynısını uygular).
  function syncSubmit() {
    if (submitBtn && !readOnly) submitBtn.disabled = !requiredDocsDone();
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

  function renderDocs() {
    if (!sectionDocs || !docList) return;
    sectionDocs.removeAttribute('hidden');
    docList.replaceChildren();
    docKinds.forEach((k) => {
      const doc = docOfKind(k.kind);
      const row = document.createElement('li');
      row.dataset.kind = k.kind;

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = k.label + (k.required ? '' : ' (isteğe bağlı)');
      const state = document.createElement('div');
      state.dataset.role = 'doc-state';
      state.textContent = doc ? doc.name + ' — ' + formatDocMeta(doc) : (readOnly ? 'Belge yüklenmedi' : 'Belge bekleniyor');
      info.append(title, state);
      if (!readOnly) {
        const hint = document.createElement('div');
        hint.textContent = 'PDF, JPG veya PNG — en fazla 10 MB';
        info.append(hint);
      }
      row.append(info);

      if (!readOnly) {
        const actions = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.jpg,.jpeg,.png';
        input.hidden = true;
        input.dataset.role = 'doc-input';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.role = 'doc-button';
        btn.textContent = doc ? 'Değiştir' : 'Yükle';
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', () => uploadOne(row, k, input, btn));
        actions.append(input, btn);
        const err = document.createElement('div');
        err.dataset.role = 'row-error';
        err.setAttribute('role', 'alert');
        row.append(actions, err);
      }
      docList.append(row);
    });
    const done = readOnly || requiredDocsDone();
    if (docBadge) docBadge.textContent = readOnly ? 'Belgeler Teslim Edildi' : (done ? 'Belgeler Yüklendi' : 'Belge Bekleniyor');
    if (docSuccess) docSuccess.style.display = done && !readOnly ? 'block' : 'none';
    syncSubmit();
  }

  // Her işlem tek dosyadır ve sonunda liste sunucudaki gerçek duruma göre yeniden çizilir; başarısız ya da
  // yarım kalan bir yükleme ekranda eski ya da olmayan bir dosya adı bırakmaz.
  async function uploadOne(row, kind, input, btn) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (docError) docError.style.display = 'none';
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
    if (window.MYAPI) {
      try {
        await MYAPI.uploadVerificationDoc(file, kind.kind);
      } catch (err) {
        failure = (err.errors && err.errors[0] && err.errors[0].text) || err.message || 'Belge yüklenemedi: ' + file.name;
      }
      try {
        const res = await MYAPI.getApplication();
        if (res && res.application) serverDocs = res.application.verificationDocs || [];
      } catch (e) {
        if (!failure) failure = 'Belge yüklendi ancak liste yenilenemedi; sayfayı yenileyiniz.';
      }
    }
    renderDocs();
    if (failure) {
      const fresh = docList.querySelector('[data-kind="' + kind.kind + '"]');
      if (fresh) showRowError(fresh, failure);
    }
  }

  renderDocs();

  textareas.forEach(item => {
    const el = document.getElementById(item.id);
    const countEl = document.getElementById(item.countId);
    if (el && countEl) {
      el.addEventListener('input', () => {
        countEl.textContent = el.value.length;
      });
    }
  });

  if (existingAnswers) {
    textareas.forEach(item => {
      const el = document.getElementById(item.id);
      if (el && existingAnswers[item.key]) {
        el.value = existingAnswers[item.key];
        const countEl = document.getElementById(item.countId);
        if (countEl) countEl.textContent = el.value.length;
      }
    });

    textareas.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) el.setAttribute('readonly', '');
    });
    if (confirmCheck) {
      confirmCheck.checked = true;
      confirmCheck.disabled = true;
    }
    if (submitBtn) submitBtn.setAttribute('hidden', '');
    if (statusBadge) statusBadge.textContent = 'Cevaplar Gönderildi';
    showFeedback('Ön Değerlendirme Yanıtlarınız Alındı', 'Verdiğiniz yanıtlar kaydedilmiştir ve program ekibi tarafından incelenmektedir.');
  }

  if (form && !isViewMode) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!requiredDocsDone()) {
        if (docError) {
          docError.textContent = 'Soruları gönderebilmek için lütfen önce zorunlu doğrulama belgelerinizi yükleyiniz.';
          docError.style.display = 'block';
        }
        sectionDocs.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      let allFilled = true;
      const answers = { ref: refNo };

      textareas.forEach(item => {
        if (item.key === 'q2' && !askQ2) {
          answers.q2 = null;
          return;
        }
        const el = document.getElementById(item.id);
        const val = el ? el.value.trim() : '';
        if (!val) allFilled = false;
        answers[item.key] = val;
      });

      if (!allFilled) {
        showFeedback('Eksik yanıt', 'Lütfen size sorulan tüm soruları yanıtlayınız.');
        return;
      }

      const encoder = new TextEncoder();
      let byteExceeded = false;
      textareas.forEach(item => {
        if (item.key === 'q2' && !askQ2) return;
        const val = answers[item.key] || '';
        if (encoder.encode(val).length > 1024) {
          byteExceeded = true;
        }
      });
      if (byteExceeded) {
        showFeedback('Karakter sınırı aşıldı', 'Yanıtlarınız en fazla 1024 bayt uzunluğunda olmalıdır.');
        return;
      }

      if (!confirmCheck.checked) {
        showFeedback('Doğruluk beyanı gerekli', 'Lütfen doğruluk beyanını onaylayınız.');
        return;
      }

      if (window.MYAPI) {
        try {
          await MYAPI.submitPreeval({
            q1: answers.q1 || '',
            q2: answers.q2 || '',
            q3: answers.q3 || '',
            q4: answers.q4 || '',
            q5: answers.q5 || '',
            q6: answers.q6 || ''
          });
        } catch (apiErr) {
          showFeedback('Gönderim hatası', (apiErr.errors && apiErr.errors[0] && apiErr.errors[0].text) || apiErr.message || 'Cevaplar iletilemedi.');
          return;
        }
      }

      answers.submittedAt = new Date().toISOString();
      MYUI.writeJSON(getPreevalAnswersKey(), answers);

      showFeedback('Ön Değerlendirme cevaplarınız gönderildi', 'Cevaplarınız program ekibine iletildi. Takip paneline yönlendiriliyorsunuz...');

      submitBtn.disabled = true;

      setTimeout(() => {
        window.location.href = 'panel.html';
      }, 1500);
    });
  }
  // Arka uç API entegrasyonu (sunucuda kayıtlı ön değerlendirme cevapları varsa formu doldurur ve kilitler)
  async function loadRemotePreeval() {
    if (!window.MYAPI) return false;
    try {
      const res = await MYAPI.getPreeval();
      // GET /v1/preeval: {ok, ref, status, biztype, is_open, answers}; answers is null until the applicant has answered.
      if (res && res.ok && res.answers && typeof res.answers === 'object') {
        const answers = res.answers;
        textareas.forEach(item => {
          const el = document.getElementById(item.id);
          if (el && answers[item.key]) {
            el.value = answers[item.key];
            const countEl = document.getElementById(item.countId);
            if (countEl) countEl.textContent = el.value.length;
            el.setAttribute('readonly', '');
          }
        });
        if (confirmCheck) {
          confirmCheck.checked = true;
          confirmCheck.disabled = true;
        }
        if (submitBtn) submitBtn.setAttribute('hidden', '');
        if (statusBadge) statusBadge.textContent = 'Cevaplar Gönderildi';
        if (form) form.removeAttribute('hidden');
        showFeedback('Ön Değerlendirme Yanıtlarınız Alındı', 'Verdiğiniz yanıtlar kaydedilmiştir ve program ekibi tarafından incelenmektedir.');
        return true;
      }
    } catch (e) {
    }
    return false;
  }

  loadRemotePreeval();
});

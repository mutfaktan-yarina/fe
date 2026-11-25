document.addEventListener('DOMContentLoaded', async () => {
  // Basit istemci koruması (gerçek kimlik doğrulama arka uç işidir).
  const currentUser = MYUI.readJSON('currentUser');
  if (!currentUser || (currentUser.role !== 'applicant' && currentUser.role !== 'member')) {
    // Oturumsuz açılan bağlantı (ör. yeniden açılma e-postası) girişten sonra forma döner.
    window.location.replace('giris.html?next=on-degerlendirme-formu.html');
    return;
  }

  const form = document.getElementById('preeval-form');
  const submitBtn = document.getElementById('btn-submit-preeval');
  const saveBtn = document.getElementById('btn-save-preeval');
  const savedAtEl = document.getElementById('preeval-saved-at');
  const sendConfirm = document.getElementById('preeval-send-confirm');
  const warningEl = document.getElementById('preeval-warning');
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

  // scroll=false: sayfa açılışındaki iletiler kaydırılmaz (kaydırma klavyenin ilk Tab başlangıç noktasını kutuya taşır,
  // "İçeriğe geç" atlanırdı); kutu zaten sayfanın başındadır.
  function showFeedback(title, text, scroll = true) {
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
    if (scroll) feedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Panel sunucudaki başvuruyu kullanıcıya özel anahtara yazar; eski tek anahtar yedek olarak okunur.
  const appKey = currentUser.email ? 'mutfaktan_application_' + btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '') : 'mutfaktan_application';
  const appData = MYUI.readJSON(appKey) || MYUI.readJSON('mutfaktan_application');
  // Sunucu tek doğru kaynaktır: ref, iş türü ve pencerenin açıklığı varsa oradan alınır; yerel kayıt yalnız çevrimdışı yedektir.
  let server = null;
  let serverFailStatus = 0;   // GET /v1/preeval başarısızsa HTTP durumu (ağ hatası 0)
  if (window.MYAPI) {
    try { server = await MYAPI.getPreeval(); } catch (e) { server = null; serverFailStatus = (e && e.status) || 0; }
    if (server && !server.ok) server = null;
  }
  // Doğrulama belgeleri sunucuda ayrı kayıttır; liste yalnızca sunucunun tuttuğu belgeleri gösterir.
  let serverDocs = null;
  let requestedKinds = null;   // editörün talep ettiği türler (GET /v1/application requestedDocs); bilinmiyorsa null
  if (server) {
    try {
      const res = await MYAPI.getApplication();
      if (res && res.application) {
        serverDocs = res.application.verificationDocs || [];
        if (Array.isArray(res.application.requestedDocs)) requestedKinds = res.application.requestedDocs;
      }
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

  // Gönderilmiş yanıtlar sunucudan gelir (başka cihazda ya da yerel kayıt silinmişken de görünür); yerel kopya
  // yalnız sunucuya ulaşılamazken okunur (yazılmaz) ve ancak bu başvurunun ref numarasıyla eşleşiyorsa bu başvuruya aittir.
  // GET /v1/preeval: {ok, ref, status, biztype, is_open, submitted, answers (yalnız gönderilmişse), draft, savedAt, ...}.
  const serverAnswers = server && server.submitted && server.answers && typeof server.answers === 'object' ? server.answers : null;
  const storedAnswers = server ? null : MYUI.readJSON(getPreevalAnswersKey());
  const localAnswers = storedAnswers && refNo && storedAnswers.ref === refNo ? storedAnswers : null;
  const existingAnswers = serverAnswers || localAnswers;
  // Salt okunur kip yalnız gönderilmişte: kayıtlı taslak düzenlenebilir kalır.
  const isViewMode = !!existingAnswers;
  const draftAnswers = server && !server.submitted && server.draft && typeof server.draft === 'object' ? server.draft : null;

  const textareas = [1, 2, 3, 4, 5, 6].map(n => ({
    key: `q${n}`,
    id: `ans-q${n}`,
    countId: `count-q${n}`
  }));

  // Ö1: sunucu varken GET /v1/preeval başarısızsa form açılmaz; yoksa boş form "Kaydet" ile sunucudaki taslağın üstüne yazabilir.
  // Yalnız bu başvurunun yerel, gönderilmiş kopyası salt okunur gösterilebilir (hiçbir şey yazamaz). 401'de api.js girişe yönlendirir.
  if (window.MYAPI && !server && !localAnswers) {
    if (form) form.setAttribute('hidden', '');
    if (serverFailStatus === 401) return;
    if (serverFailStatus === 404) {
      showFeedback('Başvuru kaydı bulunamadı', 'Ön Değerlendirme sorularını yanıtlamak için başvurunuzu göndermiş olmanız gerekir.', false);
    } else {
      showFeedback('Bağlantı hatası', 'Sunucuya ulaşılamadı. Lütfen sayfayı yenileyiniz.', false);
    }
    return;
  }

  if (!refNo) {
    if (form) form.setAttribute('hidden', '');
    showFeedback('Başvuru kaydı bulunamadı', 'Ön Değerlendirme sorularını yanıtlamak için başvurunuzu göndermiş olmanız gerekir.', false);
    return;
  }

  // Aşama açık ama süre doldu (hiç kaydedilmemiş form; kayıtlı taslak süre dolunca gönderilmiş görünür): form ve
  // belge yükleme açılmaz, durum baştan söylenir.
  if (!isViewMode && formOpen && server && server.closed === true) {
    if (form) form.setAttribute('hidden', '');
    if (statusBadge) statusBadge.textContent = 'Ön Değerlendirme Süresi Doldu';
    showFeedback('Ön Değerlendirme Süresi Doldu', 'Ön değerlendirme süresi sona erdiği için yanıt gönderilemez ve belge yüklenemez. Süre uzatılırsa size e-posta ile bildirilecektir.', false);
    return;
  }

  if (!isViewMode && !formOpen) {
    if (form) form.setAttribute('hidden', '');
    showFeedback('Ön Değerlendirme aşamanız henüz açılmadı', 'Bu aşama, program ekibi tarafından açılan adaylar içindir. Aşamanız açıldığında belgelerinizi bu sayfadan yükleyip soruları yanıtlayabilirsiniz.', false);
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
  // Yalnız rozet metni içindir; belge zorunlu olmadığından Gönder düğmesini kısıtlamaz.
  function requiredDocsDone() {
    return docKinds.filter(k => k.required).every(k => docOfKind(k.kind));
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
    // Gönderimden sonra yalnız yüklenmiş belgeler listelenir; hiç belge yoksa (belgesiz yol) bölüm gizli kalır.
    const kinds = readOnly ? docKinds.filter(k => docOfKind(k.kind)) : docKinds;
    if (readOnly && kinds.length === 0) {
      sectionDocs.setAttribute('hidden', '');
      return;
    }
    sectionDocs.removeAttribute('hidden');
    docList.replaceChildren();
    kinds.forEach((k) => {
      const doc = docOfKind(k.kind);
      const row = document.createElement('li');
      row.dataset.kind = k.kind;

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = k.label;
      const state = document.createElement('div');
      state.dataset.role = 'doc-state';
      state.textContent = doc ? doc.name + ' — ' + formatDocMeta(doc) : 'Belge bekleniyor';
      info.append(title, state);
      if (!readOnly) {
        const hint = document.createElement('div');
        hint.textContent = 'PDF, JPG veya PNG — en fazla 10 MB';
        info.append(hint);
      }
      row.append(info);

      // Gönderimden sonra aday kendi belgesini açıp görebilir (sunucu yalnız oturum sahibinin belgesini verir).
      if (readOnly && doc && window.MYAPI) {
        const view = document.createElement('a');
        view.href = MYAPI.verificationDocDownloadUrl(k.kind);
        view.target = '_blank';
        view.rel = 'noopener';
        view.textContent = 'Görüntüle';
        view.setAttribute('aria-label', k.label + ' belgesini görüntüle');
        row.append(view);
      }

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
    const done = readOnly || (requiredDocsDone() && currentDocs().length > 0);
    if (docBadge) docBadge.textContent = readOnly ? 'Belgeler Teslim Edildi' : (done ? 'Belgeler Yüklendi' : 'Belge Bekleniyor');
    if (docSuccess) docSuccess.style.display = done && !readOnly ? 'block' : 'none';
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
    if (saveBtn) saveBtn.setAttribute('hidden', '');
    if (warningEl) warningEl.setAttribute('hidden', '');
    if (statusBadge) statusBadge.textContent = 'Cevaplar Gönderildi';
    showFeedback('Ön Değerlendirme Yanıtlarınız Alındı', 'Verdiğiniz yanıtlar ve yüklediğiniz belgeler aşağıda yer almaktadır; program ekibi tarafından incelenmektedir.', false);
  }

  // Kayıtlı taslak: alanlar sunucudan dolar, düzenlenebilir kalır. "Son kayıt" yalnız adayın kendi Kaydet'inden gelir (savedAt null ise gösterilmez).
  function showSavedAt(iso) {
    if (!savedAtEl) return;
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) {
      savedAtEl.setAttribute('hidden', '');
      return;
    }
    const sameDay = d.toDateString() === new Date().toDateString();
    savedAtEl.textContent = 'Son kayıt: ' + (sameDay
      ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }));
    savedAtEl.removeAttribute('hidden');
  }

  if (draftAnswers) {
    textareas.forEach(item => {
      const el = document.getElementById(item.id);
      if (el && typeof draftAnswers[item.key] === 'string' && draftAnswers[item.key]) {
        el.value = draftAnswers[item.key];
        const countEl = document.getElementById(item.countId);
        if (countEl) countEl.textContent = el.value.length;
      }
    });
  }
  if (!isViewMode) showSavedAt(server && server.savedAt);

  function errText(apiErr, fallback) {
    return (apiErr.errors && apiErr.errors[0] && apiErr.errors[0].text) || apiErr.message || fallback;
  }

  // Ö2 şirket dışında sorulmaz ve gönderilmez (sunucu da temizler).
  function collectAnswers() {
    const out = {};
    textareas.forEach(item => {
      if (item.key === 'q2' && !askQ2) {
        out.q2 = '';
        return;
      }
      const el = document.getElementById(item.id);
      out[item.key] = el ? el.value.trim() : '';
    });
    return out;
  }

  function bytesExceeded(answers) {
    const encoder = new TextEncoder();
    return textareas.some(item => !(item.key === 'q2' && !askQ2) && encoder.encode(answers[item.key] || '').length > 1024);
  }

  function setBusy(busy) {
    if (saveBtn) saveBtn.disabled = busy;
    if (submitBtn) submitBtn.disabled = busy;
  }

  function hideSendConfirm() {
    if (sendConfirm) sendConfirm.setAttribute('hidden', '');
  }

  if (form && !isViewMode) {
    form.addEventListener('input', hideSendConfirm);

    // Kaydet: hiçbir alan zorunlu değildir; hata olursa alanlar olduğu gibi kalır.
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        hideSendConfirm();
        const answers = collectAnswers();
        if (bytesExceeded(answers)) {
          showFeedback('Karakter sınırı aşıldı', 'Yanıtlarınız en fazla 1024 bayt uzunluğunda olmalıdır.');
          return;
        }
        if (!window.MYAPI) {
          showFeedback('Kayıt hatası', 'Sunucuya ulaşılamadı; taslağınız kaydedilemedi.');
          return;
        }
        setBusy(true);
        try {
          const res = await MYAPI.savePreevalDraft(answers);
          showFeedback('Taslağınız kaydedildi', 'Yanıtlarınızı daha sonra tamamlayabilirsiniz; tamamladığınızda “Gönder” ile iletiniz.');
          showSavedAt((res && res.savedAt) || new Date().toISOString());
        } catch (apiErr) {
          showFeedback('Kayıt hatası', errText(apiErr, 'Taslak kaydedilemedi.'));
        } finally {
          setBusy(false);
        }
      });
    }

    // Gönder: önce zorunlu yanıt, bayt ve beyan denetimi; sonra satır içi onay (eksik belgeler adıyla).
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const answers = collectAnswers();
      const allFilled = textareas.every(item => (item.key === 'q2' && !askQ2) || answers[item.key]);
      if (!allFilled) {
        hideSendConfirm();
        showFeedback('Eksik yanıt', 'Lütfen size sorulan tüm soruları yanıtlayınız.');
        return;
      }
      if (bytesExceeded(answers)) {
        hideSendConfirm();
        showFeedback('Karakter sınırı aşıldı', 'Yanıtlarınız en fazla 1024 bayt uzunluğunda olmalıdır.');
        return;
      }
      if (!confirmCheck.checked) {
        hideSendConfirm();
        showFeedback('Doğruluk beyanı gerekli', 'Lütfen doğruluk beyanını onaylayınız.');
        return;
      }
      // Yalnız talep edilen ve yüklenmemiş türler listelenir (talep yoksa liste yok); talep bilinmiyorsa tüm türler.
      const asked = requestedKinds ? docKinds.filter(k => requestedKinds.indexOf(k.kind) >= 0) : docKinds;
      const missing = asked.filter(k => !docOfKind(k.kind)).map(k => k.label);
      const lines = [];
      if (missing.length) lines.push('Yüklemediğiniz belgeler: ' + missing.join(', ') + '.');
      lines.push('Gönderdikten sonra belge eklenemez ve yanıtlar değiştirilemez. Göndermek istiyor musunuz?');
      sendConfirm.querySelector('span').textContent = lines.join(' ');
      sendConfirm.removeAttribute('hidden');
      document.getElementById('btn-send-yes').focus();
    });

    document.getElementById('btn-send-no').addEventListener('click', () => {
      hideSendConfirm();
      submitBtn.focus();
    });

    document.getElementById('btn-send-yes').addEventListener('click', async () => {
      hideSendConfirm();
      if (!window.MYAPI) {
        showFeedback('Gönderim hatası', 'Sunucuya ulaşılamadı; cevaplar iletilemedi.');
        return;
      }
      setBusy(true);
      try {
        await MYAPI.submitPreeval(collectAnswers());
      } catch (apiErr) {
        showFeedback('Gönderim hatası', errText(apiErr, 'Cevaplar iletilemedi.'));
        setBusy(false);
        return;
      }
      // Sunucu tek doğru kaynaktır: yerel kopya yazılmaz.
      showFeedback('Ön Değerlendirme cevaplarınız gönderildi', 'Cevaplarınız program ekibine iletildi. Takip paneline yönlendiriliyorsunuz...');
      setTimeout(() => {
        window.location.href = 'panel.html';
      }, 1500);
    });
  }
});

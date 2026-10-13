document.addEventListener('DOMContentLoaded', async () => {
  // Basit istemci koruması (gerçek kimlik doğrulama arka uç işidir).
  const currentUser = MYUI.readJSON('currentUser');
  if (!currentUser || (currentUser.role !== 'editor' && currentUser.role !== 'admin')) {
    window.location.replace('giris.html');
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref');

  const appRefBadge = document.getElementById('appRefBadge');
  const applicantStatusBadge = document.getElementById('applicantStatusBadge');
  const applicantName = document.getElementById('applicantName');
  const applicantAge = document.getElementById('applicantAge');
  const applicantBusiness = document.getElementById('applicantBusiness');
  const applicantStructure = document.getElementById('applicantStructure');
  const applicantVkn = document.getElementById('applicantVkn');
  const applicantSpace = document.getElementById('applicantSpace');
  const sistemScoreDisplay = document.getElementById('sistemScoreDisplay');
  const scoreDataGrid = document.getElementById('scoreDataGrid');
  const docFilesList = document.getElementById('docFilesList');
  const summarySistemScore = document.getElementById('summarySistemScore');
  const summaryPreScore = document.getElementById('summaryPreScore');
  const summaryTotalScore = document.getElementById('summaryTotalScore');
  const previewPreScore = document.getElementById('previewPreScore');
  const saveFeedback = document.getElementById('saveFeedback');
  const evalNotes = document.getElementById('evalNotes');
  const evaluationForm = document.getElementById('evaluationForm');
  const btnOpenPreeval = document.getElementById('btnOpenPreeval');

  const docPreviewModal = document.getElementById('docPreviewModal');
  const docPreviewTitle = document.getElementById('docPreviewTitle');
  const docPreviewBody = document.getElementById('docPreviewBody');
  const closeDocPreviewModal = document.getElementById('closeDocPreviewModal');
  const confirmDocPreview = document.getElementById('confirmDocPreview');

  // Başvuru yalnızca API'den okunur; hata durumunda sahte veri gösterilmez.
  let currentApp = null;
  let loadError = '';
  if (refParam) {
    try {
      const res = await MYAPI.getEditorApplicationDetail(refParam);
      if (res && res.ok && res.application) currentApp = res.application;
    } catch (err) {
      loadError = err && err.status === 404 ? '' : (err && err.message) || 'Başvuru yüklenemedi.';
    }
  }

  // Bilinmeyen veya eksik ?ref= sessizce başka bir başvuruya düşmez.
  if (!currentApp) {
    const main = document.querySelector('main');
    if (main) {
      const box = document.createElement('div');
      box.className = 'card-heading';
      const h1 = document.createElement('h1');
      h1.textContent = 'Başvuru bulunamadı';
      const p = document.createElement('p');
      p.textContent = loadError
        ? loadError
        : refParam
        ? `"${refParam}" numaralı başvuru kayıtlarda yok.`
        : 'Görüntülenecek bir başvuru seçilmedi.';
      const link = document.createElement('a');
      link.href = 'editor-panel.html';
      link.className = 'btn-table-action';
      link.textContent = 'Başvuru Listesine Dön';
      box.append(h1, p, link);
      main.replaceChildren(box);
    }
    return;
  }

  // Adaya giden bilgilendirme e-postası ulaşmadıysa editör bunu görür ve adayı başka yoldan bilgilendirir.
  if (currentApp.notificationFailed) {
    const warn = document.createElement('div');
    warn.className = 'feedback-banner feedback-error';
    warn.setAttribute('role', 'alert');
    warn.textContent = `Bu adaya gönderilen bir e-posta ulaşmadı. Lütfen adayı telefonla bilgilendirin: ${currentApp.phone || 'telefon kayıtlı değil'}`;
    const main = document.querySelector('main');
    if (main) main.insertBefore(warn, main.firstChild);
  }

  const details = currentApp;
  const bizType = currentApp.biztype;
  const askQ2 = bizType === 'sirket';

  function num(v) {
    const n = Number(v);
    return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
  }

  function isFilled(v) {
    return v !== null && v !== undefined && v !== '';
  }

  // Puan rozeti: "değer / azami" (kullanıcı verisi HTML olarak yorumlanmaz).
  function setScore(el, value, max) {
    if (!el) return;
    el.replaceChildren();
    if (value === null) {
      el.textContent = '-';
      return;
    }
    el.append(document.createTextNode(`${value} `));
    const maxEl = document.createElement('span');
    maxEl.textContent = `/ ${max}`;
    el.append(maxEl);
  }

  // Künye
  if (appRefBadge) appRefBadge.textContent = `Ref: ${currentApp.ref}`;
  if (applicantName) applicantName.textContent = currentApp.name || '-';
  if (applicantBusiness) applicantBusiness.textContent = currentApp.business || '-';
  // API işletme yapısını biztype olarak gönderir (editor-panel.js ile aynı etiketler).
  const STRUCTURE_LABELS = { sahis: 'Şahıs İşletmesi', sirket: 'Şirket', kooperatif: 'Kadın Kooperatifi' };
  if (applicantStructure) applicantStructure.textContent = `${STRUCTURE_LABELS[currentApp.biztype] || '-'} · ${currentApp.city || '-'}`;
  if (applicantVkn) applicantVkn.textContent = isFilled(details.taxno) ? details.taxno : '-';
  if (applicantSpace) applicantSpace.textContent = isFilled(details.bizyear) ? details.bizyear : '-';
  if (applicantAge) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(details.birthdate || ''));
    if (m) {
      const eligible = MYUI.isAgeEligible(details.birthdate);
      applicantAge.textContent = `${m[3]}.${m[2]}.${m[1]} — Yaş şartı: ${eligible ? 'Uygun' : 'Uygun değil'}`;
    } else {
      applicantAge.textContent = '-';
    }
  }

  const STATUS_LABELS = { yes: 'Evet', no: 'Hayır' };
  const Q14_LABELS = {
    none: 'İşe başlayan olmadı',
    zero: 'Oldu, kimse kalmadı',
    less_half: 'Yarıdan azı',
    half_more: 'Yarısı ve fazlası',
    all: 'Tamamı'
  };
  const Q22_LABELS = {
    mutfak: 'Mutfak',
    masa: 'Masa',
    istihdam: 'İstihdam',
    dekorasyon: 'Dekorasyon',
    tanitim: 'Tanıtım',
    borc: 'Borç'
  };

  // Puanlar sunucuda hesaplanır; burada yalnızca API'nin döndürdüğü değer gösterilir (sayı ya da { total, items }).
  const rawSistem = isFilled(currentApp.systemScore) ? currentApp.systemScore : currentApp.sistemScore;
  const scoreResult = rawSistem && typeof rawSistem === 'object' ? rawSistem : null;
  const sistemScore = num(scoreResult ? scoreResult.total : rawSistem);

  setScore(sistemScoreDisplay, sistemScore, 70);
  if (summarySistemScore) summarySistemScore.textContent = sistemScore === null ? '-' : sistemScore;

  function addScoreItem(label, value, note) {
    if (!scoreDataGrid) return;
    const block = document.createElement('div');
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valEl = document.createElement('strong');
    valEl.textContent = value;
    block.append(labelEl, valEl);
    if (note) {
      const noteEl = document.createElement('small');
      noteEl.textContent = note;
      block.appendChild(noteEl);
    }
    scoreDataGrid.appendChild(block);
  }

  // Puanın nereden geldiği: sunucudaki kuralların (api/src/scoring.c) okunabilir özeti. Hesabı sunucu yapar.
  const Q13_RULE = 'Fark 0 → 4, 1 → 8, 2 → 11, 3 ve üzeri → 15 puan; azalma → 0';
  const Q14_RULE = 'İşe başlayan olmadı 3,5 · kimse kalmadı 0 · yarıdan azı 5 · yarısı ve fazlası 7 · tamamı 10';
  const Q22_RULE = 'Mutfak / Masa / İstihdam 6 puan, Dekorasyon / Tanıtım / Borç 3 puan; seçilen 2 alanın toplamı';

  function ratioNote(items) {
    const f = num(details.q12);
    const t = num(details.q11);
    if (f === null || !t) return 'Kadın oranı × 20 puan (azami 20).';
    const pct = Math.round((f / t) * 1000) / 10;
    return `Kadın oranı × 20 puan (azami 20): ${f} / ${t} = %${pct} → ${pct / 100} × 20 = ${items.q12}`;
  }

  function deltaNote(items) {
    const a = num(details.q11);
    const b = num(details.q13);
    const head = 'Fark = bugünkü SGK\'lı − bir yıl önceki SGK\'lı (azami 15). ';
    if (a === null || b === null) return head + Q13_RULE;
    return `${head}${a} − ${b} = ${a - b}. ${Q13_RULE}`;
  }

  function q22Note() {
    const pts = { mutfak: 6, masa: 6, istihdam: 6, dekorasyon: 3, tanitim: 3, borc: 3 };
    const list = Array.isArray(details.q22) ? details.q22 : [];
    const calc = list.length ? ` Seçim: ${list.map(k => `${Q22_LABELS[k] || k} ${pts[k] || 0}`).join(' + ')}.` : '';
    return `Azami 12. ${Q22_RULE}.${calc}`;
  }

  function withPoints(text, pts) {
    return num(pts) === null ? text : `${text} — ${pts} Puan`;
  }

  // API yalnızca toplamı döndürür; madde puanları sunucu kurallarıyla (api/src/scoring.c) burada yeniden hesaplanıp
  // yalnızca gösterilir. Toplam API'nin değeriyle uyuşmazsa buildScoreGrid bunu açıkça belirtir.
  const Q14_PTS = { none: 3.5, zero: 0, less_half: 5, half_more: 7, all: 10 };
  const Q22_PTS = { mutfak: 6, masa: 6, istihdam: 6, dekorasyon: 3, tanitim: 3, borc: 3 };
  const round1 = n => Math.round(n * 10) / 10;

  function deriveItems() {
    const q11 = num(details.q11);
    const q12 = num(details.q12);
    const q13 = num(details.q13);
    if (q11 === null || q12 === null || q13 === null) return null;
    if (!(details.q14 in Q14_PTS) || !['yes', 'no'].includes(details.q15)) return null;
    const q22 = Array.isArray(details.q22) ? details.q22 : [];
    if (q22.length !== 2 || !q22.every(k => k in Q22_PTS)) return null;
    const delta = q11 - q13;
    const q21 = bizType === 'kooperatif' ? 8 : (details.q21 === 'yes' ? 8 : 0);
    if (bizType !== 'kooperatif' && !['yes', 'no'].includes(details.q21)) return null;
    return {
      q12: q11 > 0 ? round1(Math.min(1, Math.max(0, q12 / q11)) * 20) : 0,
      q13: delta < 0 ? 0 : delta === 0 ? 4 : delta === 1 ? 8 : delta === 2 ? 11 : 15,
      q14: Q14_PTS[details.q14],
      q15: details.q15 === 'yes' ? 5 : 0,
      q21,
      q22: Q22_PTS[q22[0]] + Q22_PTS[q22[1]]
    };
  }

  function buildScoreGrid() {
    if (!scoreDataGrid) return;
    scoreDataGrid.replaceChildren();

    const items = (scoreResult && scoreResult.items) || deriveItems();
    if (!items) {
      addScoreItem('Puan Dökümü', 'Bu kayıtta madde bazlı puan hesaplanamadı (eksik form verisi).');
      return;
    }
    addScoreItem('1.1 Toplam SGK\'lı (kendisi hariç)', `${details.q11} kişi (puanlanmaz)`, 'Doğrudan puan almaz; 1.2 ve 1.3 hesaplarının girdisidir.');
    addScoreItem('1.2 Kadın Çalışan Oranı', withPoints(`${details.q12} kadın / ${details.q11} toplam`, items.q12), ratioNote(items));
    addScoreItem('1.3 Bir Yıl Önceki Çalışan Sayısı', withPoints(`${details.q13} kişi`, items.q13), deltaNote(items));
    addScoreItem('1.4 İşe Başlayanlardan Kalan', withPoints(Q14_LABELS[details.q14] || details.q14 || '-', items.q14), `Azami 10. ${Q14_RULE}.`);
    addScoreItem('1.5 Hibeyle İşe Alım', withPoints(STATUS_LABELS[details.q15] || details.q15 || '-', items.q15), 'Evet → 5, Hayır → 0 puan (azami 5).');
    const q21Text = bizType === 'kooperatif' ? 'Kooperatif' : (STATUS_LABELS[details.q21] || details.q21 || '-');
    addScoreItem('2.1 Tek Geçim Kaynağı', withPoints(q21Text, items.q21), bizType === 'kooperatif' ? 'Kadın kooperatiflerinde otomatik 8 puan (azami 8).' : 'Evet → 8, Hayır → 0 puan (azami 8).');
    const q22Text = Array.isArray(details.q22) && details.q22.length
      ? details.q22.map(k => Q22_LABELS[k] || k).join(' + ')
      : '-';
    addScoreItem('2.2 Hibe Kullanım Alanı', withPoints(q22Text, items.q22), q22Note());
    const sum = round1(['q12', 'q13', 'q14', 'q15', 'q21', 'q22'].reduce((t, k) => t + (num(items[k]) || 0), 0));
    if (sistemScore !== null && Math.abs(sum - sistemScore) > 0.05) {
      addScoreItem('Uyarı', `Madde toplamı ${sum}, sistem puanı ${sistemScore}`, 'Arayüzdeki hesap sunucudakiyle uyuşmuyor; sistem puanı sunucudaki değerdir.');
    }
  }
  buildScoreGrid();

  // Belgeler: yalnızca başvuruda gerçekten kayıtlı olan veri gösterilir.
  function openDocModal(title, text) {
    if (!docPreviewModal) return;
    docPreviewTitle.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    docPreviewBody.replaceChildren(p);
    MYUI.openModal(docPreviewModal);
  }

  // Her satır: belge adı + (varsa) "Belgeyi İncele" + Doğrulandı / Uyumsuz düğmeleri (data-v = doğrulama anahtarı).
  function addDocRow({ key, name, meta, openUrl, kind }) {
    const row = document.createElement('div');
    if (kind) row.dataset.kind = kind;
    // Belge yüklenmemişse "Doğrulandı" seçili gelmez: satır "Doğrulama bekleniyor" durumundadır (editör bir düğmeye basana dek).
    if (!openUrl) row.dataset.pending = '';
    const text = document.createElement('div');
    const nameEl = document.createElement('strong');
    nameEl.textContent = name;
    const metaEl = document.createElement('small');
    metaEl.textContent = meta;
    text.append(nameEl, metaEl);

    const actions = document.createElement('div');
    if (openUrl) {
      const view = document.createElement('button');
      view.type = 'button';
      view.textContent = 'Belgeyi İncele';
      view.addEventListener('click', () => window.open(openUrl, '_blank'));
      actions.appendChild(view);
    }
    [['valid', 'Doğrulandı'], ['invalid', 'Uyumsuz']].forEach(([status, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.v = key;
      btn.dataset.status = status;
      btn.textContent = label;
      if (status === 'valid' && openUrl) btn.classList.add('active-valid');
      actions.appendChild(btn);
    });
    row.append(text, actions);
    docFilesList.appendChild(row);
  }

  function buildDocList() {
    if (!docFilesList) return;
    docFilesList.replaceChildren();

    const hasCert = isFilled(details.fileName);
    addDocRow({
      key: 'msa',
      name: hasCert ? details.fileName : 'MSA Sertifikası',
      meta: hasCert ? 'MSA Sertifikası · Eğitim sonu değerlendirmeden en az 70 puan; sertifika geçerliliği' : 'MSA Sertifikası · Belge henüz yüklenmedi.',
      openUrl: hasCert ? MYAPI.editorCertificateDownloadUrl(currentApp.ref) : ''
    });

    // Doğrulama belgeleri: her tür için bir satır; yüklenmeyenler "yüklenmedi" olarak görünür.
    const verifDocs = details.verificationDocs || currentApp.verificationDocs || [];
    const kinds = (window.MYCONFIG && window.MYCONFIG.verificationKinds) || [{ kind: 'tax', label: 'Doğrulama Belgesi' }];
    const KEYS = { tax: 'vergi', sgk: 'sgk', id: 'kimlik' };
    const HINTS = {
      tax: 'Geçerli vergi levhası; en az 2 yıldır faaliyette olma',
      sgk: 'Kendisi hariç en az 2 aktif SGK\'lı çalışan; beyan edilen çalışan sayıları',
      id: '31 Aralık 2026 itibarıyla 18–30 yaş (doğum 1996-01-01 – 2008-12-31)'
    };
    kinds.forEach((k) => {
      const doc = verifDocs.find(d => d && d.kind === k.kind);
      addDocRow({
        key: KEYS[k.kind] || k.kind,
        kind: k.kind,
        name: doc ? doc.name : k.label,
        meta: [doc ? k.label : 'Belge henüz yüklenmedi.', HINTS[k.kind]].filter(Boolean).join(' · '),
        openUrl: doc ? MYAPI.editorVerificationDocDownloadUrl(currentApp.ref, k.kind) : ''
      });
    });
  }
  buildDocList();

  if (closeDocPreviewModal) {
    closeDocPreviewModal.addEventListener('click', () => MYUI.closeModal(docPreviewModal));
  }
  if (confirmDocPreview) {
    confirmDocPreview.addEventListener('click', () => MYUI.closeModal(docPreviewModal));
  }

  // Adayın yazılı cevapları (yalnızca bu başvuruya kaydedilmiş olanlar).
  const storedAnswers = currentApp.applicantAnswers || null;
  for (let n = 1; n <= 6; n++) {
    const el = document.getElementById(`ansQ${n}`);
    if (!el) continue;
    if (n === 2 && !askQ2) {
      el.textContent = 'Bu soru şahıs işletmeleri ve kadın kooperatifleri için sorulmaz (doğrudan 5 puan).';
    } else if (storedAnswers && storedAnswers[`q${n}`]) {
      el.textContent = `"${storedAnswers[`q${n}`]}"`;
    } else {
      el.textContent = 'Kayıtlı yanıt bulunmuyor.';
    }
  }

  // Durum rozeti
  function renderStatusBadge() {
    if (!applicantStatusBadge) return;
    const status = currentApp.status;
    if (status === 'scored') {
      applicantStatusBadge.className = 'badge-status status-scored';
      applicantStatusBadge.textContent = `Puanlandı (${currentApp.totalScore} Puan)`;
    } else if (status === 'rejected') {
      applicantStatusBadge.className = 'badge-status status-pending-verify status-rejected';
      applicantStatusBadge.textContent = 'Elendi';
    } else if (status === 'pending-verify') {
      applicantStatusBadge.className = 'badge-status status-pending-verify';
      applicantStatusBadge.textContent = 'Belge Doğrulama Bekliyor';
    } else if (status === 'awaiting-answers') {
      applicantStatusBadge.className = 'badge-status status-pending-verify';
      applicantStatusBadge.textContent = 'Adayın Yanıtları Bekleniyor';
    } else {
      applicantStatusBadge.className = 'badge-status status-pending-score';
      applicantStatusBadge.textContent = 'Ön Değerlendirme Aşamasında';
    }
    syncPreevalButton();
  }
  renderStatusBadge();

  function syncPreevalButton() {
    if (!btnOpenPreeval) return;
    if (currentApp.status === "pending-verify") {
      if (btnOpenPreeval.parentElement) btnOpenPreeval.parentElement.removeAttribute("hidden");
      btnOpenPreeval.disabled = false;
      const sp = btnOpenPreeval.querySelector("span");
      if (sp) sp.textContent = "Belgeleri Onayla ve Ön Değerlendirmeyi Aç";
    } else if (currentApp.status === "awaiting-answers" || currentApp.status === "pending-score" || currentApp.status === "scored") {
      if (btnOpenPreeval.parentElement) btnOpenPreeval.parentElement.removeAttribute("hidden");
      btnOpenPreeval.disabled = true;
      const sp = btnOpenPreeval.querySelector("span");
      if (sp) sp.textContent = "Belgeler Onaylandı (Ön Değerlendirme Açık)";
    } else {
      if (btnOpenPreeval.parentElement) btnOpenPreeval.parentElement.setAttribute("hidden", "");
    }
  }

  if (btnOpenPreeval) {
    btnOpenPreeval.addEventListener("click", async () => {
      const hasInvalid = document.querySelector("[data-v].active-invalid");
      if (hasInvalid) {
        showBanner("Uyumsuz olarak işaretlenmiş belgeler varken ön değerlendirme açılamaz. Lütfen belgeleri kontrol ediniz veya ret gerekçesi giriniz.", false);
        return;
      }
      btnOpenPreeval.disabled = true;
      try {
        await MYAPI.openPreeval(currentApp.ref);
      } catch (apiErr) {
        btnOpenPreeval.disabled = false;
        showBanner(apiErr.message || 'Ön değerlendirme açılamadı.', false);
        return;
      }
      currentApp.status = "awaiting-answers";
      renderStatusBadge();
      showBanner("Belgeler onaylandı ve adayın Ön Değerlendirme soruları açıldı.", true);
    });
  }


  if (evalNotes && currentApp.notes) evalNotes.value = currentApp.notes;

  const rejectionBox = document.getElementById('rejection-box');
  const rejectionError = document.getElementById('rejection-error');
  const inpRejectionReason = document.getElementById('inp-rejection-reason');

  function checkVerificationStatus() {
    const hasInvalid = document.querySelector('[data-v].active-invalid');
    if (hasInvalid) {
      if (rejectionBox) rejectionBox.removeAttribute('hidden');
    } else {
      if (rejectionBox) rejectionBox.setAttribute('hidden', '');
      if (rejectionError) rejectionError.setAttribute('hidden', '');
    }
  }

  const toggleButtons = document.querySelectorAll('[data-v]');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const groupKey = btn.getAttribute('data-v');
      const siblings = document.querySelectorAll(`[data-v="${groupKey}"]`);
      siblings.forEach(s => s.classList.remove('active-valid', 'active-invalid'));
      const row = btn.closest('[data-pending]');
      if (row) row.removeAttribute('data-pending');
      const status = btn.getAttribute('data-status');
      if (status === 'valid') {
        btn.classList.add('active-valid');
      } else {
        btn.classList.add('active-invalid');
      }
      checkVerificationStatus();
    });
  });

  // Ön Değerlendirme cetveli
  function readRubric() {
    const rubric = [];
    for (let i = 1; i <= 6; i++) {
      const selected = document.querySelector(`input[name="rubric_q${i}"]:checked`);
      rubric.push(selected ? Number(selected.value) : null);
    }
    return rubric;
  }

  // Kayıtlı madde puanları yoksa (yalnızca toplam varsa) ilk görünümde kayıtlı toplamlar gösterilir.
  const savedRubric = Array.isArray(currentApp.rubric) && currentApp.rubric.length === 6 ? currentApp.rubric : null;
  let useStoredTotals = !savedRubric && num(currentApp.preScore) !== null;

  function renderSummary() {
    const rubric = readRubric();

    for (let i = 1; i <= 6; i++) {
      const badge = document.getElementById(`scoreBadgeQ${i}`);
      document.querySelectorAll(`input[name="rubric_q${i}"]`).forEach(radio => {
        const parentLabel = radio.closest('label');
        if (parentLabel) parentLabel.classList.toggle('selected', radio.checked);
      });
      const pts = rubric[i - 1];
      if (badge) badge.textContent = `${pts === null ? 0 : pts} Puan`;
    }

    const preTotal = useStoredTotals ? num(currentApp.preScore) : null;
    const total = useStoredTotals ? num(currentApp.totalScore) : null;

    setScore(previewPreScore, preTotal, 30);
    if (summaryPreScore) summaryPreScore.textContent = preTotal === null ? '-' : preTotal;
    if (summaryTotalScore) summaryTotalScore.textContent = total === null ? '-' : total;
  }

  for (let i = 1; i <= 6; i++) {
    document.querySelectorAll(`input[name="rubric_q${i}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        useStoredTotals = false;
        renderSummary();
      });
    });
  }

  // Kayıtlı madde puanlarını geri yükle.
  if (savedRubric) {
    savedRubric.forEach((v, idx) => {
      if (v === null || v === undefined) return;
      const radio = document.querySelector(`input[name="rubric_q${idx + 1}"][value="${v}"]`);
      if (radio) radio.checked = true;
    });
  }

  // Ö2 yalnızca Şirket seçenlere sorulur; şahıs ve kooperatifte otomatik 5 puan, devre dışı.
  if (!askQ2) {
    document.querySelectorAll('input[name="rubric_q2"]').forEach(radio => {
      radio.checked = radio.value === '5';
      radio.disabled = true;
    });
    const q2Badge = document.getElementById('scoreBadgeQ2');
    const header = q2Badge ? q2Badge.closest('h3') : null;
    if (header) {
      const note = document.createElement('p');
      note.textContent = 'Şahıs işletmeleri ve kadın kooperatiflerinde bu soru sorulmaz; otomatik 5 puan verilir.';
      header.insertAdjacentElement('afterend', note);
    }
  }
  renderSummary();

  function showBanner(msg, isSuccess) {
    if (!saveFeedback) return;
    saveFeedback.textContent = msg;
    saveFeedback.className = isSuccess ? 'feedback-banner feedback-success' : 'feedback-banner feedback-error';
    saveFeedback.removeAttribute('hidden');
    saveFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (evaluationForm) {
    evaluationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const hasInvalid = document.querySelector('[data-v].active-invalid');
      if (hasInvalid) {
        const reasonVal = inpRejectionReason ? inpRejectionReason.value.trim() : '';
        if (!reasonVal) {
          if (rejectionError) rejectionError.removeAttribute('hidden');
          if (inpRejectionReason) inpRejectionReason.focus();
          showBanner('Belge veya şart uyumsuzluğu tespit edildiğinde gerekçe yazılması zorunludur.', false);
          return;
        }

        try {
          await MYAPI.verifyApplication({
            ref: currentApp.ref,
            status: 'rejected',
            reason: reasonVal
          });
        } catch (apiErr) {
          showBanner(apiErr.message || 'Başvuru elendi olarak kaydedilemedi.', false);
          return;
        }

        currentApp.status = 'rejected';

        renderStatusBadge();
        showBanner('Başvuru belge uyumsuzluğu tutanağı işlenerek elendi olarak kaydedildi. Yönlendiriliyorsunuz...', true);
        setTimeout(() => {
          window.location.href = 'editor-panel.html';
        }, 1400);
        return;
      }

      const rubric = readRubric();
      if (rubric.some(v => v === null)) {
        // 30 puanlık cetvel kaldırıldı; puanın nerede verileceği henüz belirlenmedi.
        showBanner('30 puanlık ön değerlendirme puanlaması henüz tanımlanmadı; kayıt yapılamaz.', false);
        return;
      }
      let res;
      try {
        res = await MYAPI.submitEvaluation({
          ref: currentApp.ref,
          rubric: rubric,
          notes: evalNotes ? evalNotes.value.trim() : ''
        });
      } catch (apiErr) {
        showBanner(apiErr.message || 'Ön değerlendirme kaydedilemedi.', false);
        return;
      }

      currentApp.status = 'scored';
      const saved = (res && res.application) || res || {};
      if (num(saved.totalScore) !== null) currentApp.totalScore = saved.totalScore;
      if (num(saved.preScore) !== null) currentApp.preScore = saved.preScore;

      renderStatusBadge();

      const totalText = num(saved.totalScore) !== null ? ` Toplam Ön Sıralama Puanı: ${saved.totalScore} / 100.` : '';
      showBanner(`Ön Değerlendirme başarıyla kaydedildi.${totalText} Yönlendiriliyorsunuz...`, true);

      setTimeout(() => {
        window.location.href = 'editor-panel.html';
      }, 1400);
    });
  }
});

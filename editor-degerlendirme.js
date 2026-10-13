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
  const saveFeedback = document.getElementById('saveFeedback');
  const evalNotes = document.getElementById('evalNotes');
  const evaluationForm = document.getElementById('evaluationForm');

  const docPreviewModal = document.getElementById('docPreviewModal');
  const docPreviewTitle = document.getElementById('docPreviewTitle');
  const docPreviewBody = document.getElementById('docPreviewBody');
  const closeDocPreviewModal = document.getElementById('closeDocPreviewModal');
  const confirmDocPreview = document.getElementById('confirmDocPreview');
  const docPreviewDownload = document.getElementById('docPreviewDownload');
  const docInvalidModal = document.getElementById('docInvalidModal');
  const docInvalidTitle = document.getElementById('docInvalidTitle');
  const docInvalidReason = document.getElementById('docInvalidReason');
  const docInvalidError = document.getElementById('docInvalidError');
  const docValidModal = document.getElementById('docValidModal');
  const docValidBody = document.getElementById('docValidBody');
  let verifyWrites = 0;   // uçuştaki doğrulama yazımları

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
  // Sunucu dosyayı indirme olarak ve çerçevelenemez döndürür; bu yüzden oturumla çekilip blob olarak modalda gösterilir.
  let previewObjectUrl = '';
  function releasePreview() {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
    if (docPreviewDownload) {
      docPreviewDownload.hidden = true;
      docPreviewDownload.removeAttribute('href');
    }
  }

  function previewMessage(text) {
    const p = document.createElement('p');
    p.textContent = text;
    docPreviewBody.replaceChildren(p);
  }

  async function openDocPreview(title, url, fileName) {
    releasePreview();
    docPreviewTitle.textContent = title;
    previewMessage('Belge yükleniyor...');
    MYUI.openModal(docPreviewModal);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Belge açılamadı.');
      const blob = await res.blob();
      if (!docPreviewModal.classList.contains('active')) return;
      previewObjectUrl = URL.createObjectURL(blob);
      let view = null;
      if (blob.type.startsWith('image/')) {
        view = document.createElement('img');
        view.alt = title;
      } else if (blob.type === 'application/pdf') {
        view = document.createElement('iframe');
        view.title = title;
      }
      if (view) {
        view.src = previewObjectUrl;
        docPreviewBody.replaceChildren(view);
      } else {
        previewMessage('Bu dosya türü önizlenemiyor. İndirerek inceleyebilirsiniz.');
      }
      docPreviewDownload.href = previewObjectUrl;
      docPreviewDownload.download = fileName || title;
      docPreviewDownload.hidden = false;
    } catch (err) {
      previewMessage((err && err.message) || 'Belge açılamadı.');
    }
  }


  // ---- Belgeler: satır durumları (MSA + talep edilen tax/sgk/id) ----
  const DOC_KINDS = ['tax', 'sgk', 'id'];
  const KIND_LABELS = { msa: 'MSA Sertifikası', tax: 'Vergi Levhası / Kooperatif Kayıtları', sgk: 'SGK Hizmet Dökümü', id: 'Kimlik Fotokopisi' };
  ((window.MYCONFIG && window.MYCONFIG.verificationKinds) || []).forEach((k) => { if (k && k.kind && k.label) KIND_LABELS[k.kind] = k.label; });
  const KEYS = { msa: 'msa', tax: 'vergi', sgk: 'sgk', id: 'kimlik' };
  const HINTS = {
    msa: 'Eğitim sonu değerlendirmeden en az 70 puan; sertifika geçerliliği',
    tax: 'Geçerli vergi levhası; en az 2 yıldır faaliyette olma',
    sgk: 'Kendisi hariç en az 2 aktif SGK\'lı çalışan; beyan edilen çalışan sayıları',
    id: '31 Aralık 2026 itibarıyla 18–30 yaş (doğum 1996-01-01 – 2008-12-31)'
  };
  // Takvim (GET /v1/calendar): ön değerlendirme penceresi dışında MSA/belge doğrulama, belge talebi ve soruları açma;
  // değerlendirme penceresi dışında puan kaydetme ve ret sunucuda reddedilir. Uyarı ve pasiflik tarihleri takvimden gelir.
  const calendarNotice = document.getElementById('calendarNotice');
  const calendarState = { preeval: 'open', eval: 'open', preevalMsg: '', evalMsg: '' };
  const trDate = iso => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  const preevalOpen = () => calendarState.preeval === 'open';
  const evalOpen = () => calendarState.eval === 'open';

  function windowMessage(state, openIso, closeIso, what, name) {
    if (state === 'before') return `${name} dönemi ${trDate(openIso)} tarihinde başlıyor. Bu tarihe kadar ${what} yapılamaz.`;
    if (state === 'closed') return `${name} dönemi ${trDate(closeIso)} tarihinde sona erdi. ${what[0].toUpperCase()}${what.slice(1)} artık yapılamaz.`;
    return '';
  }

  async function loadCalendar() {
    let cal = null;
    try { cal = await MYAPI.getCalendar(); } catch (e) { /* takvim okunamazsa uyarı gösterilmez; sunucu yine de kuralı uygular */ }
    if (!cal || !cal.ok) return;
    calendarState.preeval = cal.preeval_state;
    calendarState.eval = cal.eval_state;
    calendarState.preevalMsg = windowMessage(cal.preeval_state, cal.preeval_open, cal.preeval_close,
      'MSA sertifikası ve belge doğrulama, belge talebi ve ön değerlendirme sorularının açılması', 'Ön değerlendirme');
    calendarState.evalMsg = windowMessage(cal.eval_state, cal.eval_open, cal.eval_close,
      'puan kaydetme ve başvuruyu belge uyumsuzluğuyla eleme', 'Değerlendirme');
    if (calendarNotice) {
      calendarNotice.replaceChildren();
      [calendarState.preevalMsg, calendarState.evalMsg].filter(Boolean).forEach((m) => {
        const line = document.createElement('span');
        line.textContent = m;
        calendarNotice.appendChild(line);
      });
      calendarNotice.hidden = !calendarNotice.firstChild;
    }
    renderDocs();
    syncSaveButton();
  }

  function syncSaveButton() {
    const save = document.getElementById('btnSaveEvaluation');
    if (!save) return;
    save.disabled = !evalOpen();
    save.title = evalOpen() ? '' : calendarState.evalMsg;
  }

  // Arayüz durumu: seçilen talep anahtarı ve (kalıcı olmayan) Uyumsuz gerekçesi.
  const docUi = {};
  ['msa', ...DOC_KINDS].forEach((k) => { docUi[k] = { selected: false, invalid: '' }; });
  const requestedDocsList = document.getElementById('requestedDocsList');
  const btnRequestDocs = document.getElementById('btnRequestDocs');
  const requestHint = document.getElementById('requestHint');
  const OPEN_STATES = ['awaiting-answers', 'pending-score', 'scored'];

  const isMsaValid = () => !!currentApp.docVerification && currentApp.docVerification.msa === 'valid';
  const isKindValid = k => !!currentApp.docVerification && currentApp.docVerification[k] === 'valid';
  const requestedList = () => (Array.isArray(currentApp.requestedDocs) ? currentApp.requestedDocs : []);

  // Doğrulama durumu: Doğrulandı API ile kalıcı yazılır; Uyumsuz gerekçe modalı ister (kalıcı değil, kayıtta ret olur).
  let pendingValid = null;
  let pendingInvalid = null;

  function askValid(kind) {
    pendingValid = kind;
    docValidBody.replaceChildren();
    const p = document.createElement('p');
    p.textContent = `"${KIND_LABELS[kind]}" belgesini doğrulandı olarak işaretlemek istediğinize emin misiniz?`;
    docValidBody.appendChild(p);
    MYUI.openModal(docValidModal);
  }

  function askInvalid(kind) {
    pendingInvalid = kind;
    docInvalidTitle.textContent = `Uyumsuzluk Gerekçesi — ${KIND_LABELS[kind]}`;
    docInvalidReason.value = docUi[kind].invalid || '';
    docInvalidError.hidden = true;
    MYUI.openModal(docInvalidModal);
  }

  function addDocRow(list, kind) {
    const label = KIND_LABELS[kind];
    const ui = docUi[kind];
    let file = '';
    let openUrl = '';
    if (kind === 'msa') {
      if (isFilled(details.fileName)) {
        file = details.fileName;
        openUrl = MYAPI.editorCertificateDownloadUrl(currentApp.ref);
      }
    } else {
      const doc = (details.verificationDocs || []).find(d => d && d.kind === kind);
      if (doc) {
        file = doc.name || label;
        openUrl = MYAPI.editorVerificationDocDownloadUrl(currentApp.ref, kind);
      }
    }
    const requested = requestedList().includes(kind);
    const valid = isKindValid(kind) && !ui.invalid;

    const row = document.createElement('div');
    row.dataset.label = label;
    row.dataset.kind = kind;
    if (ui.invalid) row.dataset.reason = ui.invalid;

    const text = document.createElement('div');
    const nameEl = document.createElement('strong');
    nameEl.textContent = label;
    const metaEl = document.createElement('small');
    let parts;
    if (kind === 'msa') {
      parts = openUrl
        ? [file, valid ? '' : 'Doğrulama bekleniyor', HINTS.msa]
        : ['Belge henüz yüklenmedi.', valid ? '' : 'Doğrulama bekleniyor'];
    } else if (openUrl) {
      parts = [file, valid ? '' : 'Doğrulama bekleniyor', HINTS[kind]];
    } else {
      parts = [requested ? 'Aday belgeyi yüklemedi' : 'Talep edilmedi', HINTS[kind]];
    }
    metaEl.textContent = parts.filter(Boolean).join(' · ');
    text.append(nameEl, metaEl);
    if (ui.invalid) {
      const p = document.createElement('p');
      p.textContent = `Uyumsuzluk gerekçesi: ${ui.invalid}`;
      text.appendChild(p);
    }

    const actions = document.createElement('div');
    if (kind === 'msa' || openUrl) {
      if (openUrl) {
        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'Belgeyi İncele';
        view.addEventListener('click', () => openDocPreview(label, openUrl, file));
        actions.appendChild(view);
      }
      [['valid', 'Doğrulandı'], ['invalid', 'Uyumsuz']].forEach(([status, caption]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.v = KEYS[kind];
        btn.dataset.status = status;
        btn.textContent = caption;
        if (status === 'valid' && valid) btn.classList.add('active-valid');
        if (status === 'invalid' && ui.invalid) btn.classList.add('active-invalid');
        if (status === 'valid' && !preevalOpen()) { btn.disabled = true; btn.title = calendarState.preevalMsg; }
        btn.addEventListener('click', () => (status === 'valid' ? askValid : askInvalid)(kind));
        actions.appendChild(btn);
      });
    } else if (requested) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = true;
      btn.textContent = 'Talep Edildi';
      actions.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', ui.selected ? 'true' : 'false');
      btn.textContent = ui.selected ? 'Talep Edilecek' : 'Belge Talep Et';
      btn.disabled = currentApp.status !== 'pending-verify' || !preevalOpen();
      if (!preevalOpen()) btn.title = calendarState.preevalMsg;
      btn.addEventListener('click', () => {
        ui.selected = !ui.selected;
        renderDocs();
      });
      actions.appendChild(btn);
    }
    row.append(text, actions);
    list.appendChild(row);
  }

  function renderDocs() {
    if (docFilesList) {
      docFilesList.replaceChildren();
      addDocRow(docFilesList, 'msa');
    }
    if (requestedDocsList) {
      requestedDocsList.replaceChildren();
      DOC_KINDS.forEach(k => addDocRow(requestedDocsList, k));
    }
    syncRequestButton();
  }

  // #btnRequestDocs: seçili belge -> talep; seçili yok -> belgesiz devam; talepten sonra / sorular açılınca pasif.
  function syncRequestButton() {
    if (!btnRequestDocs) return;
    const status = currentApp.status;
    const box = btnRequestDocs.parentElement;
    const sp = btnRequestDocs.querySelector('span');
    let label;
    let disabled = false;
    let hint = '';
    if (status === 'rejected') {
      if (box) box.hidden = true;
      return;
    }
    if (box) box.hidden = false;
    if (OPEN_STATES.includes(status)) {
      label = 'Ön Değerlendirme Açık';
      disabled = true;
    } else {
      const selected = DOC_KINDS.filter(k => docUi[k].selected && !requestedList().includes(k));
      const requestedNow = requestedList().length > 0;
      label = selected.length ? 'Seçilen Belgeleri Talep Et' : requestedNow ? 'Belgeler Talep Edildi' : 'Belge Talep Etmeden Devam Et';
      if (!preevalOpen()) {
        disabled = true;
        hint = calendarState.preevalMsg;
      } else if (!isMsaValid() || verifyWrites > 0) {
        disabled = true;
        hint = isMsaValid() ? 'Doğrulama kaydediliyor…' : 'Önce MSA Sertifikası belgesini inceleyip Doğrulandı olarak işaretleyiniz.';
      } else if (!selected.length && requestedNow) {
        disabled = true;
        hint = 'Aday talep edilen belgelerin tamamını yüklediğinde ön değerlendirme soruları otomatik açılır.';
      }
    }
    if (sp) sp.textContent = label;
    btnRequestDocs.disabled = disabled;
    btnRequestDocs.title = hint;
    if (requestHint) {
      requestHint.textContent = hint;
      requestHint.hidden = !hint;
    }
  }

  function closePreview() {
    MYUI.closeModal(docPreviewModal);
    releasePreview();
    docPreviewBody.replaceChildren();
  }
  if (closeDocPreviewModal) closeDocPreviewModal.addEventListener('click', closePreview);
  if (confirmDocPreview) confirmDocPreview.addEventListener('click', closePreview);
  window.addEventListener('pagehide', releasePreview);

  document.getElementById('closeDocValidModal').addEventListener('click', () => MYUI.closeModal(docValidModal));
  document.getElementById('cancelDocValid').addEventListener('click', () => MYUI.closeModal(docValidModal));
  document.getElementById('confirmDocValid').addEventListener('click', async () => {
    const kind = pendingValid;
    pendingValid = null;
    MYUI.closeModal(docValidModal);
    if (!kind) return;
    // İyimser güncelleme: ekran hemen değişir, sunucu yazımı başarısız olursa geri alınır.
    const prevVerification = currentApp.docVerification;
    const prevInvalid = docUi[kind].invalid;
    currentApp.docVerification = Object.assign({}, prevVerification, { [kind]: 'valid' });
    docUi[kind].invalid = '';
    verifyWrites++;                       // yazım bitmeden "talep / devam" düğmesi açılmaz (sunucu MSA'yı henüz görmez)
    renderDocs();
    try {
      await MYAPI.verifyDoc({ ref: currentApp.ref, kind, status: 'valid' });
      verifyWrites--;
      syncRequestButton();
    } catch (apiErr) {
      verifyWrites--;
      currentApp.docVerification = prevVerification;
      docUi[kind].invalid = prevInvalid;
      renderDocs();
      showBanner(apiErr.message || 'Doğrulama kaydedilemedi.', false);
    }
  });

  document.getElementById('closeDocInvalidModal').addEventListener('click', () => MYUI.closeModal(docInvalidModal));
  document.getElementById('cancelDocInvalid').addEventListener('click', () => MYUI.closeModal(docInvalidModal));
  docInvalidModal.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = docInvalidReason.value.trim();
    if (!reason) {
      docInvalidError.hidden = false;
      docInvalidReason.focus();
      return;
    }
    if (pendingInvalid) docUi[pendingInvalid].invalid = reason;
    pendingInvalid = null;
    MYUI.closeModal(docInvalidModal);
    renderDocs();
  });

  // Sunucudan güncel durumu çekip ekranı yeniler (talep / açma sonrası).
  async function refreshDetail() {
    const res = await MYAPI.getEditorApplicationDetail(currentApp.ref);
    if (res && res.ok && res.application) Object.assign(currentApp, res.application);
    DOC_KINDS.forEach((k) => { if (requestedList().includes(k)) docUi[k].selected = false; });
    renderStatusBadge();
    renderDocs();
    renderPreeval();
  }

  if (btnRequestDocs) {
    btnRequestDocs.addEventListener('click', async () => {
      if (btnRequestDocs.disabled) return;
      const selected = DOC_KINDS.filter(k => docUi[k].selected && !requestedList().includes(k));
      btnRequestDocs.disabled = true;
      try {
        if (selected.length) await MYAPI.requestDocs(currentApp.ref, selected);
        else await MYAPI.openPreeval(currentApp.ref);
      } catch (apiErr) {
        syncRequestButton();
        showBanner(apiErr.message || 'İşlem tamamlanamadı.', false);
        return;
      }
      try {
        await refreshDetail();
      } catch (err) {
        showBanner((err && err.message) || 'Başvuru yenilenemedi. Sayfayı yenileyiniz.', false);
        return;
      }
      showBanner(selected.length
        ? 'Seçilen belgeler talep edildi; adaya e-posta gönderildi. Belgelerin tamamı yüklenince ön değerlendirme soruları açılır.'
        : 'Adayın Ön Değerlendirme soruları açıldı.', true);
    });
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
    syncRequestButton();
  }

  if (evalNotes && currentApp.notes) evalNotes.value = currentApp.notes;

  // Uyumsuz işaretli belgelerin gerekçeleri tek ret gerekçesinde birleştirilir (sunucu sınırı 512 bayt).
  function collectRejectionReason() {
    return [...document.querySelectorAll('.doc-files-list > div[data-reason]')]
      .map(row => `${row.dataset.label}: ${row.dataset.reason}`)
      .join(' | ');
  }

  // ---- Ön Değerlendirme: adayın cevapları + 0-5 yıldız ----
  // vals[i]: null = dokunulmadı (eksik), 0..5 = açıkça işaretlendi (0 dahil).
  const vals = [null, null, null, null, null, null];
  if (!askQ2) vals[1] = 5;
  const savedRubric = Array.isArray(currentApp.rubric) && currentApp.rubric.length === 6 ? currentApp.rubric : null;
  if (savedRubric) {
    savedRubric.forEach((v, idx) => {
      if (Number.isInteger(v) && v >= 0 && v <= 5) vals[idx] = v;
    });
    if (!askQ2) vals[1] = 5;
  }
  let useStoredTotals = num(currentApp.preScore) !== null;
  const starGroups = [];

  function buildStars() {
    for (let q = 1; q <= 6; q++) {
      const host = document.getElementById(`ansQ${q}`);
      if (!host) continue;
      const group = document.createElement('span');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', `Ö${q} puanı (0-5 yıldız)`);
      const btns = [];
      for (let s = 1; s <= 5; s++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.q = q;
        b.dataset.star = s;
        b.setAttribute('aria-label', `${s} yıldız`);
        b.textContent = '★';
        b.addEventListener('click', () => setStar(q, s));
        group.appendChild(b);
        btns.push(b);
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.dataset.q = q;
      clear.textContent = 'Temizle';
      clear.title = 'Puanı 0 yap';
      clear.addEventListener('click', () => setStar(q, 0));
      host.insertAdjacentElement('afterend', group);
      group.insertAdjacentElement('afterend', clear);
      starGroups.push({ q, btns, clear });
    }
  }

  function setStar(q, n) {
    if (q === 2 && !askQ2) return;
    vals[q - 1] = n;
    useStoredTotals = false;
    renderStars();
    renderSummary();
  }

  function renderStars() {
    const canScore = currentApp.status === 'pending-score' || currentApp.status === 'scored';
    starGroups.forEach(({ q, btns, clear }) => {
      const v = vals[q - 1];
      const lockedQ = q === 2 && !askQ2;
      btns.forEach((b, i) => {
        b.setAttribute('aria-checked', v !== null && i + 1 === v ? 'true' : 'false');
        b.classList.toggle('on', v !== null && i + 1 <= v);
        b.disabled = lockedQ || !canScore;
      });
      clear.disabled = lockedQ || !canScore;
    });
  }

  function renderSummary() {
    const sum = vals.reduce((t, v) => t + (v || 0), 0);
    const preTotal = useStoredTotals ? num(currentApp.preScore) : sum;
    const total = useStoredTotals ? num(currentApp.totalScore) : (sistemScore === null ? null : round1(sistemScore + sum));
    if (summaryPreScore) summaryPreScore.textContent = preTotal === null ? '-' : preTotal;
    if (summaryTotalScore) summaryTotalScore.textContent = total === null ? '-' : total;
  }

  const preevalClosed = document.getElementById('preevalClosed');
  const storedAnswersOf = () => currentApp.applicantAnswers || null;

  function renderPreeval() {
    const status = currentApp.status;
    const answers = storedAnswersOf();
    const opened = OPEN_STATES.includes(status) || (status === 'rejected' && !!answers);
    if (preevalClosed) preevalClosed.hidden = opened;
    document.querySelectorAll('details > article').forEach((a) => { a.hidden = !opened; });
    for (let n = 1; n <= 6; n++) {
      const el = document.getElementById(`ansQ${n}`);
      if (!el) continue;
      if (n === 2 && !askQ2) {
        el.textContent = 'Bu soru şahıs işletmeleri ve kadın kooperatifleri için sorulmaz (doğrudan 5 puan).';
      } else if (answers && answers[`q${n}`]) {
        el.textContent = `"${answers[`q${n}`]}"`;
      } else {
        el.textContent = 'Kayıtlı yanıt bulunmuyor.';
      }
    }
    renderStars();
  }

  function showBanner(msg, isSuccess) {
    if (!saveFeedback) return;
    saveFeedback.textContent = msg;
    saveFeedback.className = isSuccess ? 'feedback-banner feedback-success' : 'feedback-banner feedback-error';
    saveFeedback.removeAttribute('hidden');
    saveFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  buildStars();
  renderStatusBadge();
  renderDocs();
  loadCalendar();
  renderPreeval();
  renderSummary();

  if (evaluationForm) {
    evaluationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const hasInvalid = document.querySelector('[data-v].active-invalid');
      if (hasInvalid) {
        const reasonVal = collectRejectionReason();
        if (!reasonVal || new TextEncoder().encode(reasonVal).length > 500) {
          showBanner(reasonVal ? 'Belge gerekçeleri çok uzun; lütfen kısaltınız.' : 'Uyumsuz belge için gerekçe yazılması zorunludur.', false);
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

      if (vals.some(v => v === null)) {
        showBanner('Lütfen 6 sorunun hepsi için yıldız seçiniz (puan vermeyecekseniz "Temizle" ile 0 yapınız).', false);
        return;
      }
      if (currentApp.status !== 'pending-score' && currentApp.status !== 'scored') {
        showBanner('Aday ön değerlendirme sorularına yanıt vermeden puanlama yapılamaz.', false);
        return;
      }
      let res;
      try {
        res = await MYAPI.submitEvaluation({
          ref: currentApp.ref,
          rubric: vals.slice(),
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

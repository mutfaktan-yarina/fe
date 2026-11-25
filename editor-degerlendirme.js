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
  // Beyan düzenlemesinden sonra yerinde güncellenir (sayfa yenilenmez).
  let bizType = currentApp.biztype;
  let askQ2 = bizType === 'sirket';

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

  // Künye (beyan düzenlemesinden sonra yeniden çizilir)
  // API işletme yapısını biztype olarak gönderir (editor-panel.js ile aynı etiketler).
  const STRUCTURE_LABELS = { sahis: 'Şahıs İşletmesi', sirket: 'Şirket', kooperatif: 'Kadın Kooperatifi' };
  function renderKunye() {
    if (appRefBadge) appRefBadge.textContent = `Ref: ${currentApp.ref}`;
    if (applicantName) applicantName.textContent = currentApp.name || '-';
    if (applicantBusiness) applicantBusiness.textContent = currentApp.business || '-';
    if (applicantStructure) applicantStructure.textContent = `${STRUCTURE_LABELS[currentApp.biztype] || '-'} · ${currentApp.city || '-'}`;
    if (applicantVkn) applicantVkn.textContent = isFilled(details.taxno) ? details.taxno : '-';
    if (applicantSpace) applicantSpace.textContent = isFilled(details.bizyear) ? details.bizyear : '-';
    // İletişim: e-posta ve telefon tıklanabilir (kullanıcı verisi yalnız metin ve güvenli şemalı bağlantı olarak yazılır).
    const contactLink = (id, value, scheme) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.replaceChildren();
      if (!isFilled(value)) { el.textContent = '-'; return; }
      const a = document.createElement('a');
      a.href = `${scheme}:${scheme === 'tel' ? String(value).replace(/[^\d+]/g, '') : value}`;
      a.textContent = value;
      el.appendChild(a);
    };
    contactLink('applicantEmail', details.email, 'mailto');
    contactLink('applicantPhone', details.phone, 'tel');
    {
      const el = document.getElementById('applicantAddress');
      if (el) el.textContent = isFilled(details.address) ? details.address : '-';
    }
    if (applicantAge) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(details.birthdate || ''));
      if (m) {
        const eligible = MYUI.isAgeEligible(details.birthdate);
        applicantAge.textContent = `${m[3]}.${m[2]}.${m[1]} — Yaş şartı: ${eligible ? 'Uygun' : 'Uygun değil'}`;
      } else {
        applicantAge.textContent = '-';
      }
    }
  }
  renderKunye();

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
  let scoreResult = null;
  let sistemScore = null;
  function renderSystemScore() {
    const rawSistem = isFilled(currentApp.systemScore) ? currentApp.systemScore : currentApp.sistemScore;
    scoreResult = rawSistem && typeof rawSistem === 'object' ? rawSistem : null;
    sistemScore = num(scoreResult ? scoreResult.total : rawSistem);
    setScore(sistemScoreDisplay, sistemScore, 70);
    if (summarySistemScore) summarySistemScore.textContent = sistemScore === null ? '-' : sistemScore;
  }
  renderSystemScore();

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
    id: '31 Aralık 2026 itibarıyla 18–55 yaş (doğum 1971-01-01 – 2008-12-31)'
  };
  // Arayüz durumu: seçilen talep anahtarı ve (kalıcı olmayan) Uyumsuz gerekçesi.
  const docUi = {};
  ['msa', ...DOC_KINDS].forEach((k) => { docUi[k] = { invalid: '' }; });
  const requestedDocsList = document.getElementById('requestedDocsList');
  const btnRequestDocs = document.getElementById('btnRequestDocs');
  const requestHint = document.getElementById('requestHint');
  const OPEN_STATES = ['awaiting-answers', 'pending-score', 'scored'];

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
    // Yükleme sonucu satırın içinde yazılır (sayfa kaydırılmaz); yeniden çizimde korunur.
    if (ui.uploadNote) {
      const p = document.createElement('p');
      p.setAttribute('role', ui.uploadOk ? 'status' : 'alert');
      p.dataset.state = ui.uploadOk ? 'ok' : 'error';
      p.textContent = ui.uploadNote;
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
        btn.addEventListener('click', () => (status === 'valid' ? askValid : askInvalid)(kind));
        actions.appendChild(btn);
      });
    } else if (requested) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = true;
      btn.textContent = 'Talep Edildi';
      actions.appendChild(btn);
    }
    // Başka kanaldan (e-posta, elden) gelen belge: editör yükler ya da değiştirir (MSA dahil).
    const upLabel = document.createElement('label');
    upLabel.dataset.uploadLabel = '';
    upLabel.textContent = openUrl ? 'Belgeyi Değiştir' : 'Belge Yükle';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.dataset.upload = kind;
    input.setAttribute('aria-label', `${label}: ${upLabel.textContent}`);
    input.addEventListener('change', () => uploadDoc(kind, input));
    upLabel.appendChild(input);
    actions.appendChild(upLabel);

    row.append(text, actions);
    list.appendChild(row);
  }

  async function uploadDoc(kind, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const ui = docUi[kind];
    const fail = (msg) => { ui.uploadNote = msg; ui.uploadOk = false; renderDocs(); };
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { input.value = ''; fail('Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.'); return; }
    if (file.size === 0) { input.value = ''; fail('Dosya boş; lütfen geçerli bir dosya seçiniz.'); return; }
    if (file.size > 10 * 1024 * 1024) { input.value = ''; fail('Dosya boyutu en fazla 10 MB olabilir.'); return; }
    input.disabled = true;
    try {
      await MYAPI.editorUploadDocument(currentApp.ref, kind, file);
    } catch (apiErr) {
      input.disabled = false;
      fail(apiErr.message || 'Belge yüklenemedi.');
      return;
    }
    ui.invalid = '';
    ui.uploadNote = `${file.name} yüklendi; belgeyi inceleyip doğrulayınız.`;
    ui.uploadOk = true;
    try {
      await refreshDetail();                // dosya adı, doğrulama durumu (yeni belge doğrulanmamış sayılır)
    } catch (err) {
      ui.uploadNote = 'Belge yüklendi ancak ekran yenilenemedi; sayfayı yenileyiniz.';
      renderDocs();
    }
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

  // #btnRequestDocs: vergi/SGK/kimlik belgelerinin üçünü birden talep eder ve soruları açar; sorular açılınca pasif.
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
    // Davet (belge talebi) MSA doğrulaması da sayılır (R20): MSA önceden işaretlenmek zorunda değildir.
    // Sorular açıldıktan sonra aynı düğme talebi ve e-postasını yeniden gönderir (K14).
    if (OPEN_STATES.includes(status)) {
      label = 'Belge Talebini Yeniden Gönder';
    } else {
      label = 'Belge Talep Et ve Ön Değerlendirme Sorularını Gönder';
    }
    if (verifyWrites > 0) {
      disabled = true;
      hint = 'Doğrulama kaydediliyor…';
    } else if (docUi.msa.invalid) {
      // Davet MSA'yı doğrulanmış sayar (R20): MSA uyumsuz işaretliyken davet gönderilmez.
      disabled = true;
      hint = 'MSA Sertifikası uyumsuz işaretli: davet gönderilemez. Başvuruyu reddetmek için Kaydet\'e basınız ya da işareti kaldırınız.';
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
    renderStatusBadge();
    renderDocs();
    renderPreeval();
  }

  // Sonuç düğmenin hemen altında yazılır; sayfa yukarı kaydırılmaz.
  const requestResult = document.getElementById('requestResult');
  function requestNote(msg, ok) {
    if (!requestResult) { showBanner(msg, ok); return; }
    requestResult.textContent = msg;
    requestResult.dataset.state = ok ? 'ok' : 'error';
    requestResult.hidden = !msg;
  }

  if (btnRequestDocs) {
    btnRequestDocs.addEventListener('click', async () => {
      if (btnRequestDocs.disabled) return;
      btnRequestDocs.disabled = true;
      requestNote('', true);
      const resend = OPEN_STATES.includes(currentApp.status);
      let res;
      try {
        res = await MYAPI.requestDocs(currentApp.ref, DOC_KINDS, resend);
      } catch (apiErr) {
        syncRequestButton();
        requestNote(apiErr.message || 'İşlem tamamlanamadı.', false);
        return;
      }
      try {
        await refreshDetail();
      } catch (err) {
        requestNote((err && err.message) || 'Başvuru yenilenemedi. Sayfayı yenileyiniz.', false);
        return;
      }
      syncRequestButton();
      const mailNote = res && res.mail === 'failed' ? ' Ancak e-posta gönderilemedi; adaya başka yoldan ulaşınız.' : '';
      requestNote((resend ? 'Belge talebi e-postası adaya yeniden gönderildi.'
        : 'Belgeler talep edildi ve ön değerlendirme soruları açıldı; adaya e-posta gönderildi.') + mailNote, !mailNote);
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
      const rej = currentApp.rejection;
      applicantStatusBadge.textContent = rej && !rej.announcedAt ? 'Elendi (adaya bildirilmedi)' : 'Elendi';
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
  // R18: tür şirkete düzeltildiyse Ö2'deki 0 bilinçli bir puan değildir: editör yeniden seçmeden kayıt yapılamaz.
  if (currentApp.rescoreQ2) vals[1] = null;
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
    // Taslak süre dolunca sistem tarafından gönderildiyse (aday kendisi göndermediyse) belirtilir.
    const autoNote = document.getElementById('autoSubmittedNote');
    if (autoNote) autoNote.hidden = !(opened && currentApp.autoSubmitted === true && !!answers);
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

  // Uyarı varsayılan olarak sayfa başında; "anchor" verilirse o öğenin hemen altına taşınır (ör. Kaydet düğmesi).
  const feedbackHome = saveFeedback ? { parent: saveFeedback.parentNode, next: saveFeedback.nextSibling } : null;
  function showBanner(msg, isSuccess, anchor) {
    if (!saveFeedback) return;
    if (anchor) anchor.insertAdjacentElement('afterend', saveFeedback);
    else if (saveFeedback.parentNode !== feedbackHome.parent) feedbackHome.parent.insertBefore(saveFeedback, feedbackHome.next);
    saveFeedback.textContent = msg;
    saveFeedback.className = isSuccess ? 'feedback-banner feedback-success' : 'feedback-banner feedback-error';
    saveFeedback.removeAttribute('hidden');
    saveFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Başvuru kararı: ret (iç karar; yönetici bildirene dek adaya görünmez) ve geri alma ──
  const rejectionInfo = document.getElementById('rejectionInfo');
  const btnReject = document.getElementById('btnReject');
  const btnUnreject = document.getElementById('btnUnreject');
  const rejectModal = document.getElementById('rejectModal');
  const isAdmin = currentUser.role === 'admin';
  const fmtDate = s => new Date(Number(s) * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

  function renderDecision() {
    const rej = currentApp.status === 'rejected' ? currentApp.rejection : null;
    if (btnReject) btnReject.hidden = currentApp.status === 'rejected';
    if (rejectionInfo) {
      rejectionInfo.hidden = !rej;
      if (rej) {
        const when = rej.announcedAt ? `Adaya bildirildi: ${fmtDate(rej.announcedAt)}.` : 'Adaya henüz bildirilmedi.';
        rejectionInfo.textContent = `Reddedildi (${fmtDate(rej.rejectedAt)}). Gerekçe: ${rej.reason} ${when}`;
      }
    }
    // Bildirilmiş ret yalnız yönetici tarafından geri alınır (sonrası manuel süreç).
    if (btnUnreject) btnUnreject.hidden = !rej || (!!rej.announcedAt && !isAdmin);
  }

  if (btnReject && rejectModal) {
    const form = rejectModal.querySelector('form');
    const reasonEl = document.getElementById('rejectReason');
    const errEl = document.getElementById('rejectError');
    const close = () => MYUI.closeModal(rejectModal);
    document.getElementById('closeRejectModal').addEventListener('click', close);
    document.getElementById('cancelReject').addEventListener('click', close);
    btnReject.addEventListener('click', () => {
      reasonEl.value = '';
      errEl.hidden = true;
      MYUI.openModal(rejectModal);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = reasonEl.value.trim();
      if (!reason) { errEl.textContent = 'Gerekçe yazılması zorunludur.'; errEl.hidden = false; reasonEl.focus(); return; }
      // sunucu sınırı bayt cinsindendir (Türkçe harfler 2 bayt)
      if (new TextEncoder().encode(reason).length > 500) { errEl.textContent = 'Gerekçe çok uzun; lütfen kısaltınız.'; errEl.hidden = false; return; }
      try {
        await MYAPI.rejectApplication(currentApp.ref, reason);
      } catch (apiErr) {
        errEl.textContent = apiErr.message || 'Başvuru reddedilemedi.';
        errEl.hidden = false;
        return;
      }
      close();
      try { await refreshDetail(); } catch (err) { showBanner('Başvuru reddedildi; ekran yenilenemedi, sayfayı yenileyiniz.', false); return; }
      renderDecision();
      showBanner('Başvuru reddedildi. Ret, yönetici bildirimi gönderene kadar adaya görünmez.', true);
    });
  }
  if (btnUnreject) {
    btnUnreject.addEventListener('click', async () => {
      btnUnreject.disabled = true;
      try {
        await MYAPI.unrejectApplication(currentApp.ref);
      } catch (apiErr) {
        btnUnreject.disabled = false;
        showBanner(apiErr.message || 'Ret geri alınamadı.', false);
        return;
      }
      btnUnreject.disabled = false;
      try { await refreshDetail(); } catch (err) { showBanner('Ret geri alındı; ekran yenilenemedi, sayfayı yenileyiniz.', false); return; }
      renderDecision();
      showBanner('Ret geri alındı; başvuru önceki aşamasına döndü.', true);
    });
  }

  // R18: işletme türü şirkete çevrildi, aday Ö2'yi yanıtlamadı: Ö2 bilinçli verilmiş bir 0 değildir.
  function renderRescoreWarning() {
    const old = document.querySelector('[data-rescore="q2"]');
    if (old) old.remove();
    const host = document.getElementById('ansQ2');
    if (!currentApp.rescoreQ2 || !host) return;
    const warn = document.createElement('p');
    warn.setAttribute('role', 'status');
    warn.dataset.rescore = 'q2';
    warn.textContent = 'Ö2 yeniden puanlanmalı: işletme türü editör tarafından şirket olarak düzeltildi; aday bu soruyu yanıtlamadı.';
    host.insertAdjacentElement('beforebegin', warn);
  }

  // ── Beyanları düzenle (K1–K7): yalnız değişen alanlar gönderilir; aday düzeltmeyi görmez ──
  const editForm = document.getElementById('editForm');
  // Başvuru formundaki seçenek metinleri (fe/basvuru.html name="q22")
  const Q22_FORM_LABELS = { mutfak: 'Mutfak imkânlarımı artıracağım', masa: 'Masa-sandalye sayımı artıracağım', istihdam: 'İstihdam artıracağım',
    dekorasyon: 'Dekorasyona yatırım yapacağım', tanitim: 'Tanıtım ve reklama harcayacağım', borc: 'Borçlarımı ödeyeceğim' };
  const EDIT_FIELDS = ['fullname', 'birthdate', 'phone', 'city', 'biztype', 'bizname', 'taxno', 'bizyear', 'instagram', 'address',
    'q11', 'q12', 'q13', 'q14_hired_count', 'q14_stayed_count', 'q15', 'q21'];
  const NUMERIC = new Set(['bizyear', 'q11', 'q12', 'q13', 'q14_hired_count', 'q14_stayed_count']);
  const yn = v => (v === 'yes' ? 'Evet' : v === 'no' ? 'Hayır' : 'Yanıtlanmadı');
  const SHOW = { biztype: v => STRUCTURE_LABELS[v] || v, q15: yn, q21: yn };
  // Başvuru şartları yalnız bilgi verir (K3): değer şartın altındaysa alanın altında not görünür.
  const CONDITIONS = {
    q11: v => (Number(v) < 2 ? 'Başvuru şartı: kendisi hariç en az 2 SGK\'lı çalışan.' : ''),
    birthdate: v => (v && !MYUI.isAgeEligible(v) ? 'Başvuru şartı: 31 Aralık 2026 itibarıyla 18–55 yaş.' : '')
  };

  function fieldNote(name, kind) {
    const input = editForm.elements[name];
    const box = input && input.closest('.field');
    if (!box) return null;
    let el = box.querySelector(`small[data-${kind}]`);
    if (!el) {
      el = document.createElement('small');
      el.dataset[kind] = '1';
      box.appendChild(el);
    }
    return el;
  }

  function syncConditions() {
    Object.keys(CONDITIONS).forEach(name => {
      const el = fieldNote(name, 'note');
      if (!el) return;
      el.textContent = CONDITIONS[name](editForm.elements[name].value);
      el.hidden = !el.textContent;
    });
  }

  function fillEditForm() {
    if (!editForm) return;
    ['edit-q22a', 'edit-q22b'].forEach(id => {
      const sel = document.getElementById(id);
      sel.replaceChildren(...Object.keys(Q22_FORM_LABELS).map(k => new Option(Q22_FORM_LABELS[k], k)));
    });
    EDIT_FIELDS.forEach(name => {
      const input = editForm.elements[name];
      if (input) input.value = isFilled(currentApp[name]) ? String(currentApp[name]) : '';
    });
    const q22 = Array.isArray(currentApp.q22) ? currentApp.q22 : [];
    editForm.elements.q22a.value = q22[0] || 'mutfak';
    editForm.elements.q22b.value = q22[1] || 'istihdam';
    const dec = currentApp.edited ? currentApp.declared : null;
    EDIT_FIELDS.concat(['q22a']).forEach(name => {
      const el = fieldNote(name, 'declared');
      if (!el) return;
      let before = null;
      if (dec && name === 'q22a') {
        const a = [...(dec.q22 || [])].sort().join(','), b = [...q22].sort().join(',');
        if (a !== b) before = (dec.q22 || []).map(k => Q22_FORM_LABELS[k] || k).join(', ');
      } else if (dec && String(dec[name] ?? '') !== String(currentApp[name] ?? '')) {
        before = SHOW[name] ? SHOW[name](dec[name]) : (isFilled(dec[name]) ? dec[name] : '(boş)');
      }
      el.textContent = before === null ? '' : `Önceki Beyan: ${before}`;
      el.hidden = before === null;
    });
    syncConditions();
  }

  if (editForm) {
    fillEditForm();
    editForm.addEventListener('input', syncConditions);
    const editError = document.getElementById('editError');
    const editResult = document.getElementById('editResult');
    const editNote = (msg, ok) => {
      editResult.textContent = msg;
      editResult.dataset.state = ok ? 'ok' : 'error';
      editResult.hidden = !msg;
    };
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fields = {};
      EDIT_FIELDS.forEach(name => {
        const raw = editForm.elements[name].value.trim();
        const was = isFilled(currentApp[name]) ? String(currentApp[name]) : '';
        if (raw === was) return;
        fields[name] = NUMERIC.has(name) ? (raw === '' ? null : Number(raw)) : raw;
      });
      // Kooperatiften çıkan başvuruda "tek geçim kaynağı" sorusu artık puanlanır: seçili yanıt her zaman gönderilir.
      if (fields.biztype && fields.biztype !== 'kooperatif' && !('q21' in fields)) {
        const v = editForm.elements.q21.value;
        fields.q21 = v === '' ? null : v;
      }
      // "işe başlayan" değişince "hâlâ çalışan" da gönderilir: sunucu ikisini birlikte değerlendirir (0 da geçerli bir yanıt)
      if ('q14_hired_count' in fields && !('q14_stayed_count' in fields)) {
        const st = editForm.elements.q14_stayed_count.value.trim();
        fields.q14_stayed_count = st === '' ? null : Number(st);
      }
      const q22 = [editForm.elements.q22a.value, editForm.elements.q22b.value];
      const sameSet = (x, y) => x.length === y.length && x.every(k => y.includes(k));
      if (!sameSet(q22, currentApp.q22 || [])) fields.q22 = q22;
      const reason = document.getElementById('edit-reason').value.trim();
      let msg = '';
      if (!Object.keys(fields).length) msg = 'Değiştirilmiş bir alan yok.';
      else if (!reason) msg = 'Düzenleme gerekçesi yazılması zorunludur.';
      else if (new TextEncoder().encode(reason).length > 250) msg = 'Gerekçe çok uzun; lütfen kısaltınız.';
      editError.textContent = msg;
      editError.hidden = !msg;
      if (msg) return;
      editNote('', true);
      const btn = document.getElementById('btnSaveEdit');
      btn.disabled = true;
      let res;
      try {
        res = await MYAPI.editApplication(currentApp.ref, fields, reason);
      } catch (apiErr) {
        btn.disabled = false;
        editError.textContent = apiErr.message || 'Düzeltme kaydedilemedi.';
        editError.hidden = false;
        return;
      }
      // Sayfa yenilenmez, kart açık kalır, kaydırma değişmez: veriler yerinde güncellenir, sonuç düğmenin altında yazılır.
      btn.disabled = false;
      try {
        await refreshDetail();
      } catch (err) {
        editNote('Düzeltmeler kaydedildi ancak ekran yenilenemedi; sayfayı yenileyiniz.', false);
        return;
      }
      bizType = currentApp.biztype;
      askQ2 = bizType === 'sirket';
      if (!askQ2) vals[1] = 5;
      else if (currentApp.rescoreQ2) vals[1] = null;
      else if (Array.isArray(currentApp.rubric) && Number.isInteger(currentApp.rubric[1])) vals[1] = currentApp.rubric[1];
      useStoredTotals = num(currentApp.preScore) !== null;
      renderKunye();
      renderSystemScore();
      buildScoreGrid();
      renderPreeval();
      renderSummary();
      renderStatusBadge();
      renderRescoreWarning();
      fillEditForm();
      document.getElementById('edit-reason').value = '';
      if (!res.changed || res.changed.length === 0) {
        editNote('Değişiklik yok: kayıttaki değerlerle aynı.', true);
        return;
      }
      const notes = (res.notices || []).filter(n => n.field === 'rubric').map(n => n.text).join(' ');
      editNote(`Düzeltmeler kaydedildi. Sistem Puanı: ${res.systemTotal}.` +
        (res.finalTotal !== null && res.finalTotal !== undefined ? ` Toplam: ${res.finalTotal}.` : '') + (notes ? ` ${notes}` : ''), true);
    });
  }

  buildStars();
  renderStatusBadge();
  renderDocs();
  renderPreeval();
  renderSummary();
  renderDecision();
  renderRescoreWarning();

  if (evaluationForm) {
    // Devam eden kayıt varken ikinci gönderim yok sayılır. Kayıttan sonra sayfada kalınır; listeye editör kendisi döner.
    let saving = false;
    const btnSaveEvaluation = document.getElementById('btnSaveEvaluation');
    const note = (msg, ok) => showBanner(msg, ok, btnSaveEvaluation);
    evaluationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving) return;
      saving = true;
      if (saveFeedback) saveFeedback.hidden = true;   // önceki sonuç, yeni kaydın sonucuyla karışmasın
      if (btnSaveEvaluation) btnSaveEvaluation.disabled = true;
      try { await saveEvaluation(); } finally {
        saving = false;
        if (btnSaveEvaluation) btnSaveEvaluation.disabled = false;
      }
    });

    // Kayıttan sonra ekran sunucudaki güncel durumla yenilenir; yenilenemezse kayıt yine de yapılmıştır.
    async function afterSave() {
      try { await refreshDetail(); } catch (err) { /* kayıt yapıldı; görünüm bir sonraki açılışta güncellenir */ }
      renderSummary();
      renderDecision();
      renderRescoreWarning();
    }

    async function saveEvaluation() {
      const hasInvalid = document.querySelector('[data-v].active-invalid');
      if (hasInvalid) {
        const reasonVal = collectRejectionReason();
        if (!reasonVal || new TextEncoder().encode(reasonVal).length > 500) {
          note(reasonVal ? 'Belge gerekçeleri çok uzun; lütfen kısaltınız.' : 'Uyumsuz belge için gerekçe yazılması zorunludur.', false);
          return;
        }

        try {
          await MYAPI.rejectApplication(currentApp.ref, reasonVal);
        } catch (apiErr) {
          note(apiErr.message || 'Başvuru elendi olarak kaydedilemedi.', false);
          return;
        }

        currentApp.status = 'rejected';

        renderStatusBadge();
        await afterSave();
        note('Başvuru belge uyumsuzluğu tutanağı işlenerek elendi olarak kaydedildi.', true);
        return;
      }

      if (vals.some(v => v === null)) {
        note('Lütfen 6 sorunun hepsi için yıldız seçiniz (puan vermeyecekseniz "Temizle" ile 0 yapınız).', false);
        return;
      }
      if (currentApp.status !== 'pending-score' && currentApp.status !== 'scored') {
        note('Aday ön değerlendirme sorularına yanıt vermeden puanlama yapılamaz.', false);
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
        note(apiErr.message || 'Ön değerlendirme kaydedilemedi.', false);
        return;
      }

      currentApp.status = 'scored';
      const raw = (res && res.application) || res || {};
      // API: {"pre_total", "total_score"}; eski biçim {"preScore", "totalScore"} de okunur.
      const saved = {
        totalScore: num(raw.total_score) !== null ? raw.total_score : raw.totalScore,
        preScore: num(raw.pre_total) !== null ? raw.pre_total : raw.preScore
      };
      if (num(saved.totalScore) !== null) currentApp.totalScore = saved.totalScore;
      if (num(saved.preScore) !== null) currentApp.preScore = saved.preScore;

      renderStatusBadge();

      const totalText = num(saved.totalScore) !== null ? ` Toplam Ön Sıralama Puanı: ${saved.totalScore} / 100.` : '';
      await afterSave();
      note(`Ön Değerlendirme başarıyla kaydedildi.${totalText}`, true);
    }
  }
});

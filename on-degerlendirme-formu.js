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
      if (window.MYAPI && window.MYCONFIG && window.MYCONFIG.apiBase) {
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
  if (window.MYAPI && window.MYCONFIG && window.MYCONFIG.apiBase) {
    try { server = await MYAPI.getPreeval(); } catch (e) { server = null; }
    if (server && !server.ok) server = null;
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
        showFeedback('Ön Değerlendirme aşamanız henüz açılmadı', 'Bu aşama, talep edilen doğrulama belgelerinin tamamını yükleyen adaylar için açılır; belgelerinizi yüklemeniz halinde erişebilirsiniz.');
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
      q2Note.textContent = 'Bu soru şahıs işletmeleri ve kadın kooperatifleri için sorulmaz (doğrudan 5 puan).';
      q2Note.removeAttribute('hidden');
    }
  }

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

  function toNumber(v) {
    return v === null || v === undefined || v === '' ? NaN : Number(v);
  }

  // Sistem Puanı başvuruda hesaplanmış olarak saklanır; yoksa başvuru yanıtlarından hesaplanır.
  function resolveSystemScore(a) {
    const candidates = [a.sistemScore, a.systemScore];
    for (let i = 0; i < candidates.length; i++) {
      const v = candidates[i];
      const n = v && typeof v === 'object' ? Number(v.total) : toNumber(v);
      if (Number.isFinite(n)) return n;
    }
    try {
      return MYScoring.systemScore({
        biztype: a.biztype,
        q11: Number(a.q11),
        q12: Number(a.q12),
        q13: Number(a.q13),
        q14: a.q14,
        q15: a.q15,
        q21: a.q21,
        q22: Array.isArray(a.q22) ? a.q22 : []
      }).total;
    } catch (e) {
      return null;
    }
  }

  function buildRecord(a, answers) {
    const total = toNumber(a.q11);
    const female = toNumber(a.q12);
    const STRUCTURE_LABELS = {
      sahis: 'Şahıs İşletmesi',
      sirket: 'Şirket',
      kooperatif: 'Kadın Kooperatifi'
    };
    return {
      ref: a.refNo,
      name: a.fullname || '',
      business: a.bizname || '',
      structure: STRUCTURE_LABELS[a.biztype] || '',
      biztype: a.biztype || null,
      city: a.city || '',
      totalEmployees: Number.isFinite(total) ? total : 0,
      femaleRatio: total > 0 && Number.isFinite(female) ? Math.round((female / total) * 100) : 0,
      sistemScore: resolveSystemScore(a),
      preScore: null,
      totalScore: null,
      status: 'pending-score',
      statusText: 'Ön Değerlendirme Bekliyor',
      applicantAnswers: answers,
      details: {
        birthdate: a.birthdate || null,
        taxno: a.taxno || null,
        bizyear: a.bizyear || null,
        fileName: a.fileName || null,
        q11: a.q11,
        q12: a.q12,
        q13: a.q13,
        q14: a.q14,
        q15: a.q15,
        q21: a.q21,
        q22: a.q22
      }
    };
  }

  if (form && !isViewMode) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

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

      if (window.MYAPI && window.MYCONFIG && window.MYCONFIG.apiBase) {
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

      // Kaydı başvurunun ref numarasına göre bul; yoksa başvurudan yeni kayıt oluştur.
      // Note: In production, the editor panel fetches fresh data from the API.
      // This localStorage update is only for offline/demo mode without API.
      if (!window.MYCONFIG || !window.MYCONFIG.apiBase) {
        const applications = MYUI.readJSON('programApplications', []);
        const targetApp = applications.find(a => a.ref === refNo);
        if (targetApp) {
          targetApp.status = 'pending-score';
          targetApp.statusText = 'Ön Değerlendirme Bekliyor';
          targetApp.applicantAnswers = answers;
          targetApp.preScore = null;
          targetApp.totalScore = null;
          delete targetApp.rubric;
        } else {
          applications.push(buildRecord(appData, answers));
        }
        MYUI.writeJSON('programApplications', applications);
      }

      showFeedback('Ön Değerlendirme cevaplarınız gönderildi', 'Cevaplarınız program ekibine iletildi. Takip paneline yönlendiriliyorsunuz...');

      submitBtn.disabled = true;

      setTimeout(() => {
        window.location.href = 'panel.html';
      }, 1500);
    });
  }
  // Arka uç API entegrasyonu (sunucuda kayıtlı ön değerlendirme cevapları varsa formu doldurur ve kilitler)
  async function loadRemotePreeval() {
    if (!window.MYAPI || !window.MYCONFIG || !window.MYCONFIG.apiBase) return false;
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
      // Çevrimdışı modda yerel depolama kullanılır
    }
    return false;
  }

  loadRemotePreeval();
});

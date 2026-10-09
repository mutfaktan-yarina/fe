const LAST_ELIGIBLE_START_YEAR = 2024; // başvuru 12 Ekim–12 Kasım 2026, en az 2 yıl
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getUserScopedKey(baseKey) {
  const currentUser = MYUI.readJSON('currentUser');
  if (currentUser && currentUser.email) {
    return baseKey + '_' + btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '');
  }
  return baseKey;
}

function getDraftKey() { return getUserScopedKey('mutfaktan_app_draft'); }
function getAppKey() { return getUserScopedKey('mutfaktan_application'); }

function clearUserDraftData() {
  const currentUser = MYUI.readJSON('currentUser');
  if (currentUser && currentUser.email) {
    const emailKey = btoa(currentUser.email).replace(/[^a-zA-Z0-9]/g, '');
    localStorage.removeItem('mutfaktan_app_draft_' + emailKey);
    localStorage.removeItem('mutfaktan_application_' + emailKey);
  }
  // Also clear legacy unscoped keys
  localStorage.removeItem('mutfaktan_app_draft');
  localStorage.removeItem('mutfaktan_application');
}

function redirectToLogin() {
  try { localStorage.removeItem('currentUser'); } catch (e) {}
  window.location.replace('giris.html?next=basvuru.html');
}

document.addEventListener('DOMContentLoaded', () => {
  // panel.js ile aynı koruma: oturum yoksa ya da süresi dolduysa taslak hatası yerine girişe yönlendirilir
  const sessionUser = MYUI.readJSON('currentUser');
  if (!sessionUser || (sessionUser.role !== 'applicant' && sessionUser.role !== 'member')) {
    redirectToLogin();
    return;
  }
  if (window.MYAPI && typeof window.MYAPI.session === 'function') {
    window.MYAPI.session().catch((err) => { if (err && err.status === 401) redirectToLogin(); });
  }

  let currentStep = 1;
  const totalSteps = 6;

  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('mode') === 'edit';
  const editBanner = document.getElementById('edit-banner');
  if (isEditMode && editBanner) editBanner.classList.add('active');

  const stepPanes = document.querySelectorAll('.step-pane');
  const stepItems = document.querySelectorAll('[data-step]');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  const fileInput = document.getElementById('inp-file');
  const dropzone = document.getElementById('dropzone');
  const filePreview = document.getElementById('file-preview');
  const fileName = document.getElementById('file-name');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const fileError = document.getElementById('file-error');
  const fileErrorText = document.getElementById('file-error-text');
  const FILE_ERROR_DEFAULT = fileErrorText ? fileErrorText.textContent : '';

  const bizyearInput = document.getElementById('inp-bizyear');
  const bizyearError = document.getElementById('bizyear-error');
  bizyearInput.max = LAST_ELIGIBLE_START_YEAR;
  if (bizyearError) {
    bizyearError.textContent = `İşletme en az 2 yıldır faaliyette olmalıdır (en geç ${LAST_ELIGIBLE_START_YEAR}).`;
  }

  const birthError = document.getElementById('birth-error');
  const BIRTH_ERROR_DEFAULT = birthError ? birthError.textContent : '';

  const hiredRadios = document.querySelectorAll('input[name="q14_hired"]');
  const detailField = document.getElementById('field-q14-detail');
  const q14Select = document.getElementById('inp-q14');
  const q22Inputs = document.querySelectorAll('input[name="q22"]');
  const q22CounterLabel = document.getElementById('q22-counter-label');
  const q22Err = document.getElementById('q22-error');

  let uploadedFile = null;
  // Düzenlemede referans numarası ve ilk gönderim tarihi değişmesin
  let refNo = null;
  let submittedAt = null;

  function checkedValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function toInt(v) {
    const str = String(v == null ? '' : v).trim();
    if (str === '') return NaN;
    const n = Number(str);
    return Number.isInteger(n) ? n : NaN;
  }

  function syncQ14Detail() {
    if (checkedValue('q14_hired') === 'yes') detailField.removeAttribute('hidden');
    else detailField.setAttribute('hidden', '');
  }

  function syncQ22UI() {
    q22Inputs.forEach(input => {
      input.closest('label').classList.toggle('checked', input.checked);
    });
    const count = document.querySelectorAll('input[name="q22"]:checked').length;
    if (q22CounterLabel) {
      q22CounterLabel.textContent = `(Tam 2 seçim yapınız — Seçilen: ${count} / 2)`;
    }
    q22Inputs.forEach(input => {
      input.disabled = count >= 2 && !input.checked;
    });
    return count;
  }

  function formatPhone(val) {
    if (!val) return '';
    let digits = String(val).replace(/\D/g, '');
    if (digits.length > 11) digits = digits.slice(0, 11);
    if (!digits) return '';
    if (!digits.startsWith('0')) digits = '0' + digits;
    let res = digits.slice(0, 4);
    if (digits.length > 4) res += ' ' + digits.slice(4, 7);
    if (digits.length > 7) res += ' ' + digits.slice(7, 9);
    if (digits.length > 9) res += ' ' + digits.slice(9, 11);
    return res;
  }

  function populateForm(data) {
    if (!data) return;
    try {
      if (data.eligibility) {
        data.eligibility.forEach((val, i) => {
          const chk = document.getElementById(`chk-el-${i + 1}`);
          if (chk) chk.checked = val;
        });
      }

      if (data.fullname) {
        const fn = document.getElementById('inp-fullname');
        if (fn) fn.value = data.fullname;
        const userDisp = document.getElementById('user-display');
        if (userDisp) userDisp.textContent = data.fullname;
      }
      if (data.birthdate) {
        const bd = document.getElementById('inp-birthdate');
        if (bd) bd.value = data.birthdate;
      }
      if (data.phone) {
        const ph = document.getElementById('inp-phone');
        if (ph) ph.value = formatPhone(data.phone);
      }
      if (data.email) {
        const em = document.getElementById('inp-email');
        if (em) em.value = data.email;
      }
      if (data.city) {
        const ct = document.getElementById('inp-city');
        if (ct) ct.value = data.city;
      }

      if (data.biztype) {
        const rad = document.querySelector(`input[name="biz-type"][value="${data.biztype}"]`);
        if (rad) rad.checked = true;
      }
      if (data.bizname) document.getElementById('inp-bizname').value = data.bizname;
      if (data.taxno) document.getElementById('inp-taxno').value = data.taxno;
      if (data.bizyear) document.getElementById('inp-bizyear').value = data.bizyear;
      if (data.instagram) document.getElementById('inp-instagram').value = data.instagram;
      if (data.address) document.getElementById('inp-address').value = data.address;

      const certName = data.fileName || data.certificateName || (data.certificate && data.certificate.name);
      if (certName) {
        uploadedFile = { name: certName };
        fileName.textContent = certName;
        filePreview.classList.add('active');
        dropzone.classList.add('hidden');
      }

      if (data.q11 !== undefined && data.q11 !== null) document.getElementById('inp-q11').value = data.q11;
      if (data.q12 !== undefined && data.q12 !== null) document.getElementById('inp-q12').value = data.q12;
      if (data.q13 !== undefined && data.q13 !== null) document.getElementById('inp-q13').value = data.q13;

      let hired = data.q14_hired || null;
      if (!hired && data.q14) hired = data.q14 === 'none' ? 'no' : 'yes';
      if (hired) {
        const rad = document.querySelector(`input[name="q14_hired"][value="${hired}"]`);
        if (rad) rad.checked = true;
      }
      if (hired === 'yes' && data.q14 && data.q14 !== 'none') q14Select.value = data.q14;
      syncQ14Detail();

      if (data.q15) {
        const rad = document.querySelector(`input[name="q15"][value="${data.q15}"]`);
        if (rad) rad.checked = true;
      }
      if (data.q21) {
        const rad = document.querySelector(`input[name="q21"][value="${data.q21}"]`);
        if (rad) rad.checked = true;
      }
      if (data.q22 && Array.isArray(data.q22)) {
        data.q22.forEach(val => {
          const chk = document.querySelector(`input[name="q22"][value="${val}"]`);
          if (chk) chk.checked = true;
        });
      }
      syncQ22UI();
    } catch (e) {}
  }

  function loadDraft() {
    const draft = MYUI.readJSON(getDraftKey());
    const app = MYUI.readJSON(getAppKey());
    const isObj = d => d && typeof d === 'object';
    // Gönderilmiş başvuru yalnızca düzenleme modunda forma yüklenir; yeni açılışta gönderilmiş kayıt hatırlanmaz.
    const isDraftObj = d => isObj(d) && d.status === 'draft';
    const data = isEditMode ? [draft, app].find(isObj) : [draft].find(isDraftObj);
    const metaSrc = [app, draft].find(d => isObj(d) && d.refNo);
    if (metaSrc) {
      refNo = metaSrc.refNo;
      submittedAt = metaSrc.submittedAt || null;
    }
    if (data) populateForm(data);

    // Oturum açmış kullanıcının e-posta/ad bilgisini boş ise otomatik doldur
    const currentUser = MYUI.readJSON('currentUser');
    if (currentUser) {
      const emailInp = document.getElementById('inp-email');
      if (emailInp && !emailInp.value && currentUser.email) {
        emailInp.value = currentUser.email;
      }
      const nameInp = document.getElementById('inp-fullname');
      if (nameInp && !nameInp.value && (currentUser.display_name || currentUser.name)) {
        nameInp.value = currentUser.display_name || currentUser.name;
        const userDisp = document.getElementById('user-display');
        if (userDisp) userDisp.textContent = nameInp.value;
      }
    }

    if (window.MYAPI && typeof window.MYAPI.getApplication === 'function') {
      window.MYAPI.getApplication()
        .then((res) => {
          if (res && res.application) {
            const apiApp = res.application;
            if (apiApp.ref) refNo = apiApp.ref;
            if (apiApp.submittedAt) submittedAt = apiApp.submittedAt;
            if (!isEditMode && apiApp.status !== 'draft') return;
            populateForm(apiApp);
            const merged = Object.assign({}, MYUI.readJSON(getDraftKey(), {}), apiApp);
            MYUI.writeJSON(getDraftKey(), merged);
          }
        })
        .catch(() => {});
    }
  }

  async function saveDraft() {
    const hired = checkedValue('q14_hired');
    let q14 = null;
    if (hired === 'no') q14 = 'none';
    else if (hired === 'yes') q14 = q14Select.value || null;

    const emailEl = document.getElementById('inp-email');
    const curUser = MYUI.readJSON('currentUser') || {};
    const emailVal = (emailEl ? emailEl.value.trim() : '') || curUser.email || '';

    const data = {
      eligibility: Array.from(document.querySelectorAll('input[name="eligibility"]')).map(c => c.checked),
      fullname: (document.getElementById('inp-fullname') || {}).value ? document.getElementById('inp-fullname').value.trim() : '',
      birthdate: (document.getElementById('inp-birthdate') || {}).value || '',
      phone: (document.getElementById('inp-phone') || {}).value ? document.getElementById('inp-phone').value.trim() : '',
      email: emailVal,
      city: (document.getElementById('inp-city') || {}).value ? document.getElementById('inp-city').value.trim() : '',
      biztype: (document.querySelector('input[name="biz-type"]:checked') || {}).value || null,
      bizname: (document.getElementById('inp-bizname') || {}).value ? document.getElementById('inp-bizname').value.trim() : '',
      taxno: (document.getElementById('inp-taxno') || {}).value ? document.getElementById('inp-taxno').value.trim() : '',
      bizyear: (document.getElementById('inp-bizyear') || {}).value ? document.getElementById('inp-bizyear').value.trim() : '',
      instagram: (document.getElementById('inp-instagram') || {}).value ? document.getElementById('inp-instagram').value.trim() : '',
      address: (document.getElementById('inp-address') || {}).value ? document.getElementById('inp-address').value.trim() : '',
      fileName: uploadedFile ? uploadedFile.name : null,
      q11: (document.getElementById('inp-q11') || {}).value || '',
      q12: (document.getElementById('inp-q12') || {}).value || '',
      q13: (document.getElementById('inp-q13') || {}).value || '',
      q14_hired: hired,
      q14: q14,
      q15: checkedValue('q15'),
      q21: checkedValue('q21'),
      q22: Array.from(document.querySelectorAll('input[name="q22"]:checked')).map(c => c.value),
      status: 'draft',
      updatedAt: new Date().toISOString()
    };
    if (refNo) data.refNo = refNo;
    if (submittedAt) data.submittedAt = submittedAt;
    MYUI.writeJSON(getDraftKey(), data);

    const draftStatusEl = document.getElementById('draft-save-status');
    const showDraftStatus = (msg, isErr) => {
      if (!draftStatusEl) return;
      draftStatusEl.style.display = 'inline-flex';
      draftStatusEl.style.color = isErr ? 'var(--color-error, #dc2626)' : 'var(--color-success, #16a34a)';
      draftStatusEl.textContent = msg;
    };

    if (window.MYAPI && typeof window.MYAPI.saveDraft === 'function') {
      showDraftStatus('Taslak kaydediliyor...', false);
      const apiData = {
        eligibility: data.eligibility,
        fullname: data.fullname,
        birthdate: data.birthdate || null,
        phone: data.phone,
        email: data.email,
        city: data.city,
        biztype: data.biztype,
        bizname: data.bizname,
        taxno: data.taxno,
        bizyear: data.bizyear ? parseInt(data.bizyear, 10) : null,
        instagram: data.instagram,
        address: data.address,
        q11: data.q11 !== '' ? parseInt(data.q11, 10) : null,
        q12: data.q12 !== '' ? parseInt(data.q12, 10) : null,
        q13: data.q13 !== '' ? parseInt(data.q13, 10) : null,
        q14: data.q14,
        q15: data.q15,
        q21: data.q21,
        q22: data.q22
      };
      return window.MYAPI.saveDraft(apiData)
        .then((res) => {
          showDraftStatus('Taslak kaydedildi ✓', false);
          return res;
        })
        .catch((err) => {
          if (err && err.isOfflineDemo) {
            showDraftStatus('Taslak kaydedildi (yerel)', false);
            return null;
          }
          if (err && err.status === 401) { redirectToLogin(); throw err; }
          showDraftStatus('Taslak kaydedilemedi: ' + (err.message || 'Hata'), true);
          throw err;
        });
    }
    showDraftStatus('Taslak kaydedildi (yerel)', false);
    return Promise.resolve(null);
  }

  // Kalınan adım sekme oturumunda (kullanıcıya özel) tutulur: yenileyince sihirbaz aynı adımda açılır.
  const stepKey = getUserScopedKey('mutfaktan_app_step');
  function rememberStep() {
    try { sessionStorage.setItem(stepKey, String(currentStep)); } catch (e) {}
  }

  function updateStepsUI() {
    rememberStep();
    stepPanes.forEach(pane => pane.classList.remove('active'));
    const activePane = document.getElementById(`step-${currentStep}`);
    if (activePane) activePane.classList.add('active');

    stepItems.forEach(item => {
      const step = parseInt(item.getAttribute('data-step'), 10);
      item.classList.remove('active', 'completed');
      if (step === currentStep) {
        item.classList.add('active');
      } else if (step < currentStep) {
        item.classList.add('completed');
      }
    });

    const locationEl = document.getElementById('location');
    if (locationEl) locationEl.textContent = `Adım ${currentStep} / ${totalSteps}`;
    const pctEl = document.getElementById('progress-pct');
    const fillEl = document.getElementById('progressbar-fill');
    const pct = Math.round((currentStep / totalSteps) * 100);
    if (pctEl) pctEl.textContent = `%${pct}`;
    if (fillEl) fillEl.style.width = `${pct}%`;

    if (currentStep === 1) {
      btnPrev.classList.add('hidden');
    } else {
      btnPrev.classList.remove('hidden');
    }

    if (currentStep === totalSteps) {
      btnNext.innerHTML = `<span>Başvuruyu Tamamla ve Gönder</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
      populateSummary();
    } else {
      btnNext.innerHTML = `<span>Devam Et</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>`;
    }

    if (currentStep > 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function validateStep1() {
    const checkboxes = document.querySelectorAll('input[name="eligibility"]');
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    const gateErr = document.getElementById('gate-error');
    if (!allChecked) {
      gateErr.classList.add('show');
      return false;
    }
    gateErr.classList.remove('show');
    return true;
  }

  function validateStep2() {
    let valid = true;
    const name = document.getElementById('inp-fullname');
    const birth = document.getElementById('inp-birthdate');
    const phone = document.getElementById('inp-phone');
    const email = document.getElementById('inp-email');
    const city = document.getElementById('inp-city');

    [name, birth, phone, email, city].filter(Boolean).forEach(inp => {
      const f = inp.closest('.field');
      if (f) f.classList.remove('invalid');
    });

    if (name && !name.value.trim()) {
      name.closest('.field').classList.add('invalid');
      valid = false;
    }

    if (birth) {
      if (!birth.value) {
        if (birthError) birthError.textContent = 'Doğum tarihi zorunludur.';
        birth.closest('.field').classList.add('invalid');
        valid = false;
      } else if (!MYScoring.isAgeEligible(birth.value)) {
        if (birthError) birthError.textContent = BIRTH_ERROR_DEFAULT;
        birth.closest('.field').classList.add('invalid');
        valid = false;
      }
    }

    if (phone) {
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) {
        phone.closest('.field').classList.add('invalid');
        valid = false;
      }
    }

    if (email && email.value.trim() && !MYUI.isEmail(email.value.trim())) {
      email.closest('.field').classList.add('invalid');
      valid = false;
    }

    if (city && !city.value.trim()) {
      city.closest('.field').classList.add('invalid');
      valid = false;
    }

    return valid;
  }

  function validateStep3() {
    let valid = true;
    const bizname = document.getElementById('inp-bizname');
    const taxno = document.getElementById('inp-taxno');
    const bizyear = document.getElementById('inp-bizyear');
    const address = document.getElementById('inp-address');

    [bizname, taxno, bizyear, address].forEach(inp => {
      inp.closest('.field').classList.remove('invalid');
    });

    const bizGroup = document.querySelector('input[name="biz-type"]').closest('.field');
    bizGroup.classList.remove('invalid');
    if (!document.querySelector('input[name="biz-type"]:checked')) {
      bizGroup.classList.add('invalid');
      valid = false;
    }

    if (!bizname.value.trim()) {
      bizname.closest('.field').classList.add('invalid');
      valid = false;
    }

    const taxVal = taxno.value.trim();
    if (taxVal.length < 10 || taxVal.length > 11 || !/^[1-9]\d*$/.test(taxVal)) {
      taxno.closest('.field').classList.add('invalid');
      valid = false;
    }

    const yearVal = toInt(bizyear.value);
    if (!yearVal || yearVal > LAST_ELIGIBLE_START_YEAR || yearVal < 1950) {
      bizyear.closest('.field').classList.add('invalid');
      valid = false;
    }

    if (!address.value.trim()) {
      address.closest('.field').classList.add('invalid');
      valid = false;
    }

    return valid;
  }

  function validateStep4() {
    if (!uploadedFile) {
      if (fileErrorText) fileErrorText.textContent = FILE_ERROR_DEFAULT;
      fileError.classList.add('show');
      return false;
    }
    fileError.classList.remove('show');
    return true;
  }

  function validateStep5() {
    let valid = true;
    const q11 = document.getElementById('inp-q11');
    const q12 = document.getElementById('inp-q12');
    const q13 = document.getElementById('inp-q13');
    const q14Pre = document.getElementById('field-q14-pre');
    const q15Field = document.querySelector('input[name="q15"]').closest('.field');
    const q21Field = document.querySelector('input[name="q21"]').closest('.field');
    const q22Checks = document.querySelectorAll('input[name="q22"]:checked');

    [q11, q12, q13, q14Select].forEach(inp => inp.closest('.field').classList.remove('invalid'));
    [q14Pre, q15Field, q21Field].forEach(f => f.classList.remove('invalid'));

    const val11 = toInt(q11.value);
    if (isNaN(val11) || val11 < 2) {
      q11.closest('.field').classList.add('invalid');
      valid = false;
    }

    const val12 = toInt(q12.value);
    if (isNaN(val12) || val12 < 0 || val12 > val11) {
      q12.closest('.field').classList.add('invalid');
      valid = false;
    }

    const val13 = toInt(q13.value);
    if (isNaN(val13) || val13 < 0) {
      q13.closest('.field').classList.add('invalid');
      valid = false;
    }

    const hired = checkedValue('q14_hired');
    if (!hired) {
      q14Pre.classList.add('invalid');
      valid = false;
    } else if (hired === 'yes' && !q14Select.value) {
      q14Select.closest('.field').classList.add('invalid');
      valid = false;
    }

    if (!checkedValue('q15')) {
      q15Field.classList.add('invalid');
      valid = false;
    }

    if (!checkedValue('q21')) {
      q21Field.classList.add('invalid');
      valid = false;
    }

    if (q22Checks.length !== 2) {
      q22Err.classList.add('show');
      valid = false;
    } else {
      q22Err.classList.remove('show');
    }

    return valid;
  }

  function validateStep6() {
    const allChecked = Array.from(document.querySelectorAll('input[id^="chk-doc-"]')).every(c => c.checked);
    const err = document.getElementById('final-error');
    if (!allChecked) {
      err.classList.add('show');
      return false;
    }
    err.classList.remove('show');
    return true;
  }

  function populateSummary() {
    document.getElementById('sum-name').textContent = document.getElementById('inp-fullname').value || '-';
    document.getElementById('sum-birth').textContent = document.getElementById('inp-birthdate').value || '-';
    document.getElementById('sum-phone').textContent = document.getElementById('inp-phone').value || '-';
    const curUser = MYUI.readJSON('currentUser') || {}; document.getElementById('sum-email').textContent = (curUser && curUser.email) || (document.getElementById('inp-email') ? document.getElementById('inp-email').value : '') || '-';
    document.getElementById('sum-city').textContent = document.getElementById('inp-city').value || '-';

    document.getElementById('sum-bizname').textContent = document.getElementById('inp-bizname').value || '-';
    const biztypeEl = document.querySelector('input[name="biz-type"]:checked');
    const bizTypes = { sahis: 'Şahıs İşletmesi', sirket: 'Şirket (Ltd. / A.Ş.)', kooperatif: 'Kadın Kooperatifi' };
    document.getElementById('sum-biztype').textContent = biztypeEl ? bizTypes[biztypeEl.value] : '-';
    document.getElementById('sum-taxno').textContent = document.getElementById('inp-taxno').value || '-';
    document.getElementById('sum-bizyear').textContent = document.getElementById('inp-bizyear').value || '-';
    document.getElementById('sum-address').textContent = document.getElementById('inp-address').value || '-';

    document.getElementById('sum-msa').textContent = uploadedFile ? uploadedFile.name : '-';
    document.getElementById('sum-emp-total').textContent = document.getElementById('inp-q11').value || '-';
    document.getElementById('sum-emp-female').textContent = document.getElementById('inp-q12').value || '-';
    document.getElementById('sum-emp-prev').textContent = document.getElementById('inp-q13').value || '-';

    const hired = checkedValue('q14_hired');
    let stay = '-';
    if (hired === 'no') stay = 'İşe başlayan olmadı';
    else if (hired === 'yes' && q14Select.value) stay = q14Select.options[q14Select.selectedIndex].text;
    document.getElementById('sum-emp-stay').textContent = stay;
  }

  // Sunucu alanları bayt sınırlıdır (son bayt NUL): Türkçe harfler 2 bayt tutar. Sınırı aşan giriş kabul edilmez,
  // böylece ekrandaki hiçbir değer sunucuda "çok uzun" diye reddedilmez.
  const BYTE_CAPS = { 'inp-fullname': 127, 'inp-phone': 31, 'inp-bizname': 127, 'inp-taxno': 31, 'inp-instagram': 63, 'inp-address': 255 };
  const utf8Len = (str) => new TextEncoder().encode(str).length;
  Object.keys(BYTE_CAPS).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (utf8Len(el.value) <= BYTE_CAPS[id]) return;
      const chars = Array.from(el.value);
      while (chars.length && utf8Len(chars.join('')) > BYTE_CAPS[id]) chars.pop();
      el.value = chars.join('');
    });
  });

  const validators = [null, validateStep1, validateStep2, validateStep3, validateStep4, validateStep5, validateStep6];

  stepItems.forEach(item => {
    const step = parseInt(item.getAttribute('data-step'), 10);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    const go = async () => {
      if (step === currentStep) return;
      await saveDraft().catch(() => {});
      currentStep = step;
      updateStepsUI();
    };
    item.addEventListener('click', go);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  // Çift tıklama: işleyici sürerken gelen tıklamalar yok sayılır (aksi halde iki submit gider / bir adım atlanır).
  let nextBusy = false;
  btnNext.addEventListener('click', async () => {
    if (nextBusy) return;
    nextBusy = true;
    try { await onNext(); } finally { nextBusy = false; }
  });

  async function onNext() {
    if (!validators[currentStep]()) return;

    if (currentStep === totalSteps) {
      // Adım çubuğundan atlanmış olabilir: göndermeden önce 1-5 yeniden doğrulanır.
      for (let s = 1; s < totalSteps; s++) {
        if (!validators[s]()) {
          currentStep = s;
          updateStepsUI();
          validators[s]();
          return;
        }
      }
    }

    await saveDraft().catch(() => {});

    if (currentStep === totalSteps) {
      const finalData = MYUI.readJSON(getDraftKey(), {});
      finalData.status = 'submitted';
      if (!finalData.submittedAt) finalData.submittedAt = new Date().toISOString();
      // Yerel (çevrimdışı) kayıt yalnızca API yokken yazılır: sunucu onaylamadan "gönderildi" ve sahte numara saklanmaz.
      const persistLocalSubmission = () => {
        if (!finalData.refNo) {
          finalData.refNo = 'MY-2026-' + Math.floor(10000 + Math.random() * 90000);
        }
        MYUI.writeJSON(getAppKey(), finalData);
      };
      try {
        finalData.sistemScore = MYScoring.systemScore({
          biztype: finalData.biztype,
          q11: toInt(finalData.q11),
          q12: toInt(finalData.q12),
          q13: toInt(finalData.q13),
          q14: finalData.q14,
          q15: finalData.q15,
          q21: finalData.q21,
          q22: finalData.q22
        }).total;
      } catch (err) {
        const finalErr = document.getElementById('final-error');
        if (finalErr) {
          finalErr.querySelector('span').textContent = 'Başvuru bilgilerinizde eksik veya hatalı bir alan var; lütfen önceki adımları kontrol ediniz.';
          finalErr.classList.add('show');
        }
        return;
      }
      if (window.MYAPI && typeof window.MYAPI.submitApplication === 'function') {
        btnNext.disabled = true;
        try {
          await saveDraft();
          const res = await window.MYAPI.submitApplication();
          const realRef = (res && res.application && res.application.ref) || (res && res.ref);
          if (realRef) finalData.refNo = realRef;
          finalData.status = (res && res.application && res.application.status) || 'submitted';
          MYUI.writeJSON(getAppKey(), finalData);
          try { localStorage.removeItem(getDraftKey()); } catch (e) {}
          try { sessionStorage.removeItem(stepKey); } catch (e) {}
          window.location.href = 'panel.html';
        } catch (err) {
          btnNext.disabled = false;
          if (err && err.isOfflineDemo) {
            // Offline demo mode: generate a local ref for display only
            if (!finalData.refNo) {
              finalData.refNo = 'MY-2026-' + Math.floor(10000 + Math.random() * 90000);
            }
            MYUI.writeJSON(getAppKey(), finalData);
            window.location.href = 'panel.html';
            return;
          }
          const finalErr = document.getElementById('final-error');
          if (finalErr) {
            const sp = finalErr.querySelector('span');
            if (sp) sp.textContent = (err && err.message) || 'Başvuru gönderilemedi. Lütfen eksik alanları kontrol ediniz.';
            finalErr.classList.add('show');
          }
        }
        return;
      }

      // Offline demo fallback
      if (!finalData.refNo) {
        finalData.refNo = 'MY-2026-' + Math.floor(10000 + Math.random() * 90000);
      }
      MYUI.writeJSON(getAppKey(), finalData);
      window.location.href = 'panel.html';
      return;
    }

    await saveDraft().catch((err) => {
      const finalErr = document.getElementById('final-error');
      if (finalErr) {
        finalErr.querySelector('span').textContent = 'Taslak kaydedilemedi: ' + (err.message || 'Lütfen bilgilerinizi kontrol ediniz.');
        finalErr.classList.add('show');
      }
    });

    currentStep++;
    updateStepsUI();
  }

  btnPrev.addEventListener('click', async () => {
    if (currentStep > 1) {
      try {
        await saveDraft();
      } catch (err) {
        // Going back must not depend on a save; the next forward step saves again.
      }
      currentStep--;
      updateStepsUI();
    }
  });

  function showFileError(msg) {
    if (fileErrorText) fileErrorText.textContent = msg;
    fileError.classList.add('show');
  }

  function handleFile(file) {
    if (!file) return;
    const okType = /\.(pdf|jpe?g|png)$/i.test(file.name) &&
      (!file.type || /^(application\/pdf|image\/jpeg|image\/png)$/.test(file.type));
    if (!okType) {
      fileInput.value = '';
      showFileError('Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.');
      return;
    }
    if (file.size === 0) {
      fileInput.value = '';
      showFileError('Dosya boş; lütfen geçerli bir dosya seçiniz.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      fileInput.value = '';
      showFileError('Dosya boyutu en fazla 10 MB olabilir.');
      return;
    }
    uploadedFile = file;
    fileName.textContent = file.name;
    filePreview.classList.add('active');
    dropzone.classList.add('hidden');
    fileError.classList.remove('show');

    if (window.MYAPI && typeof window.MYAPI.uploadCertificate === 'function') {
      window.MYAPI.uploadCertificate(file)
        .then((res) => {
          const cName = (res && res.application && res.application.fileName) || (res && res.fileName) || file.name;
          uploadedFile = { name: cName };
          fileName.textContent = cName;
          saveDraft();
        })
        .catch((err) => {
          if (!err || !err.isOfflineDemo) {
            // Sunucu kabul etmediyse dosya "seçili" kalmaz: yoksa kullanıcı sertifikasız ilerleyebilirdi.
            if (uploadedFile === file) {
              uploadedFile = null;
              fileInput.value = '';
              filePreview.classList.remove('active');
              dropzone.classList.remove('hidden');
            }
            showFileError((err && err.message) || 'Sertifika yüklenemedi.');
          }
        });
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  btnRemoveFile.addEventListener('click', () => {
    uploadedFile = null;
    fileInput.value = '';
    filePreview.classList.remove('active');
    dropzone.classList.remove('hidden');
  });

  hiredRadios.forEach(r => {
    r.addEventListener('change', () => {
      if (r.value === 'no') q14Select.value = '';
      syncQ14Detail();
    });
  });

  q22Inputs.forEach(chk => {
    chk.addEventListener('change', () => {
      const checkedCount = syncQ22UI();
      if (checkedCount !== 2) {
        q22Err.classList.add('show');
      } else {
        q22Err.classList.remove('show');
      }
    });
  });

  document.querySelectorAll('.summary-accordion button').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const item = hdr.parentElement;
      const open = item.classList.toggle('open');
      hdr.setAttribute('aria-expanded', String(open));
    });
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-close'));
      if (target) MYUI.closeModal(target);
    });
  });

  // Bir alan düzenlenir düzenlenmez kırmızı hatası kalkar (doğrulama yine "Devam Et"te çalışır); aksi halde düzeltilmiş alan kırmızı kalıyordu.
  document.querySelectorAll('.step-pane').forEach(pane => {
    const clearInvalid = (e) => {
      const field = e.target.closest ? e.target.closest('.field') : null;
      if (field) field.classList.remove('invalid');
    };
    pane.addEventListener('input', clearInvalid);
    pane.addEventListener('change', clearInvalid);
  });

  loadDraft();
  // Özet adımı her zaman "İleri" ile taze doldurulur; bu yüzden en fazla son adımdan bir öncekine dönülür.
  try {
    const saved = parseInt(sessionStorage.getItem(stepKey), 10);
    if (saved >= 1 && saved < totalSteps) currentStep = saved;
  } catch (e) {}
  updateStepsUI();
});

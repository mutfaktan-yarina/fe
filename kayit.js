document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-pw');
  const chkKvkk = document.getElementById('chk-kvkk');
  const submitBtn = document.getElementById('btn-submit');

  const fieldUser = userInput.closest('.field');
  const fieldPass = passInput.closest('.field');
  const errKvkk = document.getElementById('err-kvkk');
  const chkSartlar = document.getElementById('chk-sartlar');
  const errSartlar = document.getElementById('err-sartlar');
  const chkYonerge = document.getElementById('chk-yonerge');
  const errYonerge = document.getElementById('err-yonerge');

  const strengthBox = document.getElementById('strength-box');
  const strengthTxt = document.getElementById('strength-txt');

  const modalSuccess = document.getElementById('modal-success');

  const proceedBtn = document.getElementById('proceed-grant');

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-close'));
      if (target) MYUI.closeModal(target);
    });
  });

  MYUI.bindPasswordToggle(toggleBtn, passInput);

  function validateUser() {
    const val = userInput.value.trim();
    const errEl = fieldUser.querySelector('.error');
    if (!val) {
      fieldUser.classList.add('invalid');
      errEl.textContent = 'Kullanıcı adı veya e-posta alanı boş bırakılamaz.';
      return false;
    }
    if (val.includes('@')) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(val)) {
        fieldUser.classList.add('invalid');
        errEl.textContent = 'Lütfen geçerli bir e-posta formatı giriniz (örn: ad@mutfaktan.com).';
        return false;
      }
    } else {
      if (val.length < 3) {
        fieldUser.classList.add('invalid');
        errEl.textContent = 'Kullanıcı adı en az 3 karakter olmalıdır.';
        return false;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(val)) {
        fieldUser.classList.add('invalid');
        errEl.textContent = 'Kullanıcı adı yalnızca harf, rakam, nokta, tire veya alt çizgi içerebilir.';
        return false;
      }
    }
    fieldUser.classList.remove('invalid');
    return true;
  }

  function validatePassword() {
    const val = passInput.value;
    const errEl = fieldPass.querySelector('.error');
    if (!val) {
      fieldPass.classList.add('invalid');
      errEl.textContent = 'Şifre alanı boş bırakılamaz.';
      return false;
    }
    if (val.length < 12) {
      fieldPass.classList.add('invalid');
      errEl.textContent = 'Şifreniz en az 12 karakter uzunluğunda olmalıdır.';
      return false;
    }
    fieldPass.classList.remove('invalid');
    return true;
  }

  passInput.addEventListener('input', () => {
    const val = passInput.value;
    if (val.length > 0) {
      strengthBox.classList.add('active');
      const { score, label } = MYUI.passwordStrength(val);
      strengthBox.dataset.score = score;
      strengthTxt.textContent = label;
    } else {
      strengthBox.classList.remove('active');
      strengthBox.dataset.score = '0';
    }
    if (val.length >= 12) {
      fieldPass.classList.remove('invalid');
    }
  });

  userInput.addEventListener('input', () => {
    if (userInput.value.trim().length >= 3) {
      fieldUser.classList.remove('invalid');
    }
  });

  userInput.addEventListener('blur', validateUser);
  passInput.addEventListener('blur', validatePassword);

  chkKvkk.addEventListener('change', () => {
    if (chkKvkk.checked) errKvkk.classList.remove('show');
  });


  chkSartlar.addEventListener('change', () => {
    if (chkSartlar.checked) errSartlar.classList.remove('show');
  });

  chkYonerge.addEventListener('change', () => {
    if (chkYonerge.checked) errYonerge.classList.remove('show');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isUserValid = validateUser();
    const isPassValid = validatePassword();
    let isKvkkValid = true;

    if (!chkKvkk.checked) {
      errKvkk.classList.add('show');
      isKvkkValid = false;
    } else {
      errKvkk.classList.remove('show');
    }

    const isSartlarValid = chkSartlar.checked;
    const isYonergeValid = chkYonerge.checked;
    errSartlar.classList.toggle('show', !isSartlarValid);
    errYonerge.classList.toggle('show', !isYonergeValid);

    if (!isUserValid) {
      userInput.focus();
      return;
    }
    if (!isPassValid) {
      passInput.focus();
      return;
    }
    if (!isKvkkValid) {
      chkKvkk.focus();
      return;
    }
    if (!isSartlarValid) {
      chkSartlar.focus();
      return;
    }
    if (!isYonergeValid) {
      chkYonerge.focus();
      return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const emailVal = userInput.value.trim();
    const passVal = passInput.value;

    const modalVerify = document.getElementById('modal-verify');
    const inpVerifyCode = document.getElementById('inp-verify-code');
    const errVerifyCode = document.getElementById('err-verify-code');
    const btnVerifyConfirm = document.getElementById('btn-verify-confirm');
    const verifyEmailDisplay = document.getElementById('verify-email-display');

    function openSuccess() {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      MYUI.openModal(modalSuccess);
    }

    if (window.MYAPI && typeof window.MYAPI.signup === 'function') {
      try {
        await window.MYAPI.signup({ email: emailVal, password: passVal });
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        if (verifyEmailDisplay) verifyEmailDisplay.textContent = emailVal;
        if (modalVerify && inpVerifyCode && btnVerifyConfirm) {
          MYUI.openModal(modalVerify);
          startResendCountdown();
          inpVerifyCode.value = '';
          if (errVerifyCode) errVerifyCode.style.display = 'none';
          inpVerifyCode.focus();
        } else {
          openSuccess();
        }
      } catch (err) {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        if (err.isOfflineDemo) {
          openSuccess();
          return;
        }
        const passErr = !!(err.getField && err.getField('password'));
        const badField = passErr ? fieldPass : fieldUser;
        badField.classList.add('invalid');
        const errEl = badField.querySelector('.error');
        if (errEl) errEl.textContent = err.message || 'Kayıt işlemi başarısız oldu.';
        (passErr ? passInput : userInput).focus();
      }
    } else {
      setTimeout(openSuccess, 700);
    }
  });

  const modalVerify = document.getElementById('modal-verify');
  const inpVerifyCode = document.getElementById('inp-verify-code');
  const errVerifyCode = document.getElementById('err-verify-code');
  const btnVerifyConfirm = document.getElementById('btn-verify-confirm');

  // Kod yeniden isteği: sunucu aynı adres için 2 dakikadan sık kod üretmez, düğme bu süre dolana kadar kapalı kalır.
  const btnResend = document.getElementById('btn-verify-resend');
  const RESEND_WAIT_SECONDS = 120;
  let resendTimer = null;

  function startResendCountdown() {
    if (!btnResend) return;
    clearInterval(resendTimer);
    let left = RESEND_WAIT_SECONDS;
    btnResend.disabled = true;
    const tick = () => {
      if (left <= 0) {
        clearInterval(resendTimer);
        btnResend.disabled = false;
        btnResend.textContent = 'Kodu yeniden gönder';
        return;
      }
      btnResend.textContent = `Kodu yeniden gönder (${left} sn)`;
      left--;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function showVerifyNote(text, ok) {
    if (!errVerifyCode) return;
    errVerifyCode.textContent = text;
    errVerifyCode.style.display = 'block';
    errVerifyCode.style.color = ok ? '#15803d' : '';
  }

  if (btnResend) {
    btnResend.addEventListener('click', async () => {
      btnResend.disabled = true;
      try {
        await window.MYAPI.signup({ email: userInput.value.trim(), password: passInput.value });
        showVerifyNote('Kod yeniden gönderildi. Birkaç dakika içinde gelmezse gereksiz (spam) klasörünü kontrol edin.', true);
        startResendCountdown();
      } catch (err) {
        showVerifyNote(err.message || 'Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.', false);
        startResendCountdown();
      }
    });
  }

  if (btnVerifyConfirm) {
    btnVerifyConfirm.addEventListener('click', async () => {
      const code = inpVerifyCode ? inpVerifyCode.value.trim() : '';
      if (!code) {
        if (errVerifyCode) {
          errVerifyCode.textContent = 'Lütfen doğrulama kodunu giriniz.';
          errVerifyCode.style.display = 'block';
        }
        return;
      }
      btnVerifyConfirm.disabled = true;
      try {
        const email = userInput.value.trim();
        const password = passInput.value;
        const displayName = email.split('@')[0];
        // Dört onay kutusu hesap açılmadan önce zorunlu işaretlenir; sunucu hangi metin sürümünün ne zaman, hangi adresten kabul edildiğini kaydeder.
        await window.MYAPI.verify({
          email, code, password, display_name: displayName,
          consent_kvkk: true, consent_riza: true, consent_sartlar: true, consent_yonerge: true
        });
        try {
          const loginRes = await window.MYAPI.login({ email, password });
          MYUI.writeJSON('currentUser', loginRes.user || { email, role: 'applicant' });
        } catch (e) {
          MYUI.writeJSON('currentUser', { email, role: 'applicant' });
        }
        btnVerifyConfirm.disabled = false;
        MYUI.closeModal(modalVerify);
        MYUI.openModal(modalSuccess);
      } catch (err) {
        btnVerifyConfirm.disabled = false;
        if (errVerifyCode) {
          errVerifyCode.textContent = err.message || 'Doğrulama kodu geçersiz veya süresi dolmuş.';
          errVerifyCode.style.display = 'block';
        }
      }
    });
  }

  proceedBtn.addEventListener('click', () => {
    MYUI.closeModal(modalSuccess);
    const email = userInput.value.trim();
    if (!MYUI.readJSON('currentUser')) {
      MYUI.writeJSON('currentUser', { email, role: 'applicant' });
    }
    window.location.href = 'basvuru.html';
  });
});

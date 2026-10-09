document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email');
  const targetDesc = document.getElementById('target-account-desc');

  if (emailParam && targetDesc) {
    const strong = document.createElement('strong');
    strong.textContent = emailParam;
    targetDesc.textContent = ' hesabı için güçlü ve yeni bir şifre belirleyin.';
    targetDesc.insertBefore(strong, targetDesc.firstChild);
  }

  const form = document.getElementById('password-change-form');
  const inpCode = document.getElementById('inp-code');
  const fieldCode = document.getElementById('f-code');
  const inpNew = document.getElementById('inp-newpass');
  const inpConfirm = document.getElementById('inp-confirmpass');
  const fieldNew = document.getElementById('f-newpass');
  const fieldConfirm = document.getElementById('f-confirmpass');
  const errNew = document.getElementById('err-newpass');
  const errConfirm = document.getElementById('err-confirmpass');
  const strengthBar = document.getElementById('strength-bar');
  const strengthLabel = document.getElementById('strength-label');
  const successCard = document.getElementById('change-success-card');

  const prefilled = urlParams.get('code') || urlParams.get('token') || '';
  if (inpCode && prefilled) inpCode.value = prefilled;

  const errCode = document.getElementById('err-code');
  const formError = document.getElementById('form-error');
  const LINK_INVALID = 'Bağlantı geçersiz. Lütfen şifre sıfırlama işlemini baştan başlatınız.';
  // Adres çubuğunda e-posta yoksa daha ilk bakışta söyle; form doldurulduktan sonra değil.
  if (!emailParam && fieldCode) {
    fieldCode.classList.add('invalid');
    errCode.textContent = LINK_INVALID;
  }
  // Sunucu yalnız BÜYÜK harf+rakam kabul eder, mobil klavye ise küçük harfle başlar: boşluklar atılır, harfler büyütülür.
  const normalizeCode = (v) => v.replace(/\s+/g, '').toUpperCase();
  // Sunucu 5. yanlış denemede kodu yakar; bundan sonra aynı kod doğru olsa da geçmez ve yeni kod ~2 dk sonra istenebilir.
  const MAX_TRIES = 5;
  const triesKey = 'my_reset_tries:' + (emailParam || '');
  const readTries = () => { try { return +sessionStorage.getItem(triesKey) || 0; } catch (_) { return 0; } };
  const writeTries = (n) => { try { sessionStorage.setItem(triesKey, String(n)); } catch (_) { /* depolama kapalı */ } };
  const BURNT = 'Çok fazla yanlış deneme: bu kod artık geçersiz. Yaklaşık 2 dakika sonra şifre sıfırlamayı baştan başlatıp yeni kod isteyin.';
  function showFormError(msg) {
    if (!formError) return;
    formError.textContent = msg || '';
    formError.classList.toggle('show', !!msg);
  }

  const toggleNew = document.getElementById('toggle-newpass');
  const toggleConfirm = document.getElementById('toggle-confirmpass');

  MYUI.bindPasswordToggle(toggleNew, inpNew);
  MYUI.bindPasswordToggle(toggleConfirm, inpConfirm);

  function checkStrength(pass) {
    if (!strengthBar || !strengthLabel) return;
    strengthBar.classList.remove('weak', 'medium', 'strong');

    if (pass.length === 0) {
      strengthLabel.textContent = 'Belirtilmedi';
      return;
    }

    const { score, label } = MYUI.passwordStrength(pass);
    strengthBar.classList.add(score <= 1 ? 'weak' : score <= 2 ? 'medium' : 'strong');
    strengthLabel.textContent = label;
  }

  if (inpNew) {
    inpNew.addEventListener('input', () => {
      checkStrength(inpNew.value);
      if (fieldNew.classList.contains('invalid') && inpNew.value.length >= 12) {
        fieldNew.classList.remove('invalid');
      }
    });
  }

  if (inpConfirm) {
    inpConfirm.addEventListener('input', () => {
      if (fieldConfirm.classList.contains('invalid') && inpConfirm.value === inpNew.value) {
        fieldConfirm.classList.remove('invalid');
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      let isValid = true;
      fieldNew.classList.remove('invalid');
      fieldConfirm.classList.remove('invalid');
      fieldCode.classList.remove('invalid');
      showFormError('');

      const codeVal = normalizeCode(inpCode.value);
      if (!codeVal) {
        fieldCode.classList.add('invalid');
        errCode.textContent = 'Lütfen e-postanıza gelen kodu giriniz.';
        isValid = false;
      }
      if (!emailParam) {
        fieldCode.classList.add('invalid');
        errCode.textContent = LINK_INVALID;
        isValid = false;
      }

      const p1 = inpNew.value;
      const p2 = inpConfirm.value;

      if (p1.length < 12) {
        fieldNew.classList.add('invalid');
        errNew.textContent = 'Şifreniz en az 12 karakter uzunluğunda olmalıdır.';
        isValid = false;
      }

      if (p1 !== p2) {
        fieldConfirm.classList.add('invalid');
        errConfirm.textContent = 'Şifreler birbiriyle eşleşmiyor.';
        isValid = false;
      }

      if (!isValid) return;

      const btn = document.getElementById('btn-submit-change');
      if (btn) btn.disabled = true;
      try {
        await MYAPI.resetPassword({ email: emailParam, code: codeVal, password: p1 });
        writeTries(0);
        form.classList.add('hidden');
        if (successCard) successCard.classList.add('active');
      } catch (err) {
        if (btn) btn.disabled = false;
        const msg = err.message || 'Şifre yenileme işlemi başarısız oldu.';
        const pwMsg = err.getField && err.getField('password');
        // Hata, ait olduğu alanın yanında gösterilir: şifre politikası -> şifre alanı, kod -> kod alanı;
        // sıklık sınırı, sunucu ya da ağ hatası hiçbir alana ait değildir -> form düzeyinde.
        if (pwMsg) {
          fieldNew.classList.add('invalid');
          errNew.textContent = pwMsg;
        } else if (err.status === 400 || (err.getField && err.getField('code'))) {
          const tries = readTries() + 1;
          writeTries(tries);
          fieldCode.classList.add('invalid');
          errCode.textContent = tries >= MAX_TRIES ? BURNT : msg;
        } else {
          showFormError(msg);
        }
      }
    });
  }
});

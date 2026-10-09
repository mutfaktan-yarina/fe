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
      if (fieldNew.classList.contains('invalid') && inpNew.value.length >= 8) {
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

      const codeVal = inpCode.value.trim();
      if (!codeVal) {
        fieldCode.classList.add('invalid');
        isValid = false;
      }
      if (!emailParam) {
        fieldCode.classList.add('invalid');
        document.getElementById('err-code').textContent = 'Bağlantı geçersiz. Lütfen şifre sıfırlama işlemini baştan başlatınız.';
        isValid = false;
      }

      const p1 = inpNew.value;
      const p2 = inpConfirm.value;

      if (p1.length < 8) {
        fieldNew.classList.add('invalid');
        errNew.textContent = 'Şifreniz en az 8 karakter uzunluğunda olmalıdır.';
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
        form.classList.add('hidden');
        if (successCard) successCard.classList.add('active');
      } catch (err) {
        if (btn) btn.disabled = false;
        const msg = err.message || 'Şifre yenileme işlemi başarısız oldu.';
        if (err.getField && (err.getField('code') || err.status === 400)) {
          fieldCode.classList.add('invalid');
          document.getElementById('err-code').textContent = msg;
        } else {
          fieldNew.classList.add('invalid');
          errNew.textContent = msg;
        }
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reset-request-form');
  const inpEmail = document.getElementById('inp-email');
  const fieldEmail = document.getElementById('f-email');
  const successCard = document.getElementById('success-card');
  const sentDisplay = document.getElementById('sent-email-display');
  const simLink = document.getElementById('btn-open-change-link');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailVal = inpEmail.value.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      fieldEmail.classList.remove('invalid');

      if (!emailPattern.test(emailVal)) {
        fieldEmail.classList.add('invalid');
        inpEmail.focus();
        return;
      }

      function showSuccess() {
        if (sentDisplay) {
          sentDisplay.textContent = emailVal;
        }
        if (simLink) {
          simLink.href = `sifre-yenile.html?email=${encodeURIComponent(emailVal)}`;
        }
        form.classList.add('hidden');
        if (successCard) {
          successCard.classList.add('active');
        }
        startResendCountdown();
      }

      // Sunucu hata verdiyse (çok sık istek, e-posta servisi yoğun) gerçek nedeni göster; adres hatası sanılmasın.
      function showRequestError(err) {
        fieldEmail.classList.add('invalid');
        const errEl = document.getElementById('err-email');
        if (errEl) {
          errEl.textContent = err && err.status === 400
            ? 'Lütfen geçerli bir e-posta adresi giriniz.'
            : ((err && err.message) || 'İstek gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
        }
        inpEmail.focus();
      }

      try {
        await window.MYAPI.forgotPassword({ email: emailVal });
        showSuccess();
      } catch (err) {
        showRequestError(err);
      }
    });
  }

  // Kod yeniden isteği: sunucu aynı adres için 2 dakikadan sık kod üretmez, düğme bu süre dolana kadar kapalı kalır.
  const btnResend = document.getElementById('btn-resend-code');
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

  if (btnResend) {
    btnResend.addEventListener('click', async () => {
      btnResend.disabled = true;
      try {
        await window.MYAPI.forgotPassword({ email: inpEmail.value.trim() });
        btnResend.textContent = 'Kod yeniden gönderildi';
      } catch (err) {
        btnResend.textContent = (err && err.message) || 'Gönderilemedi';
      }
      setTimeout(startResendCountdown, 1500);
    });
  }
});

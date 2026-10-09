document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const successState = document.getElementById('contact-success');
  const btnNewMessage = document.getElementById('btn-new-message');

  const inpName = document.getElementById('inp-cname');
  const inpEmail = document.getElementById('inp-cemail');
  const inpPhone = document.getElementById('inp-cphone');
  const selTopic = document.getElementById('sel-topic');
  const txtMessage = document.getElementById('txt-message');

  const fieldName = document.getElementById('f-name');
  const fieldEmail = document.getElementById('f-email');
  const fieldPhone = document.getElementById('f-phone');
  const fieldTopic = document.getElementById('f-topic');
  const fieldMessage = document.getElementById('f-message');

  function validate() {
    let isValid = true;

    fieldName.classList.remove('invalid');
    fieldEmail.classList.remove('invalid');
    fieldPhone.classList.remove('invalid');
    fieldTopic.classList.remove('invalid');
    fieldMessage.classList.remove('invalid');

    if (!inpName.value.trim()) {
      fieldName.classList.add('invalid');
      isValid = false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(inpEmail.value.trim())) {
      fieldEmail.classList.add('invalid');
      isValid = false;
    }

    const phoneVal = inpPhone.value.trim().replace(/\D/g, '');
    if (phoneVal.length < 10) {
      fieldPhone.classList.add('invalid');
      isValid = false;
    }

    if (!selTopic.value) {
      fieldTopic.classList.add('invalid');
      isValid = false;
    }

    if (txtMessage.value.trim().length < 10) {
      fieldMessage.classList.add('invalid');
      isValid = false;
    }

    return isValid;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validate()) return;

      const btnSubmit = form.querySelector('button[type="submit"]');
      if (btnSubmit) {
        btnSubmit.classList.add('loading');
        btnSubmit.disabled = true;
      }

      function showSuccess() {
        if (btnSubmit) {
          btnSubmit.classList.remove('loading');
          btnSubmit.disabled = false;
        }
        form.reset();
        form.classList.add('hidden');
        if (successState) successState.classList.add('active');
      }

      function showError(msg) {
        if (btnSubmit) {
          btnSubmit.classList.remove('loading');
          btnSubmit.disabled = false;
        }
        fieldMessage.classList.add('invalid');
        const errEl = fieldMessage.querySelector('.error');
        if (errEl) errEl.textContent = msg || 'Mesaj iletilemedi. Lütfen daha sonra tekrar deneyiniz.';
      }

      if (window.MYAPI && typeof window.MYAPI.sendContact === 'function') {
        const topicText = (selTopic.options && selTopic.options[selTopic.selectedIndex]) ? selTopic.options[selTopic.selectedIndex].text : selTopic.value;
        const payload = {
          name: inpName.value.trim(),
          email: inpEmail.value.trim(),
          phone: inpPhone.value.trim(),
          subject: topicText || 'İletişim Talebi',
          message: txtMessage.value.trim()
        };

        try {
          await window.MYAPI.sendContact(payload);
          showSuccess();
        } catch (err) {
          if (err.isOfflineDemo) {
            showSuccess();
            return;
          }
          showError(err.message);
        }
      } else {
        showSuccess();
      }
    });
  }

  if (btnNewMessage) {
    btnNewMessage.addEventListener('click', () => {
      if (form) form.classList.remove('hidden');
      if (successState) successState.classList.remove('active');
      if (inpName) inpName.focus();
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  // Ret bildirimi editörün işidir: her editör ve yönetici tüm bekleyen retleri görür ve bildirir (editörler arası gruplama yok).
  const currentUser = MYUI.readJSON("currentUser");
  if (!currentUser || (currentUser.role !== "editor" && currentUser.role !== "admin")) {
    window.location.replace("giris.html");
    return;
  }

  function note(el, text, ok) {
    el.textContent = text;
    el.dataset.state = ok ? "ok" : "error";
    el.hidden = !text;
  }

  function formatTime(seconds) {
    return new Date(seconds * 1000).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
  }

  // ---- Ret bildirimleri (S6): bekleyen retler + toplu ilan ----
  const rejCount = document.getElementById("rejCount");
  const rejBody = document.getElementById("rejTableBody");
  const btnAnnounce = document.getElementById("btnAnnounce");
  const rejConfirm = document.getElementById("rejConfirm");
  const rejFeedback = document.getElementById("rejFeedback");
  let pendingCount = 0;
  let mailCount = 0;

  async function loadPendingRejections() {
    if (!rejBody || !window.MYAPI || !MYAPI.getPendingRejections) return;
    let res;
    try {
      res = await MYAPI.getPendingRejections();
    } catch (e) {
      rejCount.textContent = (e && e.message) || "Bekleyen retler okunamadı.";
      return;
    }
    pendingCount = res.count || 0;
    mailCount = res.mailCount || 0;
    const retry = res.mailRetry || 0;
    rejCount.textContent = (pendingCount ? `${pendingCount} başvurunun reddi adaya henüz bildirilmedi.` : "Bildirilmeyi bekleyen ret yok.") +
      (retry ? ` Daha önce gönderilemeyen ${retry} e-posta yeniden denenecek.` : "");
    rejBody.replaceChildren(...(res.items || []).map(it => {
      const tr = document.createElement("tr");
      [it.ref, it.name, formatTime(it.rejectedAt)].forEach(t => {
        const td = document.createElement("td");
        td.textContent = t;
        tr.appendChild(td);
      });
      return tr;
    }));
    btnAnnounce.disabled = pendingCount === 0 && mailCount === 0;
  }

  if (btnAnnounce) {
    btnAnnounce.addEventListener("click", () => {
      rejConfirm.querySelector("span").textContent = `${mailCount} kişiye “başvurunuz bir sonraki aşamaya geçmeye hak kazanamamıştır” e-postası gönderilecek. Onaylıyor musunuz?`;
      rejConfirm.hidden = false;
      btnAnnounce.disabled = true;
      document.getElementById("btnAnnounceYes").focus();
    });
    document.getElementById("btnAnnounceNo").addEventListener("click", () => {
      rejConfirm.hidden = true;
      btnAnnounce.disabled = pendingCount === 0 && mailCount === 0;
    });
    document.getElementById("btnAnnounceYes").addEventListener("click", async () => {
      rejConfirm.hidden = true;
      try {
        const res = await MYAPI.announceRejections(pendingCount);
        note(rejFeedback, `${res.announced} ret bildirildi, ${res.mailed} e-posta gönderildi` +
          (res.failed ? `, ${res.failed} e-posta gönderilemedi (bir sonraki gönderimde yeniden denenir).` : "."), !res.failed);
      } catch (e) {
        note(rejFeedback, e && e.status === 409 ? "Bekleyen ret sayısı değişti; liste yenilendi, yeniden onaylayınız."
          : (e && e.message) || "Bildirimler gönderilemedi.", false);
      }
      await loadPendingRejections();
    });
    loadPendingRejections();
  }

});

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

  // ---- Ön değerlendirme hatırlatma / süre uzatma ----
  const GROUP_LABELS = {
    docs: "Belge bekleniyor",
    open: "Form açık, gönderilmemiş",
    reopen: "Gönderilmiş → yeniden açılacak",
    scored: "Puanlanmış — gönderilmez",
    notified: "Bu son tarih için bildirildi — gönderilmez"
  };
  const pnWindow = document.getElementById("pnWindow");
  const pnAuto = document.getElementById("pnAuto");
  const pnBody = document.getElementById("pnTableBody");
  const btnPreevalSend = document.getElementById("btnPreevalSend");
  const pnConfirm = document.getElementById("pnConfirm");
  const pnFeedback = document.getElementById("pnFeedback");
  const pnUndBody = document.getElementById("pnUndeliveredBody");
  const pnUndCard = document.getElementById("pnUndeliveredCard");
  const pnUndEmpty = document.getElementById("pnUndeliveredEmpty");
  let notice = null; // son önizleme; gönderimde token buradan alınır

  // Sunucu zamanı saniye (sayı) ya da ISO metni olabilir.
  function formatAny(v) {
    if (typeof v === "number") return formatTime(v);
    const d = new Date(v);
    return isNaN(d) ? String(v || "") : d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
  }

  function renderNotice(n) {
    notice = n;
    pnWindow.textContent = `Son tarih: ${formatAny(n.close)}. ` + (n.windowOpen ? "Ön değerlendirme penceresi açık." : "Ön değerlendirme penceresi kapalı; hatırlatma gönderilemez.");
    const auto = n.autoSubmitted || {};
    // Tarih yazılmaz: autoSubmitted.at bugünkü (uzatılmış olabilecek) son tarihtir, gönderim anı değildir.
    pnAuto.textContent = auto.count ? `${auto.count} taslak süre dolunca otomatik gönderildi.` : "Otomatik gönderilen taslak yok.";
    pnBody.replaceChildren(...(n.groups || []).map(g => {
      const tr = document.createElement("tr");
      [GROUP_LABELS[g.key] || g.key, String(g.count), g.subject || "—"].forEach(t => {
        const td = document.createElement("td");
        td.textContent = t;
        tr.appendChild(td);
      });
      return tr;
    }));
    const und = n.undelivered || [];
    pnUndBody.replaceChildren(...und.map(u => {
      const tr = document.createElement("tr");
      [u.ref, u.name, u.phone, u.email, formatAny(u.at), u.subject].forEach(t => {
        const td = document.createElement("td");
        td.textContent = t || "";
        tr.appendChild(td);
      });
      return tr;
    }));
    pnUndCard.hidden = !und.length;
    pnUndEmpty.hidden = und.length > 0;
    btnPreevalSend.disabled = !n.canSend;
  }

  async function loadNotices() {
    if (!pnBody || !window.MYAPI || !MYAPI.getPreevalNotices) return;
    try {
      renderNotice(await MYAPI.getPreevalNotices());
    } catch (e) {
      pnWindow.textContent = (e && e.message) || "Hatırlatma durumu okunamadı.";
    }
  }

  function groupCount(n, key) {
    const g = (n.groups || []).find(x => x.key === key);
    return g ? g.count : 0;
  }

  function confirmText(n) {
    return `${n.toSend} kişiye e-posta gönderilecek (belge bekleniyor ${groupCount(n, "docs")}, form açık ${groupCount(n, "open")}, ` +
      `yeniden açılacak ${groupCount(n, "reopen")}). Yeniden açılacak adayların formu tekrar düzenlenebilir olur. Onaylıyor musunuz?`;
  }

  if (btnPreevalSend) {
    btnPreevalSend.addEventListener("click", () => {
      pnConfirm.querySelector("span").textContent = confirmText(notice);
      pnConfirm.hidden = false;
      btnPreevalSend.disabled = true;
      document.getElementById("btnPreevalYes").focus();
    });
    document.getElementById("btnPreevalNo").addEventListener("click", () => {
      pnConfirm.hidden = true;
      btnPreevalSend.disabled = !(notice && notice.canSend);
      btnPreevalSend.focus();
    });
    document.getElementById("btnPreevalYes").addEventListener("click", async () => {
      pnConfirm.hidden = true;
      let res = null;
      try {
        res = await MYAPI.sendPreevalNotices(notice.token);
      } catch (e) {
        if (e && e.status === 409 && e.data && e.data.groups) {
          // Liste değişti: gelen güncel önizleme gösterilir, yeniden onay istenir.
          renderNotice(e.data);
          note(pnFeedback, `Liste değişti, yeniden onaylayınız. Güncel durum: ${e.data.toSend} kişiye gönderilecek.`, false);
          btnPreevalSend.focus();
          return;
        }
        // 503: uygulamanın kendi (Türkçeleştirilmiş) metni varsa o; yoksa (ağ geçidi vb.) genel metin.
        const appText = e && e.data && Array.isArray(e.data.errors) && e.data.errors.length ? e.message : "";
        note(pnFeedback, e && e.status === 503 ? (appText || "Şu anda gönderilemiyor, biraz sonra yeniden deneyiniz.")
          : (e && e.message) || "Hatırlatmalar gönderilemedi.", false);
        await loadNotices();
        return;
      }
      note(pnFeedback, `Gönderilen ${res.sent}, başarısız ${res.failed}, atlanan ${res.skipped}, yeniden açılan ${res.reopened}; kalan ${res.remaining}` +
        (res.remaining > 0 ? ". Kalanlar için “Hatırlatmaları Gönder” düğmesine yeniden basınız." : "."), !res.failed && !res.skipped);
      await loadNotices();
      // Kalan varken düğme açık kalır.
      if (res.remaining > 0 && notice) btnPreevalSend.disabled = false;
    });
    loadNotices();
  }

});

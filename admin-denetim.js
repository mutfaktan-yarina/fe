document.addEventListener("DOMContentLoaded", () => {
  const currentUser = MYUI.readJSON("currentUser");
  if (!currentUser || currentUser.role !== "admin") {
    window.location.replace("giris.html");
    return;
  }

  const ACTION_LABELS = {
    file_view: "Belge görüntüleme",
    preeval_open: "Ön değerlendirme açıldı",
    reject: "Başvuru elendi",
    evaluation: "Puanlama kaydedildi",
    user_block: "Hesap engellendi",
    user_unblock: "Hesap engeli kaldırıldı",
    user_role: "Rol değiştirildi",
    user_password_reset: "Geçici şifre verildi",
    invite_create: "Editör daveti gönderildi",
    invite_cancel: "Davet iptal edildi",
    invite_resend: "Davet yeniden gönderildi",
    calendar_update: "Takvim güncellendi",
    backup_run: "Yedek alındı",
    backup_download: "Yedek indirildi",
    export_applications: "Başvurular dışa aktarıldı",
    export_users: "Kullanıcılar dışa aktarıldı",
    mail_failed: "E-posta gönderilemedi"
  };
  const PAGE_SIZE = 50;

  const form = document.getElementById("auditFilterForm");
  const actionSelect = document.getElementById("auditAction");
  const errorEl = document.getElementById("auditError");
  const tbody = document.getElementById("auditTableBody");
  const prevBtn = document.getElementById("auditPrev");
  const nextBtn = document.getElementById("auditNext");
  const pageInfo = document.getElementById("auditPageInfo");
  Object.keys(ACTION_LABELS).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = ACTION_LABELS[key];
    actionSelect.appendChild(opt);
  });

  let page = 1;
  let total = 0;

  function formatTime(seconds) {
    return new Date(seconds * 1000).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "medium" });
  }

  function messageRow(text) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = text;
    tr.appendChild(td);
    tbody.replaceChildren(tr);
  }

  function render(entries) {
    if (entries.length === 0) {
      messageRow("Kriterlere uygun kayıt bulunamadı.");
      return;
    }
    const rows = entries.map(entry => {
      const tr = document.createElement("tr");
      [formatTime(entry.at), entry.actor, ACTION_LABELS[entry.action] || entry.action, entry.target || "—", entry.detail || "—", entry.ip || "—"]
        .forEach(text => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        });
      return tr;
    });
    tbody.replaceChildren(...rows);
  }

  function updatePager() {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pageInfo.textContent = `Sayfa ${page} / ${pages} · ${total} kayıt`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
  }

  async function load() {
    errorEl.hidden = true;
    messageRow("Yükleniyor...");
    const data = new FormData(form);
    try {
      const res = await MYAPI.getAudit({
        action: data.get("action"),
        ref: data.get("ref").trim(),
        from: data.get("from"),
        to: data.get("to"),
        page,
        limit: PAGE_SIZE
      });
      total = res.total;
      render(res.entries);
    } catch (err) {
      total = 0;
      messageRow("Kayıtlar yüklenemedi.");
      errorEl.textContent = err.message || "Kayıtlar yüklenemedi.";
      errorEl.hidden = false;
    }
    updatePager();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    page = 1;
    load();
  });
  prevBtn.addEventListener("click", () => { page--; load(); });
  nextBtn.addEventListener("click", () => { page++; load(); });

  load();
});

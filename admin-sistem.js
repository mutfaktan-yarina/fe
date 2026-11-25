document.addEventListener("DOMContentLoaded", () => {
  const currentUser = MYUI.readJSON("currentUser");
  if (!currentUser || currentUser.role !== "admin") {
    window.location.replace("giris.html");
    return;
  }

  const STATE_LABELS = { before: "Henüz başlamadı", open: "Açık", closed: "Kapandı" };

  function note(el, text, ok) {
    el.textContent = text;
    el.dataset.state = ok ? "ok" : "error";
    el.hidden = !text;
  }

  function formatTime(seconds) {
    return new Date(seconds * 1000).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
  }

  // Kutucuk için kısa biçim ("6 Eki 08:48"): uzun tarih dar kutuda sayının ortasından bölünüyordu.
  function formatShort(seconds) {
    return new Date(seconds * 1000).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
  }

  // ---- Takvim ----
  const calForm = document.getElementById("calendarForm");
  const calState = document.getElementById("calState");
  const calFeedback = document.getElementById("calFeedback");
  const calFreeze = document.getElementById("calFreeze");
  const calFreezeNote = document.getElementById("calFreezeNote");
  const CAL_FIELDS = ["apply_open", "apply_close", "preeval_open", "preeval_close", "eval_open", "eval_close"];

  // "2026-11-20T23:59:59+03:00" -> "2026-11-20T23:59" (gizli alanın değeri)
  function toInputValue(iso) { return iso.slice(0, 16); }

  // Tarih ve saat tarayıcı dilinden bağımsız: her zaman GG.AA.YYYY ve 24 saat SS:DD. Her gizli alanın önüne iki metin
  // kutusu konur; gizli alan (name ile gönderilen değer) bu ikisinden kurulur, dışarıdan yazılırsa ikisine dağıtılır.
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const TIME_MSG = "Saati 24 saat biçiminde SS:DD olarak giriniz (ör. 16:30).";
  const DATE_MSG = "Tarihi GG.AA.YYYY biçiminde giriniz (ör. 02.12.2026).";
  // "02.12.2026" -> "2026-12-02"; geçersiz ya da takvimde olmayan gün (31.02) -> ""
  function dateToIso(text) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
    if (!m) return "";
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCFullYear() === +m[3] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1] ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
  const isoToDate = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
  CAL_FIELDS.forEach(name => {
    const hidden = calForm.elements[name];
    const label = calForm.querySelector(`label[for="${hidden.id}"]`);
    const date = document.createElement("input");
    date.type = "text";
    date.id = hidden.id + "Date";
    date.inputMode = "numeric";
    date.maxLength = 10;
    date.placeholder = "GG.AA.YYYY";
    date.autocomplete = "off";
    date.required = true;
    date.dataset.part = "date";
    const time = document.createElement("input");
    time.type = "text";
    time.id = hidden.id + "Time";
    time.inputMode = "numeric";
    time.maxLength = 5;
    time.placeholder = "SS:DD";
    time.autocomplete = "off";
    time.required = true;
    time.dataset.part = "time";
    time.setAttribute("aria-label", (label ? label.textContent : name) + " saati (24 saat, SS:DD)");
    date.setAttribute("aria-label", (label ? label.textContent : name) + " tarihi (GG.AA.YYYY)");
    if (label) label.htmlFor = date.id;
    const row = document.createElement("span");
    row.append(date, time);
    hidden.before(row);
    const compose = () => {
      const iso = dateToIso(date.value);
      date.setCustomValidity(date.value === "" || iso ? "" : DATE_MSG);
      time.setCustomValidity(time.value === "" || TIME_RE.test(time.value) ? "" : TIME_MSG);
      if (iso && TIME_RE.test(time.value)) hidden.value = `${iso}T${time.value}`;
    };
    date.addEventListener("input", compose);
    time.addEventListener("input", compose);
    // "2.12.2026" ya da "2/12/2026" yazılırsa "02.12.2026" yapılır
    date.addEventListener("blur", () => {
      const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(date.value.trim());
      if (m) { date.value = `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`; compose(); }
    });
    // "9:30" ya da "9.30" yazılırsa "09:30" yapılır
    time.addEventListener("blur", () => {
      const m = /^(\d{1,2})[:.](\d{2})$/.exec(time.value.trim());
      if (m) { time.value = m[1].padStart(2, "0") + ":" + m[2]; compose(); }
    });
    hidden.addEventListener("input", () => {
      date.value = isoToDate(hidden.value.slice(0, 10));
      time.value = hidden.value.slice(11, 16);
      date.setCustomValidity("");
      time.setCustomValidity("");
    });
  });
  function setCalField(name, value) {
    const hidden = calForm.elements[name];
    hidden.value = value;
    hidden.dispatchEvent(new Event("input"));
  }
  // gizli alanın değeri -> API: bitiş alanları günün son saniyesine, diğerleri :00'a oturur
  function toApiValue(name, value) { return `${value}:${name.endsWith("_close") ? "59" : "00"}+03:00`; }

  function showCalendar(cal) {
    CAL_FIELDS.forEach(name => setCalField(name, toInputValue(cal[name])));
    const left = cal.apply_seconds_left;
    const extra = cal.apply_state === "open" ? ` (kalan ${Math.ceil(left / 86400)} gün)` : "";
    calFreeze.checked = !!cal.frozen;
    calFreezeNote.hidden = !cal.frozen;
    calState.textContent = `Başvuru: ${STATE_LABELS[cal.apply_state]}${extra} · Ön değerlendirme: ${STATE_LABELS[cal.preeval_state]} · Değerlendirme: ${STATE_LABELS[cal.eval_state]}`;
  }

  async function saveCalendar(values) {
    const payload = {};
    CAL_FIELDS.forEach(name => { payload[name] = toApiValue(name, values[name]); });
    try {
      const saved = await MYAPI.setCalendar(payload);
      showCalendar(saved);
      // Sunucu uyarısı kaydı engellemez; kaydın başarılı olduğu mesajın yanında gösterilir.
      const late = saved && Array.isArray(saved.warnings) && saved.warnings.includes("preeval_close_after_eval_open");
      note(calFeedback, "Takvim kaydedildi ve hemen geçerli oldu." + (late ? " Uyarı: Ön değerlendirme bitişi değerlendirme başlangıcından sonra." : ""), !late);
    } catch (err) {
      note(calFeedback, err.message || "Takvim kaydedilemedi.", false);
    }
  }

  // Çelişkili sıra engellenmez (bilinçli olabilir) ama kaydetmeden önce açıkça sorulur.
  function calendarWarnings(v) {
    const warnings = [];
    if (v.preeval_open < v.apply_close) warnings.push("Ön değerlendirme, başvurular kapanmadan başlıyor.");
    if (v.eval_open < v.preeval_close) warnings.push("Değerlendirme, ön değerlendirme bitmeden başlıyor.");
    return warnings;
  }

  calForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {};
    CAL_FIELDS.forEach(name => { values[name] = calForm.elements[name].value; });
    const warnings = calendarWarnings(values);
    if (warnings.length && !await MYUI.confirmDialog({ title: "Takvim uyarıları", text: `${warnings.join("\n")}\n\nYine de kaydedilsin mi?`, ok: "Yine de Kaydet" })) return;
    saveCalendar(values);
  });

  calFreeze.addEventListener("change", async () => {
    const on = calFreeze.checked;
    try {
      showCalendar(await MYAPI.setCalendar({ freeze: on }));
      note(calFeedback, on ? "Tarih denetimi donduruldu." : "Tarih denetimi yeniden açıldı.", true);
    } catch (err) {
      calFreeze.checked = !on;
      note(calFeedback, err.message || "Ayar kaydedilemedi.", false);
    }
  });

  async function loadCalendar() {
    try {
      showCalendar(await MYAPI.getCalendar());
    } catch (err) {
      note(calFeedback, err.message || "Takvim yüklenemedi.", false);
    }
  }

  // ---- Sistem durumu ve yedekler ----
  const sysStats = document.getElementById("sysStats");
  const sysError = document.getElementById("sysError");
  const backupBody = document.getElementById("backupTableBody");
  const backupFeedback = document.getElementById("backupFeedback");

  function statCard(label, value, hint) {
    const box = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    const small = document.createElement("small");
    small.textContent = hint;
    box.append(span, strong, small);
    return box;
  }

  function renderBackups(files) {
    if (files.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "Henüz yedek yok.";
      tr.appendChild(td);
      backupBody.replaceChildren(tr);
      return;
    }
    backupBody.replaceChildren(...files.map(file => {
      const tr = document.createElement("tr");
      [file.name, file.full ? "Tam (belgelerle)" : "Veriler", formatTime(file.at), formatBytes(file.size), file.verified ? "Evet" : "Hayır"]
        .forEach(text => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        });
      const action = document.createElement("td");
      const link = document.createElement("a");
      link.href = MYAPI.backupDownloadUrl(file.name);
      link.rel = "noopener";
      link.textContent = "İndir";
      action.appendChild(link);
      tr.appendChild(action);
      return tr;
    }));
  }

  const mailSection = document.getElementById("mailSection");
  const mailFailBody = document.getElementById("mailFailBody");

  function renderMailFailures(failures) {
    mailSection.hidden = failures.length === 0;
    mailFailBody.replaceChildren(...failures.map(f => {
      const tr = document.createElement("tr");
      [formatTime(f.at), f.to, f.subject, f.excerpt || "—"].forEach(text => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      return tr;
    }));
  }

  async function loadSystem() {
    try {
      const s = await MYAPI.getSystem();
      sysError.hidden = true;
      renderMailFailures(s.mail.recentFailures || []);
      const last = s.backup.files[0];
      const mail = s.mail;
      sysStats.replaceChildren(
        statCard("Kullanıcı", s.counts.users, "Tüm roller"),
        statCard("Başvuru", s.counts.applications, "Taslaklar dahil"),
        statCard("Yüklü Belge", s.counts.files, "Sertifika ve doğrulama"),
        statCard("Denetim Kaydı", s.counts.auditEntries, "Silinemez"),
        statCard("Boş Disk", formatBytes(s.storage.diskFreeBytes), `Toplam ${formatBytes(s.storage.diskTotalBytes)}`),
        statCard("Veri Boyutu", formatBytes(s.storage.dataBytes), "Kayıtlar ve belgeler"),
        statCard("Yedek Boyutu", formatBytes(s.backup.bytes), `${s.backup.count} yedek`),
        statCard("Son Yedek", last ? formatShort(last.at) : "Yok", s.backup.intervalMinutes ? `Her ${s.backup.intervalMinutes} dakikada bir` : "Otomatik yedek kapalı"),
        statCard("E-posta", mail.queue ? `${mail.sent} gitti` : "Kuyruk yok", mail.queue ? `${mail.failed} başarısız · ${mail.queued} bekliyor` : "Doğrudan gönderim"),
        statCard("Son 24 Saat", mail.failed24h ? `${mail.failed24h} e-posta gitmedi` : "Sorun yok", "Üç denemeden sonra")
      );
      renderBackups(s.backup.files);
    } catch (err) {
      note(sysError, err.message || "Sistem durumu yüklenemedi.", false);
    }
  }

  async function takeBackup(kind, button) {
    const label = kind === "full" ? "tam yedek (belgelerle)" : "veri yedeği";
    if (!await MYUI.confirmDialog({ title: "Yedek al", text: `Şimdi ${label} alınsın mı? Tam yedek birkaç dakika sürebilir.`, ok: "Yedek Al" })) return;
    button.disabled = true;
    note(backupFeedback, "Yedek alınıyor, lütfen bekleyin...", true);
    try {
      const res = await MYAPI.runBackup(kind);
      note(backupFeedback, `Yedek alındı: ${res.name}`, true);
      await loadSystem();
    } catch (err) {
      note(backupFeedback, err.message || "Yedek alınamadı.", false);
    } finally {
      button.disabled = false;
    }
  }

  const btnRecords = document.getElementById("btnBackupRecords");
  const btnFull = document.getElementById("btnBackupFull");
  btnRecords.addEventListener("click", () => takeBackup("records", btnRecords));
  btnFull.addEventListener("click", () => takeBackup("full", btnFull));

  loadCalendar();
  loadSystem();
});

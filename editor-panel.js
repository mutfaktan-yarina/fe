document.addEventListener("DOMContentLoaded", () => {
  // Basit istemci koruması (gerçek kimlik doğrulama arka uç işidir).
  const currentUser = MYUI.readJSON("currentUser");
  if (!currentUser || (currentUser.role !== "editor" && currentUser.role !== "admin")) {
    window.location.replace("giris.html");
    return;
  }

  const appsTableBody = document.getElementById("appsTableBody");
  // Taslaklar sekmesi yalnızca yöneticide oluşturulur; editörün DOM'unda hiç bulunmaz.
  if (currentUser.role === "admin") {
    const draftTab = document.createElement("button");
    draftTab.type = "button";
    draftTab.className = "filter-tab";
    draftTab.dataset.filter = "draft";
    draftTab.setAttribute("aria-pressed", "false");
    draftTab.textContent = "Taslaklar (Gönderilmemiş)";
    document.querySelector(".filter-pills-wrap").appendChild(draftTab);
  }
  const filterTabs = document.querySelectorAll(".filter-tab");
  const searchInput = document.getElementById("appSearchInput");

  const statTotalApps = document.getElementById("statTotalApps");
  const statPendingDocs = document.getElementById("statPendingDocs");
  const statPendingScore = document.getElementById("statPendingScore");
  const statCompleted = document.getElementById("statCompleted");
  const statRejected = document.getElementById("statRejected");

  // Dışa aktarma yalnızca yöneticiye açık; üst çubuk MYUI.initTopbar() ile kurulur.
  const isAdmin = currentUser.role === "admin";
  if (isAdmin) {
    const exportForm = document.getElementById("appsExportForm");
    if (exportForm) {
      exportForm.hidden = false;
      setupAppsExport();
    }
  }

  let applications = [];
  // Taslaklar yalnızca yöneticiye ve ayrı bir görünümde gelir: sıralamaya, sayaçlara ve jüri listesine karışmaz.
  let draftMode = false;
  let drafts = [];
  let loadState = "loading"; // loading | ready | error
  let loadErrorText = "";

  const STRUCTURE_LABELS = { sahis: "Şahıs İşletmesi", sirket: "Şirket", kooperatif: "Kadın Kooperatifi" };

  // Durum filtresi çoklu seçimlidir; boş küme "Tümü" demektir. Liste ve CSV aynı seçimi kullanır.
  const selectedStatuses = new Set();
  let searchQuery = "";

  const KNOWN_STATUSES = ["pending-verify", "pending-score", "scored", "rejected"];
  // Davet listesi (Sistem Puanı ile 25 asil + 10 yedek, eşitler dahil) sunucuda son veriden hesaplanır (inviteTier).
  let inviteOnly = false;
  let juryOnly = false;          // Jüri Aday Listesi: toplam puan (100) ile ilk 25 + eşitler, belgeleri doğrulanmış
  const selectedRefs = new Set();
  const TIER_LABELS = { main: "Asil", reserve: "Yedek", out: "Liste dışı" };

  // Bilinmeyen durum, ilk aşama olarak sayılır; böylece toplam her zaman kovaların toplamına eşit kalır.
  function statusOf(app) {
    // Aday yanıtı beklenen başvurular da ön değerlendirme aşamasındadır.
    if (app.status === "awaiting-answers") return "pending-score";
    return KNOWN_STATUSES.indexOf(app.status) >= 0 ? app.status : "pending-verify";
  }

  function num(v) {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
  }

  // Jüri Aday Listesi sunucuda belirlenir (ilk 25 + eşit puanlılar); burada yalnızca dönen ref'ler tutulur.
  let juryRefs = new Set();

  async function loadJuryRefs() {
    try {
      const res = await MYAPI.getJuryCandidates();
      const list = (res && (res.candidates || res.applications || res.refs)) || [];
      juryRefs = new Set(list.map(item => (typeof item === "string" ? item : item.ref)));
    } catch (e) {
      juryRefs = new Set();
    }
  }

  function updateMetrics() {
    const counts = { "pending-verify": 0, "pending-score": 0, scored: 0, rejected: 0 };
    applications.forEach(app => {
      counts[statusOf(app)]++;
    });

    if (statTotalApps) statTotalApps.textContent = applications.length;
    if (statPendingDocs) statPendingDocs.textContent = counts["pending-verify"];
    if (statPendingScore) statPendingScore.textContent = counts["pending-score"];
    if (statCompleted) statCompleted.textContent = counts.scored;
    if (statRejected) statRejected.textContent = counts.rejected;
  }

  // Puan sütunu sıralaması: ilk yüklemede Form azalan; yeni sütun azalan başlar, aynısı yön değiştirir.
  const SORT_KEYS = { form: "sistemScore", pre: "preScore", total: "totalScore" };
  let sortCol = "form";
  let sortDir = "desc";

  // Boş (null) puanlar her iki yönde sonda; eşitlikte başvuru sırası (id artan).
  function sortedApplications() {
    const key = SORT_KEYS[sortCol];
    const sign = sortDir === "asc" ? 1 : -1;
    return applications.map((app, i) => ({ app, i })).sort((x, y) => {
      const a = num(x.app[key]);
      const b = num(y.app[key]);
      if (a === null || b === null) {
        if (a !== b) return a === null ? 1 : -1;
      } else if (a !== b) {
        return (a - b) * sign;
      }
      return x.app.order - y.app.order || x.i - y.i;
    }).map(item => item.app);
  }

  function syncSortHeaders() {
    document.querySelectorAll("th[data-sort]").forEach(th => {
      const on = th.dataset.sort === sortCol;
      th.setAttribute("aria-sort", on ? (sortDir === "asc" ? "ascending" : "descending") : "none");
    });
  }

  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.querySelector("button").addEventListener("click", () => {
      if (th.dataset.sort === sortCol) {
        sortDir = sortDir === "desc" ? "asc" : "desc";
      } else {
        sortCol = th.dataset.sort;
        sortDir = "desc";
      }
      syncSortHeaders();
      renderTable();
    });
  });

  function scoreBadge(className, value, max) {
    const badge = document.createElement("div");
    badge.className = className;
    badge.textContent = `${value} `;
    const maxEl = document.createElement("span");
    maxEl.textContent = `/ ${max}`;
    badge.appendChild(maxEl);
    return badge;
  }

  function renderTable() {
    if (!appsTableBody) return;
    appsTableBody.replaceChildren();

    if (draftMode) {
      renderDrafts();
      return;
    }

    // Sıralama istemcide yapılır; sıra numarası o anki sıralamada filtrelenmemiş listedeki konumdur, arama ve sekme sırayı değiştirmez.
    const jury = juryRefs;
    const ranked = sortedApplications().map((app, index) => ({ app, rank: index + 1 }));

    const query = searchQuery.toLocaleLowerCase("tr-TR");
    const filtered = ranked.filter(({ app }) => {
      if (selectedStatuses.size && !selectedStatuses.has(statusOf(app))) {
        return false;
      }
      if (inviteOnly && app.inviteTier !== "main" && app.inviteTier !== "reserve") {
        return false;
      }
      if (juryOnly && !jury.has(app.ref)) {
        return false;
      }
      if (query) {
        const fields = [app.name, app.email, app.business, app.ref, app.city];
        const hit = fields.some(f => String(f || "").toLocaleLowerCase("tr-TR").includes(query));
        if (!hit) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.setAttribute("colspan", "12");
      td.textContent = loadState === "loading" ? "Başvurular yükleniyor..."
        : loadState === "error" ? loadErrorText
        : "Kriterlere uygun başvuru bulunamadı.";
      tr.appendChild(td);
      appsTableBody.appendChild(tr);
      return;
    }

    filtered.forEach(({ app, rank }) => {
      const status = statusOf(app);
      const inJury = jury.has(app.ref);
      const tr = document.createElement("tr");

      const tdSel = document.createElement("td");
      const sel = document.createElement("input");
      sel.type = "checkbox";
      sel.dataset.ref = app.ref;
      sel.setAttribute("aria-label", `${app.ref} başvurusunu seç`);
      sel.disabled = !app.inviteTier;          // elenmiş başvuru davet edilemez
      sel.checked = selectedRefs.has(app.ref);
      sel.addEventListener("change", () => {
        if (sel.checked) selectedRefs.add(app.ref); else selectedRefs.delete(app.ref);
        syncBulk();
      });
      tdSel.appendChild(sel);
      tr.appendChild(tdSel);

      const tdRank = document.createElement("td");
      const rankPill = document.createElement("span");
      rankPill.className = inJury ? "rank-pill rank-top25" : "rank-pill";
      rankPill.textContent = rank;
      tdRank.appendChild(rankPill);
      tr.appendChild(tdRank);

      const tdRef = document.createElement("td");
      tdRef.textContent = app.ref;
      tr.appendChild(tdRef);

      const tdApplicant = document.createElement("td");
      const colDiv = document.createElement("div");
      colDiv.className = "applicant-col-main";
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = app.name;
      const bizSpan = document.createElement("span");
      bizSpan.textContent = app.business;
      const mailSpan = document.createElement("span");
      mailSpan.textContent = app.email;
      colDiv.appendChild(nameSpan);
      colDiv.appendChild(bizSpan);
      colDiv.appendChild(mailSpan);
      tdApplicant.appendChild(colDiv);
      tr.appendChild(tdApplicant);

      const tdCity = document.createElement("td");
      tdCity.textContent = `${app.city} · ${STRUCTURE_LABELS[app.biztype] || "-"}`;
      tr.appendChild(tdCity);

      const tdEmp = document.createElement("td");
      tdEmp.textContent = num(app.totalEmployees) === null ? "—" : `${app.totalEmployees} SGK (%${app.femaleRatio} Kadın)`;
      tr.appendChild(tdEmp);

      const tdInvite = document.createElement("td");
      tdInvite.dataset.tier = app.inviteTier || "";
      const tierEl = document.createElement("strong");
      tierEl.textContent = TIER_LABELS[app.inviteTier] || "—";
      tdInvite.appendChild(tierEl);
      if (app.inviteTier) {
        const inv = document.createElement("small");
        inv.textContent = app.invited ? "Davet edildi" : "Davet edilmedi";
        tdInvite.appendChild(inv);
      }
      tr.appendChild(tdInvite);

      const tdSistem = document.createElement("td");
      const sistem = num(app.sistemScore);
      if (sistem !== null) {
        tdSistem.appendChild(scoreBadge("score-badge score-sistem", sistem, 70));
      } else {
        tdSistem.textContent = "-";
      }
      tr.appendChild(tdSistem);

      const tdPre = document.createElement("td");
      if (num(app.preScore) !== null) {
        tdPre.appendChild(scoreBadge("score-badge score-on", app.preScore, 30));
      } else {
        tdPre.textContent = "-";
      }
      tr.appendChild(tdPre);

      const tdTotal = document.createElement("td");
      if (num(app.totalScore) !== null) {
        tdTotal.appendChild(scoreBadge("score-badge score-total", app.totalScore, 100));
      } else {
        tdTotal.textContent = "-";
      }
      tr.appendChild(tdTotal);

      const tdStatus = document.createElement("td");
      const statusBadge = document.createElement("span");
      if (status === "pending-verify") {
        statusBadge.className = "badge-status status-pending-verify";
        statusBadge.textContent = "Belge Doğrulama";
      } else if (app.status === "awaiting-answers") {
        statusBadge.className = "badge-status status-pending-score";
        statusBadge.textContent = "Aday Yanıtı Bekleniyor";
      } else if (status === "pending-score") {
        statusBadge.className = "badge-status status-pending-score";
        statusBadge.textContent = "Ön Değerlendirme";
      } else if (status === "rejected") {
        statusBadge.className = "badge-status status-rejected";
        // Ret, yönetici bildirimi gönderene dek adaya görünmez.
        statusBadge.textContent = app.rejectionAnnounced === true ? "Elendi (bildirildi)"
          : app.rejectionAnnounced === false ? "Elendi (bildirilmedi)" : "Elendi";
      } else {
        statusBadge.className = "badge-status status-scored";
        statusBadge.textContent = "Puanlandı";
      }
      tdStatus.appendChild(statusBadge);
      if (inJury) {
        const juryBadge = document.createElement("span");
        juryBadge.className = "badge-status status-jury";
        juryBadge.textContent = "Jüri Aday Listesi";
        tdStatus.appendChild(juryBadge);
      }
      tr.appendChild(tdStatus);

      const tdAction = document.createElement("td");
      const actionLink = document.createElement("a");
      actionLink.href = `editor-degerlendirme.html?ref=${encodeURIComponent(app.ref)}`;
      actionLink.className = "btn-table-action";
      actionLink.textContent = status === "scored" || status === "rejected" ? "İncele" : "İncele ve Puanla";
      tdAction.appendChild(actionLink);
      tr.appendChild(tdAction);

      appsTableBody.appendChild(tr);
    });
    if (typeof syncBulk === "function") syncBulk();
  }

  function renderDrafts() {
    const query = searchQuery.toLocaleLowerCase("tr-TR");
    const shown = drafts.filter(app => !query ||
      [app.name, app.email, app.business, app.ref, app.city].some(f => String(f || "").toLocaleLowerCase("tr-TR").includes(query)));
    if (shown.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.setAttribute("colspan", "12");
      td.textContent = draftState === "loading" ? "Taslaklar yükleniyor..."
        : draftState === "error" ? draftErrorText
        : "Kriterlere uygun taslak bulunamadı.";
      tr.appendChild(td);
      appsTableBody.appendChild(tr);
      return;
    }
    shown.forEach(app => {
      const tr = document.createElement("tr");
      const cell = (text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
        return td;
      };
      cell("");
      cell("–");
      cell(app.ref);
      const tdApplicant = cell("");
      const colDiv = document.createElement("div");
      colDiv.className = "applicant-col-main";
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = app.name;
      const bizSpan = document.createElement("span");
      bizSpan.textContent = app.business;
      const mailSpan = document.createElement("span");
      mailSpan.textContent = app.email;
      colDiv.append(nameSpan, bizSpan, mailSpan);
      tdApplicant.appendChild(colDiv);
      cell(`${app.city} · ${STRUCTURE_LABELS[app.biztype] || "-"}`);
      cell(num(app.totalEmployees) === null ? "—" : `${app.totalEmployees} SGK (%${app.femaleRatio} Kadın)`);
      cell("—");
      cell("-");
      cell("-");
      cell("-");
      const badge = document.createElement("span");
      badge.className = "badge-status status-draft";
      badge.textContent = "Taslak";
      cell("").appendChild(badge);
      cell("Gönderilmedi");
      appsTableBody.appendChild(tr);
    });
  }

  let draftState = "loading";
  let draftErrorText = "";
  async function loadDrafts() {
    draftState = "loading";
    renderTable();
    try {
      const res = await MYAPI.getEditorApplications({ status: "draft" });
      if (!res || !res.ok || !Array.isArray(res.applications)) throw new Error("Beklenmeyen sunucu yanıtı.");
      drafts = res.applications;
      draftState = "ready";
    } catch (e) {
      drafts = [];
      draftState = "error";
      draftErrorText = (e && e.message) || "Taslaklar yüklenemedi.";
    }
    if (draftMode) renderTable();
  }

  const EXPORT_ALL_STATUSES = ["pending-verify", "pending-score", "scored", "rejected"];

  function setupAppsExport() {
    const form = document.getElementById("appsExportForm");
    const errEl = document.getElementById("appsExportError");
    if (!form || !window.MYAPI || !MYAPI.adminApplicationsExportUrl) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const from = form.elements.from.value;
      const to = form.elements.to.value;
      // Durum, listedeki seçili filtrelerden gelir; "Tümü" taslak dışındaki dört durumdur.
      const statuses = selectedStatuses.size ? [...selectedStatuses] : EXPORT_ALL_STATUSES;

      let msg = "";
      if (from && to && from > to) msg = "Bitiş tarihi başlangıç tarihinden önce olamaz.";
      errEl.textContent = msg;
      errEl.hidden = !msg;
      if (msg) return;
      const a = document.createElement("a");
      // Üstteki düğmeler sunucuya filtre olarak gider: liste ile CSV aynı seçimi gösterir.
      const filters = { from, to, status: statuses.join(",") };
      if (inviteOnly) filters.invite = "1";
      if (juryOnly) filters.jury = "1";
      a.href = MYAPI.adminApplicationsExportUrl(filters);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function syncFilterTabs() {
    filterTabs.forEach(t => {
      const f = t.getAttribute("data-filter");
      const on = f === "draft" ? draftMode : f === "invite" ? !draftMode && inviteOnly : f === "jury" ? !draftMode && juryOnly
        : f === "all" ? !draftMode && selectedStatuses.size === 0 && !inviteOnly && !juryOnly : !draftMode && selectedStatuses.has(f);
      t.classList.toggle("active", on);
      t.setAttribute("aria-pressed", String(on));
    });
  }

  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const f = tab.getAttribute("data-filter");
      if (f === "draft") {
        if (!isAdmin) return;
        draftMode = true;
        selectedStatuses.clear();
        syncFilterTabs();
        loadDrafts();
        return;
      }
      draftMode = false;
      if (f === "invite") inviteOnly = !inviteOnly;
      else if (f === "jury") juryOnly = !juryOnly;
      else if (f === "all") { selectedStatuses.clear(); inviteOnly = false; juryOnly = false; }
      else if (!selectedStatuses.delete(f)) selectedStatuses.add(f);
      syncFilterTabs();
      renderTable();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      renderTable();
    });
  }

  // Başvurular yalnızca API'den okunur (sayfa sayfa); hata durumunda sahte veri gösterilmez.
  async function loadApplications() {
    renderTable();
    try {
      const all = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await MYAPI.getEditorApplications({ page, limit: 100, order_by: "ranking" });
        if (!res || !res.ok || !Array.isArray(res.applications)) throw new Error("Beklenmeyen sunucu yanıtı.");
        all.push(...res.applications);
        totalPages = res.total_pages || 1;
        page++;
      } while (page <= totalPages);
      applications = all.map((app, i) => ({
        order: Number.isFinite(Number(app.id)) ? Number(app.id) : i,
        ref: app.ref,
        name: app.name,
        email: app.email || "",
        business: app.business,
        city: app.city,
        biztype: app.biztype,
        totalEmployees: app.totalEmployees,
        femaleRatio: app.femaleRatio,
        sistemScore: app.systemScore,
        preScore: app.preScore,
        totalScore: app.totalScore,
        status: app.status,
        inviteTier: app.inviteTier || null,
        invited: !!app.invited,
        rejectionAnnounced: app.rejectionAnnounced
      }));
      await loadJuryRefs();
      loadState = "ready";
    } catch (e) {
      applications = [];
      loadState = "error";
      loadErrorText = (e && e.message) || "Başvurular yüklenemedi.";
    }
    updateMetrics();
    renderTable();
  }

  // ── Toplu davet (belge talebi) ──
  const btnBulkInvite = document.getElementById("btnBulkInvite");
  const bulkCount = document.getElementById("bulkCount");
  const bulkResult = document.getElementById("bulkResult");
  const bulkModal = document.getElementById("bulkInviteModal");
  const selectAll = document.getElementById("selectAllRows");

  function syncBulk() {
    // yalnız listede hâlâ davet edilebilir olanlar sayılır
    const valid = new Set(applications.filter(a => a.inviteTier).map(a => a.ref));
    [...selectedRefs].forEach(r => { if (!valid.has(r)) selectedRefs.delete(r); });
    if (bulkCount) bulkCount.textContent = String(selectedRefs.size);
    if (btnBulkInvite) btnBulkInvite.disabled = selectedRefs.size === 0;
  }

  if (selectAll) {
    selectAll.addEventListener("change", () => {
      appsTableBody.querySelectorAll("input[type=checkbox][data-ref]").forEach(cb => {
        if (cb.disabled) return;
        cb.checked = selectAll.checked;
        if (cb.checked) selectedRefs.add(cb.dataset.ref); else selectedRefs.delete(cb.dataset.ref);
      });
      syncBulk();
    });
  }

  if (btnBulkInvite && bulkModal) {
    const form = bulkModal.querySelector("form");
    const err = document.getElementById("bulkInviteError");
    const close = () => MYUI.closeModal(bulkModal);
    document.getElementById("closeBulkInvite").addEventListener("click", close);
    document.getElementById("cancelBulkInvite").addEventListener("click", close);
    btnBulkInvite.addEventListener("click", () => {
      document.getElementById("bulkInviteSummary").textContent =
        `${selectedRefs.size} başvuruya belge talebi ve ön değerlendirme daveti gönderilecek.`;
      err.hidden = true;
      MYUI.openModal(bulkModal);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const kinds = [...form.querySelectorAll("input[name=kind]:checked")].map(i => i.value);
      if (!kinds.length) { err.textContent = "En az bir belge seçiniz."; err.hidden = false; return; }
      const confirmBtn = document.getElementById("confirmBulkInvite");
      confirmBtn.disabled = true;
      let res;
      try {
        res = await MYAPI.requestDocsBulk([...selectedRefs], kinds);
      } catch (apiErr) {
        confirmBtn.disabled = false;
        err.textContent = (apiErr && apiErr.message) || "Davet gönderilemedi.";
        err.hidden = false;
        return;
      }
      confirmBtn.disabled = false;
      close();
      const results = res.results || [];
      const failed = results.filter(r => !r.ok);
      const skipped = results.filter(r => r.ok && r.mail === "skipped");
      const mailFailed = results.filter(r => r.ok && r.mail === "failed");
      let text = `${res.done} / ${res.total} başvuru davet edildi.`;
      if (failed.length) text += ` Atlananlar: ${failed.map(r => `${r.ref} (${(r.error && r.error.text) || "hata"})`).join(", ")}.`;
      if (skipped.length) text += ` E-posta gönderilmedi (aynı belgeler zaten talep edilmişti): ${skipped.map(r => r.ref).join(", ")}.`;
      if (mailFailed.length) text += ` E-POSTA GÖNDERİLEMEDİ, adaya başka yoldan ulaşın veya değerlendirme sayfasından talebi yeniden gönderin: ${mailFailed.map(r => r.ref).join(", ")}.`;
      bulkResult.textContent = text;
      bulkResult.hidden = false;
      selectedRefs.clear();
      if (selectAll) selectAll.checked = false;
      await loadApplications();
    });
  }

  loadApplications();
});

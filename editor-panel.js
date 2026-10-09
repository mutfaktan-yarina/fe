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

  // Toplam Ön Sıralama Puanı oluşmuş (puanlanmış) kayıtlar birinci gruptur.
  function isRanked(app) {
    return statusOf(app) === "scored" && num(app.totalScore) !== null;
  }

  function compareApps(a, b) {
    const ra = isRanked(a);
    const rb = isRanked(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) {
      const diff = num(b.totalScore) - num(a.totalScore);
      if (diff) return diff;
    }
    const sysDiff = (num(b.sistemScore) || 0) - (num(a.sistemScore) || 0);
    if (sysDiff) return sysDiff;
    return String(a.ref).localeCompare(String(b.ref));
  }

  // Jüri Aday Listesi: ilk 25 + 25. ile eşit puanlıların tamamı (yalnızca puanlanmış, elenmemiş kayıtlar).
  function juryRefSet() {
    const candidates = applications
      .filter(isRanked)
      .map(a => ({ ref: a.ref, totalScore: num(a.totalScore) }));
    const result = MYScoring.juryCandidates(candidates) || [];
    return new Set(result.map(item => (typeof item === "string" ? item : item.ref)));
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

    // Sıra numarası filtrelenmemiş listeye göre verilir; arama ve sekme sırayı değiştirmez.
    const jury = juryRefSet();
    const ranked = [...applications].sort(compareApps).map((app, index) => ({ app, rank: index + 1 }));

    const query = searchQuery.toLocaleLowerCase("tr-TR");
    const filtered = ranked.filter(({ app }) => {
      if (selectedStatuses.size && !selectedStatuses.has(statusOf(app))) {
        return false;
      }
      if (query) {
        const fields = [app.name, app.business, app.ref, app.city];
        const hit = fields.some(f => String(f || "").toLocaleLowerCase("tr-TR").includes(query));
        if (!hit) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.setAttribute("colspan", "10");
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
      colDiv.appendChild(nameSpan);
      colDiv.appendChild(bizSpan);
      tdApplicant.appendChild(colDiv);
      tr.appendChild(tdApplicant);

      const tdCity = document.createElement("td");
      tdCity.textContent = `${app.city} · ${STRUCTURE_LABELS[app.biztype] || "-"}`;
      tr.appendChild(tdCity);

      const tdEmp = document.createElement("td");
      tdEmp.textContent = num(app.totalEmployees) === null ? "—" : `${app.totalEmployees} SGK (%${app.femaleRatio} Kadın)`;
      tr.appendChild(tdEmp);

      const tdSistem = document.createElement("td");
      const sistem = num(app.sistemScore);
      if (sistem !== null) {
        tdSistem.appendChild(scoreBadge("score-badge score-sistem", sistem, 70));
      } else {
        tdSistem.textContent = "—";
      }
      tr.appendChild(tdSistem);

      const tdPre = document.createElement("td");
      if (num(app.preScore) !== null) {
        tdPre.appendChild(scoreBadge("score-badge score-on", app.preScore, 30));
      } else {
        tdPre.textContent = "—";
      }
      tr.appendChild(tdPre);

      const tdTotal = document.createElement("td");
      if (num(app.totalScore) !== null) {
        tdTotal.appendChild(scoreBadge("score-badge score-total", app.totalScore, 100));
      } else {
        tdTotal.textContent = "—";
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
        statusBadge.textContent = "Elendi";
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
  }

  function renderDrafts() {
    const query = searchQuery.toLocaleLowerCase("tr-TR");
    const shown = drafts.filter(app => !query ||
      [app.name, app.business, app.ref, app.city].some(f => String(f || "").toLocaleLowerCase("tr-TR").includes(query)));
    if (shown.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.setAttribute("colspan", "10");
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
      cell("–");
      cell(app.ref);
      const tdApplicant = cell("");
      const colDiv = document.createElement("div");
      colDiv.className = "applicant-col-main";
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = app.name;
      const bizSpan = document.createElement("span");
      bizSpan.textContent = app.business;
      colDiv.append(nameSpan, bizSpan);
      tdApplicant.appendChild(colDiv);
      cell(`${app.city} · ${STRUCTURE_LABELS[app.biztype] || "-"}`);
      cell(num(app.totalEmployees) === null ? "—" : `${app.totalEmployees} SGK (%${app.femaleRatio} Kadın)`);
      cell("—");
      cell("—");
      cell("—");
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
      a.href = MYAPI.adminApplicationsExportUrl({ from, to, status: statuses.join(",") });
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function syncFilterTabs() {
    filterTabs.forEach(t => {
      const f = t.getAttribute("data-filter");
      const on = f === "draft" ? draftMode : f === "all" ? !draftMode && selectedStatuses.size === 0 : !draftMode && selectedStatuses.has(f);
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
      if (f === "all") selectedStatuses.clear();
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
        const res = await MYAPI.getEditorApplications({ page, limit: 100 });
        if (!res || !res.ok || !Array.isArray(res.applications)) throw new Error("Beklenmeyen sunucu yanıtı.");
        all.push(...res.applications);
        totalPages = res.total_pages || 1;
        page++;
      } while (page <= totalPages);
      applications = all.map(app => ({
        ref: app.ref,
        name: app.name,
        business: app.business,
        city: app.city,
        biztype: app.biztype,
        totalEmployees: app.totalEmployees,
        femaleRatio: app.femaleRatio,
        sistemScore: app.systemScore,
        preScore: app.preScore,
        totalScore: app.totalScore,
        status: app.status
      }));
      loadState = "ready";
    } catch (e) {
      applications = [];
      loadState = "error";
      loadErrorText = (e && e.message) || "Başvurular yüklenemedi.";
    }
    updateMetrics();
    renderTable();
  }

  loadApplications();
});

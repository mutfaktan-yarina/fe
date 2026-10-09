document.addEventListener("DOMContentLoaded", () => {
  const currentUser = MYUI.readJSON("currentUser");
  if (!currentUser || currentUser.role !== "admin") {
    window.location.replace("giris.html");
    return;
  }

  const usersTableBody = document.getElementById("usersTableBody");
  const filterTabs = document.querySelectorAll(".filter-tab");
  const searchInput = document.getElementById("userSearchInput");

  const statTotalUsers = document.getElementById("statTotalUsers");
  const statMembers = document.getElementById("statMembers");
  const statEditors = document.getElementById("statEditors");
  const statAdmins = document.getElementById("statAdmins");
  const statBlocked = document.getElementById("statBlocked");

  const inviteForm = document.getElementById("inviteEditorForm");
  const inviteFeedback = document.getElementById("inviteFeedback");
  const btnSubmitInvite = document.getElementById("btnSubmitInvite");

  const askConfirm = MYUI.confirmDialog;
  const invitesBody = document.getElementById("invitesTableBody");
  const invitesFeedback = document.getElementById("invitesFeedback");

  let users = [];
  let currentFilter = "all";
  let currentSearch = "";
  let loadError = "";

  function formatDate(timestamp) {
    if (!timestamp || timestamp <= 0) return "-";
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function updateStats() {
    statTotalUsers.textContent = users.length;
    statMembers.textContent = users.filter(u => u.role === "member").length;
    statEditors.textContent = users.filter(u => u.role === "editor").length;
    statAdmins.textContent = users.filter(u => u.role === "admin").length;
    statBlocked.textContent = users.filter(u => u.isBlocked).length;
  }

  function renderTable() {
    usersTableBody.innerHTML = "";

    const filtered = users.filter(u => {
      if (currentFilter === "member" && u.role !== "member") return false;
      if (currentFilter === "editor" && u.role !== "editor") return false;
      if (currentFilter === "admin" && u.role !== "admin") return false;
      if (currentFilter === "blocked" && !u.isBlocked) return false;

      if (currentSearch) {
        const q = currentSearch.toLowerCase();
        const n = (u.name || "").toLowerCase();
        const e = (u.email || "").toLowerCase();
        if (!n.includes(q) && !e.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.style.cssText = "text-align:center; padding:32px; color:#64748b;";
      td.textContent = loadError || "Kriterlere uygun kullanıcı bulunamadı.";
      tr.appendChild(td);
      usersTableBody.appendChild(tr);
      return;
    }

    filtered.forEach(u => {
      const tr = document.createElement("tr");

      const roleBadgeClass = u.role === "admin" ? "badge-role-admin" : (u.role === "editor" ? "badge-role-editor" : "badge-role-member");
      const roleLabel = u.role === "admin" ? "Yönetici" : (u.role === "editor" ? "Editör" : "Aday");

      const statusBadge = u.isBlocked
        ? '<span class="badge-status-blocked">Engellendi</span>'
        : '<span class="badge-status-active">Aktif</span>';

      let actionHtml = "-";
      if (u.role !== "admin" && u.email !== currentUser.email) {
        const mail = escapeHtml(u.email);
        if (u.isBlocked) {
          actionHtml = '<button type="button" class="btn-action-unblock" data-email="' + mail + '">Engeli Kaldır</button>';
        } else {
          actionHtml = '<button type="button" class="btn-action-block" data-email="' + mail + '">Engelle</button>';
        }
        // Editörler yalnızca davetle eklenir; "Editör Yap" yok, yalnız editörlükten çıkarma var.
        if (u.role === "editor") {
          actionHtml += ' <button type="button" class="btn-action-role" data-email="' + mail + '" data-role="member">Aday Yap</button>';
        }
        actionHtml += ' <button type="button" class="btn-action-reset" data-email="' + mail + '">Şifre Sıfırlama Maili</button>';
      }

      tr.innerHTML = `
        <td style="font-weight:600; color:#1e293b;">${escapeHtml(u.name || "-")}</td>
        <td>${escapeHtml(u.email || "-")}</td>
        <td>${escapeHtml(u.phone || "-")}</td>
        <td><span class="badge-role ${roleBadgeClass}">${roleLabel}</span></td>
        <td>${statusBadge}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td>${formatDate(u.lastLoginAt)}</td>
        <td>${actionHtml}</td>
      `;

      usersTableBody.appendChild(tr);
    });

    // Event listeners for block / unblock
    usersTableBody.querySelectorAll(".btn-action-block").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        if (!await askConfirm({ title: "Hesabı engelle", text: `${email} hesabı engellenecek. Açık oturumu kapatılır ve giriş yapamaz. Emin misiniz?`, ok: "Engelle", danger: true })) return;

        btn.disabled = true;
        btn.textContent = "İşleniyor...";
        try {
          await window.MYAPI.blockUser(email);
          const target = users.find(u => u.email === email);
          if (target) target.isBlocked = true;
          updateStats();
          renderTable();
        } catch (err) {
          await askConfirm({ title: "İşlem başarısız", text: "Engelleme işlemi başarısız: " + (err.message || "Hata oluştu"), ok: "Tamam", info: true });
          btn.disabled = false;
          btn.textContent = "Engelle";
        }
      });
    });

    usersTableBody.querySelectorAll(".btn-action-role").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        const role = btn.getAttribute("data-role");
        const label = role === "editor" ? "editör yapmak" : "başvuru sahibi (aday) rolüne düşürmek";
        if (!await askConfirm({ title: "Rolü değiştir", text: `${email} hesabını ${label} istediğinize emin misiniz? Kullanıcının açık oturumları kapatılır, yeniden giriş yapması gerekir.`, ok: "Onayla" })) return;
        btn.disabled = true;
        try {
          await window.MYAPI.setUserRole(email, role);
          await loadUsers();
        } catch (err) {
          await askConfirm({ title: "İşlem başarısız", text: "Rol değiştirilemedi: " + (err.message || "Hata oluştu"), ok: "Tamam", info: true });
          btn.disabled = false;
        }
      });
    });

    usersTableBody.querySelectorAll(".btn-action-reset").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        if (!await askConfirm({ title: "Şifre sıfırlama maili", text: `${email} adresine şifre sıfırlama kodu e-postayla gönderilsin mi? Şifreyi yönetici görmez; kullanıcı kodla kendisi yeni şifre belirler.`, ok: "Mail Gönder" })) return;
        btn.disabled = true;
        try {
          await window.MYAPI.forgotPassword({ email });
          await askConfirm({ title: "Mail gönderildi", text: `${email} adresine şifre sıfırlama kodu gönderildi.`, ok: "Tamam", info: true });
        } catch (err) {
          await askConfirm({ title: "Gönderilemedi", text: err.message || "Şifre sıfırlama maili gönderilemedi.", ok: "Tamam", info: true });
        } finally {
          btn.disabled = false;
        }
      });
    });

    usersTableBody.querySelectorAll(".btn-action-unblock").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        if (!await askConfirm({ title: "Engeli kaldır", text: `${email} hesabının engeli kaldırılsın mı?`, ok: "Engeli Kaldır" })) return;

        btn.disabled = true;
        btn.textContent = "İşleniyor...";
        try {
          await window.MYAPI.unblockUser(email);
          const target = users.find(u => u.email === email);
          if (target) target.isBlocked = false;
          updateStats();
          renderTable();
        } catch (err) {
          await askConfirm({ title: "İşlem başarısız", text: "Engel kaldırma işlemi başarısız: " + (err.message || "Hata oluştu"), ok: "Tamam", info: true });
          btn.disabled = false;
          btn.textContent = "Engeli Kaldır";
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Load users from API or mock
  async function loadUsers() {
    loadError = "";
    try {
      const res = await window.MYAPI.getAdminUsers();
      users = (res && Array.isArray(res.users)) ? res.users : [];
    } catch (e) {
      users = [];
      loadError = (e && e.message) || "Kullanıcı listesi yüklenemedi.";
    }
    updateStats();
    renderTable();
  }

  // Bekleyen davetler
  function inviteNote(text, ok) {
    invitesFeedback.textContent = text;
    invitesFeedback.dataset.state = ok ? "ok" : "error";
    invitesFeedback.hidden = !text;
  }

  async function inviteAction(button, work, doneText) {
    button.disabled = true;
    try {
      await work();
      inviteNote(doneText, true);
      await loadInvites();
    } catch (err) {
      inviteNote(err.message || "İşlem başarısız oldu.", false);
      button.disabled = false;
    }
  }

  function inviteButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => onClick(btn));
    return btn;
  }

  function renderInvites(invites) {
    if (invites.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "Bekleyen davet yok.";
      tr.appendChild(td);
      invitesBody.replaceChildren(tr);
      return;
    }
    invitesBody.replaceChildren(...invites.map(inv => {
      const tr = document.createElement("tr");
      [inv.email, formatDate(inv.createdAt), formatDate(inv.expiresAt),
        inv.mailFailed ? "E-posta gönderilemedi: bağlantıyı kopyalayıp elden iletin" : (inv.status === "expired" ? "Süresi doldu" : "Bekliyor")]
        .forEach(text => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        });
      const actions = document.createElement("td");
      if (inv.link) {
        actions.appendChild(inviteButton("Bağlantıyı Kopyala", async (btn) => {
          try {
            await navigator.clipboard.writeText(inv.link);
            inviteNote(`${inv.email} için davet bağlantısı panoya kopyalandı.`, true);
          } catch (err) {
            inviteNote("Panoya kopyalanamadı: " + inv.link, false);
          }
          btn.blur();
        }));
      }
      actions.appendChild(inviteButton("Yeniden Gönder", async (btn) => {
        if (!await askConfirm({ title: "Daveti yeniden gönder", text: `${inv.email} için yeni bir davet gönderilsin mi? Eski bağlantı geçersiz olur.`, ok: "Gönder" })) return;
        inviteAction(btn, () => window.MYAPI.resendInvite(inv.email), `${inv.email} adresine yeni davet gönderildi.`);
      }));
      actions.appendChild(inviteButton("İptal Et", async (btn) => {
        if (!await askConfirm({ title: "Daveti iptal et", text: `${inv.email} için gönderilen davet iptal edilsin mi?`, ok: "İptal Et", danger: true })) return;
        inviteAction(btn, () => window.MYAPI.cancelInvite(inv.email), `${inv.email} daveti iptal edildi.`);
      }));
      tr.appendChild(actions);
      return tr;
    }));
  }

  async function loadInvites() {
    try {
      const res = await window.MYAPI.getInvites();
      renderInvites(Array.isArray(res.invites) ? res.invites : []);
    } catch (err) {
      inviteNote(err.message || "Davetler yüklenemedi.", false);
    }
  }

  // Filters
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-pressed", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-pressed", "true");
      currentFilter = tab.getAttribute("data-filter");
      renderTable();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.trim();
      renderTable();
    });
  }

  // Invite Form
  if (inviteForm) {
    inviteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("inviteName");
      const emailInput = document.getElementById("inviteEmail");

      const name = nameInput.value.trim();
      const email = emailInput.value.trim();

      if (!name || !email) return;

      btnSubmitInvite.disabled = true;
      btnSubmitInvite.querySelector("span").textContent = "Gönderiliyor...";
      inviteFeedback.style.display = "none";

      try {
        await window.MYAPI.inviteEditor({ name, email });
        inviteFeedback.textContent = `✓ ${email} için davet oluşturuldu ve e-posta kuyruğa alındı. E-posta ulaşmazsa "Bekleyen Davetler" listesinde uyarı görünür; bağlantıyı oradan kopyalayıp iletebilirsiniz.`;
        inviteFeedback.style.color = "#15803d";
        inviteFeedback.style.display = "block";
        inviteForm.reset();
        await loadUsers();
        await loadInvites();
      } catch (err) {
        inviteFeedback.textContent = err.message || "Davet gönderilirken bir hata oluştu.";
        inviteFeedback.style.color = "#b91c1c";
        inviteFeedback.style.display = "block";
      } finally {
        btnSubmitInvite.disabled = false;
        btnSubmitInvite.querySelector("span").textContent = "Davet Gönder";
      }
    });
  }

  // CSV export follows the active tab: role tabs map to ?role=, "Engellenenler" to ?state=blocked
  const btnExportUsers = document.getElementById("btnExportUsers");
  if (btnExportUsers && window.MYAPI && MYAPI.adminUsersExportUrl) {
    btnExportUsers.addEventListener("click", () => {
      const filters = {};
      if (currentFilter === "blocked") filters.state = "blocked";
      else if (currentFilter !== "all") filters.role = currentFilter;
      const a = document.createElement("a");
      a.href = MYAPI.adminUsersExportUrl(filters);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  loadUsers();
  loadInvites();
});

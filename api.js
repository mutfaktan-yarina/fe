// Mutfaktan Yarına - İstemci API İstemcisi
(function () {
  'use strict';

  function ApiError(status, errors, data) {
    var defaultMsg = 'İstek başarısız oldu (' + status + ')';
    if (status === 400) defaultMsg = 'İstek geçersiz veya eksik bilgi içeriyor.';
    else if (status === 401) defaultMsg = 'Oturum süreniz dolmuş veya yetkiniz yok. Lütfen tekrar giriş yapın.';
    else if (status === 403) defaultMsg = 'Bu işlem için yetkiniz bulunmuyor.';
    else if (status === 413) defaultMsg = 'Yüklenen dosya veya veri boyutu izin verilen sınırı aşıyor.';

    var first = (errors && errors[0] && errors[0].text) || defaultMsg;
    var err = new Error(first);
    err.name = 'ApiError';
    err.status = status;
    err.errors = errors || [];
    err.data = data;
    err.getField = function (name) {
      for (var i = 0; i < err.errors.length; i++) {
        if (err.errors[i].field === name) {
          return err.errors[i].text;
        }
      }
      return null;
    };
    return err;
  }

  var REQUEST_TIMEOUT_MS = 6000;
  var REQUEST_TIMEOUT_UPLOAD_MS = 120000;

  // Kullanıcıya İngilizce ya da anlaşılmaz sunucu/ağ geçidi metni asla gösterilmez. Ağ geçidinin gövdesi
  // ({"error":"upstream unavailable"}, düz metin, boş) ve İngilizce görünen her ileti duruma göre Türkçe bir iletiye çevrilir;
  // uygulamanın kendi Türkçe iletileri (ör. "E-posta veya sifre hatali") korunur, bilinen birkaçı düzgün Türkçeye çevrilir.
  var STATUS_TEXT = {
    400: 'İstek geçersiz veya eksik bilgi içeriyor.',
    401: 'Oturum süreniz dolmuş veya yetkiniz yok. Lütfen tekrar giriş yapın.',
    403: 'Bu işlem için yetkiniz bulunmuyor.',
    404: 'İstenen kayıt bulunamadı.',
    405: 'Bu işlem desteklenmiyor.',
    408: 'Sunucu yanıt vermedi. Lütfen bir süre sonra tekrar deneyin.',
    409: 'İşlem başvurunun şu anki durumuyla çakışıyor. Sayfayı yenileyip tekrar deneyin.',
    413: 'Yüklenen dosya veya veri boyutu izin verilen sınırı aşıyor.',
    415: 'Bu dosya türü desteklenmiyor.',
    429: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.',
    500: 'Sunucuda beklenmeyen bir hata oluştu. Lütfen biraz sonra tekrar deneyin.',
    502: 'Sunucuya şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.',
    503: 'Sunucuya şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.',
    504: 'Sunucu yanıt vermedi. Lütfen biraz sonra tekrar deneyin.'
  };
  // Bilinen API iletileri (ASCII yazılmış) -> düzgün Türkçe
  var KNOWN_TEXT = [
    [/belge degistirme suresi doldugu/i, 'Belge değiştirme süresi dolduğu için belge artık değiştirilemez.'],
    [/incelemede ilerledigi icin belge degistirilemez/i, 'Başvurunuz incelemede ilerlediği için belge artık değiştirilemez.'],
    [/gonderilmis basvurunun belgesi degistirilemez/i, 'Gönderilmiş başvurunun belgesi değiştirilemez.']
  ];
  var ENGLISH_HINT = /(^|[^a-z])(upstream|unavailable|bad gateway|gateway|time-?out|timed out|too many|rate limit|forbidden|unauthori[sz]ed|authentication|not found|internal server|server error|bad request|payload|entity too large|service|failed|failure|error|invalid|denied|required|something went wrong|try again|please|the|is|are|was|not|cannot|could not|unable|connection|refused|reset|closed|busy|overloaded)([^a-z]|$)/i;
  function statusText(status) {
    if (STATUS_TEXT[status]) return STATUS_TEXT[status];
    if (status >= 500) return STATUS_TEXT[500];
    if (status >= 400) return STATUS_TEXT[400];
    return 'İstek başarısız oldu (' + status + ')';
  }
  function localizeErrors(status, errors, fromApp) {
    var list = errors && errors.length ? errors : [{ field: 'general', text: '' }];
    return list.map(function (e) {
      var text = String((e && e.text) || '').trim();
      var field = (e && e.field) || 'general';
      var fixed = null;
      for (var i = 0; i < KNOWN_TEXT.length; i++) {
        if (KNOWN_TEXT[i][0].test(text)) { fixed = KNOWN_TEXT[i][1]; break; }
      }
      if (fixed) return { field: field, text: fixed };
      // Boş metin, İngilizce görünen her ileti ve uygulama dışı (ağ geçidi/proxy) gövdede Türkçe harf içermeyen metin
      if (!text || ENGLISH_HINT.test(text) || (!fromApp && !/[çğıöşüÇĞİÖŞÜ]/.test(text))) {
        return { field: field, text: statusText(status) };
      }
      return { field: field, text: text };
    });
  }

  async function request(path, options) {
    options = options || {};
    var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '';
    if (!base) {
      var offlineErr = ApiError(0, [{ field: 'network', text: 'API çevrimdışı modda.' }], null);
      offlineErr.isOfflineDemo = true;
      throw offlineErr;
    }
    var url = base + path;
    var headers = Object.assign({}, options.headers);

    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    options.credentials = 'include';
    options.headers = headers;

    // Yanıt vermeyen sunucuda kullanıcı sonsuz beklemesin: dosya yüklemeleri uzun, diğer istekler kısa sürede zaman aşımına uğrar.
    var timedOut = false;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, options.body instanceof FormData ? REQUEST_TIMEOUT_UPLOAD_MS : REQUEST_TIMEOUT_MS);
    options.signal = ctrl.signal;

    var res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      clearTimeout(timer);
      var err = ApiError(0, [{ field: 'network', text: timedOut
        ? 'Sunucu yanıt vermedi. Lütfen bir süre sonra tekrar deneyin.'
        : 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.' }], null);
      err.isNetworkError = true;
      throw err;
    }

    var data = null;
    var contentType = res.headers.get('content-type') || '';
    try {
      data = contentType.indexOf('application/json') !== -1 ? await res.json() : await res.text();
    } catch (e) {
      data = null;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Uygulamanın kendi yanıtı {"errors":[{field,text}]} biçimindedir; ağ geçidi {"error":"..."} ya da düz metin döner.
      var fromApp = !!(data && typeof data === 'object' && data.errors && data.errors.length);
      var raw = fromApp ? data.errors
        : (data && typeof data === 'object' && typeof data.error === 'string') ? [{ field: 'general', text: data.error }]
        : (typeof data === 'string' && data) ? [{ field: 'general', text: data.slice(0, 300) }] : null;
      var errors = localizeErrors(res.status, raw, fromApp);
      throw ApiError(res.status, errors, data);
    }

    return data;
  }

  // Sunucu büyük yüklemeleri aynı anda kabul etmezse (503 "yoğun") yükleme birkaç saniye arayla kendiliğinden yeniden denenir.
  async function retryWhileBusy(send) {
    var wait = [2000, 3000, 4000, 5000, 6000, 7000, 8000];   // 15 kişi aynı adresten aynı anda yükleme yapabilir: toplam 35 sn'ye kadar denenir
    for (var i = 0; ; i++) {
      try {
        return await send();
      } catch (e) {
        // 503 "yoğun" ya da sunucu 10 MB'lık gövde sürerken yanıtı verip bağlantıyı kapattığında oluşan ağ hatası: ikisi de tekrar denenir
        const busy = e && (e.status === 503 || e.isNetworkError);
        if (!busy || i >= wait.length) throw e;
        await new Promise(function (r) { setTimeout(r, wait[i]); });
      }
    }
  }

  var API = {
    ApiError: ApiError,
    request: request,

    // Auth
    signup: function (payload) {
      return request('/auth/signup', { method: 'POST', body: payload });
    },
    verify: function (payload) {
      return request('/auth/verify', { method: 'POST', body: payload });
    },
    login: function (payload) {
      return request('/auth/login', { method: 'POST', body: payload });
    },
    logout: function () {
      return request('/auth/logout', { method: 'POST' });
    },
    session: function () {
      return request('/auth/session', { method: 'GET' });
    },
    forgotPassword: function (payload) {
      return request('/auth/password/forgot', { method: 'POST', body: payload });
    },
    resetPassword: function (payload) {
      return request('/auth/password/reset', { method: 'POST', body: payload });
    },
    changePassword: function (payload) {
      return request('/auth/password/change', { method: 'POST', body: payload });
    },

    // Application
    getApplication: function () {
      return request('/application', { method: 'GET' });
    },
    saveDraft: function (payload) {
      if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
        var clean = Object.assign({}, payload);
        var forbidden = [
          'member', 'member_uuid', 'member_key', 'memberId', 'role',
          'status', 'ref', 'refNo', 'id', 'uuid', 'owner',
          'score', 'scores', 'systemScore', 'sistemScore', 'system',
          'system_total', 'system_part1', 'system_part2', 'systemTotal',
          'systemPart1', 'systemPart2', 'total', 'preTotal', 'pre_total',
          'totalPre', 'certificate_uuid', 'certificate_name',
          'submittedAt', 'createdAt', 'updatedAt', 'submitted_at',
          'created_at', 'updated_at', 'fileName', 'q14_hired'
        ];
        for (var i = 0; i < forbidden.length; i++) {
          delete clean[forbidden[i]];
        }
        return request('/application', { method: 'PUT', body: clean });
      }
      return request('/application', { method: 'PUT', body: payload });
    },
    submitApplication: function () {
      return request('/application/submit', { method: 'POST', body: {} });
    },
    reopenApplication: function () {
      return request('/application/reopen', { method: 'POST', body: {} });
    },
    uploadCertificate: function (file) {
      var form = new FormData();
      form.append('file', file);
      return retryWhileBusy(function () { return request('/application/certificate', { method: 'POST', body: form }); });
    },
    certificateDownloadUrl: function () {
      var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '/v1';
      return base + '/application/certificate';
    },
    uploadVerificationDoc: function (file, kind) {
      var form = new FormData();
      form.append('file', file);
      var path = '/application/verification-doc?kind=' + encodeURIComponent(kind || 'tax');
      return retryWhileBusy(function () { return request(path, { method: 'POST', body: form }); });
    },
    verificationDocDownloadUrl: function (kind) {
      var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '/v1';
      return base + '/application/verification-doc?kind=' + encodeURIComponent(kind || 'tax');
    },
    editorVerificationDocDownloadUrl: function (ref, kind) {
      var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '/v1';
      return base + '/application/verification-doc?ref=' + encodeURIComponent(ref) + '&kind=' + encodeURIComponent(kind || 'tax');
    },

    // Contact
    sendContact: function (payload) {
      return request('/contact', { method: 'POST', body: payload });
    },

    // Pre-evaluation
    getPreeval: function () {
      return request('/preeval', { method: 'GET' });
    },
    submitPreeval: function (payload) {
      return request('/preeval', { method: 'POST', body: payload });
    },

    // Editor & Admin
    getEditorApplications: function (params) {
      var qs = '';
      if (params && typeof params === 'object') {
        var parts = [];
        Object.keys(params).forEach(function (k) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
          }
        });
        if (parts.length) qs = '?' + parts.join('&');
      }
      return request('/editor/applications' + qs, { method: 'GET' });
    },
    getEditorApplicationDetail: function (ref) {
      return request('/editor/applications/detail?ref=' + encodeURIComponent(ref), { method: 'GET' });
    },
    openPreeval: function (ref) {
      return request('/editor/applications/open-preeval', { method: 'POST', body: { ref: ref } });
    },
    verifyApplication: function (payload) {
      return request('/editor/applications/verify', { method: 'POST', body: payload });
    },
    submitEvaluation: function (payload) {
      return request('/editor/applications/evaluation', { method: 'POST', body: payload });
    },
    getJuryCandidates: function () {
      return request('/editor/jury-candidates', { method: 'GET' });
    },
    inviteEditor: function (payload) {
      return request('/admin/editors/invite', { method: 'POST', body: payload });
    },
    getEditorInvite: function (token) {
      return request('/editor/invite?token=' + encodeURIComponent(token), { method: 'GET' });
    },
    acceptEditorInvite: function (payload) {
      return request('/editor/accept', { method: 'POST', body: payload });
    },
    editorCertificateDownloadUrl: function (ref) {
      var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '/v1';
      return base + '/application/certificate?ref=' + encodeURIComponent(ref);
    },

    // Admin User Management
    getAdminUsers: function () {
      return request('/admin/users', { method: 'GET' });
    },
    blockUser: function (email) {
      return request('/admin/users/block', { method: 'POST', body: { email: email } });
    },
    unblockUser: function (email) {
      return request('/admin/users/unblock', { method: 'POST', body: { email: email } });
    },

    // Admin: davetler, rol, geçici şifre
    getInvites: function () {
      return request('/admin/invites', { method: 'GET' });
    },
    cancelInvite: function (email) {
      return request('/admin/invites/cancel', { method: 'POST', body: { email: email } });
    },
    resendInvite: function (email) {
      return request('/admin/invites/resend', { method: 'POST', body: { email: email } });
    },
    setUserRole: function (email, role) {
      return request('/admin/users/role', { method: 'POST', body: { email: email, role: role } });
    },
    resetUserPassword: function (email) {
      return request('/admin/users/reset-password', { method: 'POST', body: { email: email } });
    },

    // Admin: denetim kaydı, sistem, yedek, takvim
    getAudit: function (params) {
      return request('/admin/audit' + queryString(params), { method: 'GET' });
    },
    getSystem: function () {
      return request('/admin/system', { method: 'GET' });
    },
    runBackup: function (kind) {
      return request('/admin/backup', { method: 'POST', body: { kind: kind } });
    },
    backupDownloadUrl: function (name) {
      return exportUrl('/admin/backup/download', { name: name });
    },
    getCalendar: function () {
      return request('/calendar', { method: 'GET' });
    },
    setCalendar: function (payload) {
      return request('/admin/calendar', { method: 'POST', body: payload });
    },

    // CSV export URLs
    adminApplicationsExportUrl: function (filters) {
      return exportUrl('/admin/applications/export', filters);
    },
    adminUsersExportUrl: function (filters) {
      return exportUrl('/admin/users/export', filters);
    }
  };

  function queryString(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function exportUrl(path, filters) {
    var base = (window.MYCONFIG && window.MYCONFIG.apiBase) || '/v1';
    var parts = [];
    Object.keys(filters || {}).forEach(function (k) {
      var v = filters[k];
      if (v !== undefined && v !== null && v !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    });
    return base + path + (parts.length ? '?' + parts.join('&') : '');
  }

  window.MYAPI = API;
})();

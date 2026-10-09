// Mutfaktan Yarına - İstemci Yapılandırması
(function () {
  'use strict';

  var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
  var port = (typeof window !== 'undefined' && window.location && window.location.port) || '';
  var search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
  var isLocal = host === '127.0.0.1' || host === 'localhost';

  var explicitBase = null;
  if (typeof window !== 'undefined') {
    // Elle API adresi (window.__API_BASE__ / localStorage) yalnızca yerel geliştirmede geçerli:
    // canlıda XSS ile kalıcı olarak başka sunucuya yönlendirmeyi engeller.
    if (isLocal) {
      if (window.__API_BASE__) {
        explicitBase = window.__API_BASE__;
      } else {
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('MY_API_BASE')) {
            explicitBase = localStorage.getItem('MY_API_BASE');
          }
        } catch (e) {}
      }
    }
    if (!explicitBase && (search.indexOf('api=') !== -1 || /[?&]api(&|$)/.test(search))) {
      var match = search.match(/[?&]api=([^&]+)/);
      if (match && match[1]) {
        var param = decodeURIComponent(match[1]);
        if (param === '1' || param === 'true' || param === 'local') {
          explicitBase = 'http://' + (isLocal ? host : '127.0.0.1') + ':4666/v1';
        } else if (param === 'prod' || param === 'live') {
          explicitBase = 'https://api.mutfaktanyarina.com/v1';
        } else if (param === '/v1' || param === '/v1/') {
          explicitBase = '/v1';
        } else {
          try {
            var parsed = new URL(param, window.location.href);
            var isAllowedOrigin = (
              parsed.origin === 'http://127.0.0.1:4666' ||
              parsed.origin === 'http://localhost:4666' ||
              parsed.origin === 'https://api.mutfaktanyarina.com'
            );
            if (isAllowedOrigin) {
              explicitBase = parsed.origin + (parsed.pathname === '/' ? '/v1' : parsed.pathname.replace(/\/+$/, ''));
            }
          } catch (e) {}
        }
      } else {
        explicitBase = 'http://127.0.0.1:4666/v1';
      }
    }
  }

  var defaultApiBase = '';
  if (explicitBase) {
    defaultApiBase = explicitBase;
  } else if (!isLocal) {
    if (host === 'mutfaktanyarina.com' || host === 'www.mutfaktanyarina.com') {
      defaultApiBase = 'https://api.mutfaktanyarina.com/v1';
    } else {
      defaultApiBase = '/v1';
    }
  } else if (port === '8099') {
    // Geliştirme portu (allowed_origins eşleşmesi). Oturum çerezi SameSite=Lax olduğundan API,
    // sayfayla aynı ana makine adından çağrılmalı: localhost ile 127.0.0.1 farklı site sayılır.
    defaultApiBase = 'http://' + host + ':4666/v1';
  } else if (port === '4666') {
    defaultApiBase = '/v1';
  } else {
    // Test veya doğrudan statik sunucu: API çevrimdışı mod
    defaultApiBase = '';
  }

  // Doğrulama belgesi türleri (sunucu türleri: tax, sgk, id). Hangi türlerin zorunlu olduğu program kuralıdır;
  // müşteri netleştirince yalnızca bu listeye satır eklenir/çıkarılır.
  var verificationKinds = [
    { kind: 'tax', label: 'Vergi Levhası / Kooperatif Kayıtları', required: true },
    { kind: 'sgk', label: 'SGK Hizmet Dökümü', required: false },
    { kind: 'id', label: 'Kimlik Fotokopisi', required: false }
  ];

  window.MYCONFIG = Object.assign({
    apiBase: defaultApiBase,
    verificationKinds: verificationKinds
  }, window.MYCONFIG || {});
})();

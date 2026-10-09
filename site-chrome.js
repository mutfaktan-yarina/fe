// site-chrome.js - Herkese açık sayfaların ortak üst menü davranışı (partials/header-public.html).
// Mobil menüyü aç/kapa: düğme, menü dışına tıklama, menü bağlantısına tıklama ve Esc. `defer` ile yüklenir.
document.addEventListener('DOMContentLoaded', () => {
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (!mobileToggle || !navMenu) return;

  function closeMenu() {
    mobileToggle.classList.remove('active');
    mobileToggle.setAttribute('aria-expanded', 'false');
    navMenu.classList.remove('mobile-open');
  }

  mobileToggle.addEventListener('click', () => {
    const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
    mobileToggle.setAttribute('aria-expanded', String(!isExpanded));
    mobileToggle.classList.toggle('active');
    navMenu.classList.toggle('mobile-open');
  });

  // Menü dışına tıklandığında kapat
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !mobileToggle.contains(e.target) && navMenu.classList.contains('mobile-open')) {
      closeMenu();
    }
  });

  // Esc: menüyü kapat, odağı düğmeye geri ver
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('mobile-open')) {
      closeMenu();
      mobileToggle.focus();
    }
  });

  // Mobil menü bağlantısına tıklandığında kapat
  navMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
});

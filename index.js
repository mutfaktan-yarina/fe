// index.js - Mutfaktan Yarına Ana Sayfa Etkileşim Scripti (üst menü davranışı: site-chrome.js)

document.addEventListener('DOMContentLoaded', () => {
  // Scrollspy & Sekmeler Arası Gezinti (Yan Menü ve Sticky Subnav)
  const sectionEls = ['proje-hakkinda', 'msa-egitimi', 'hibe-destegi', 'program-takvimi']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  // Mobil sekme çubuğu ve masaüstü yan menü bağlantıları (ikisi de data-target taşır)
  const navLinks = document.querySelectorAll('a[data-target]');
  const headerEl = document.querySelector('.main-header');
  const subnavEl = document.getElementById('subnav-bar');

  // Sabit üst alan yüksekliği: ana başlık + (yalnızca mobilde görünen) sekme barı.
  // Sekme barı masaüstünde display:none olduğundan offsetHeight 0 döner.
  function getStickyOffset() {
    return (headerEl ? headerEl.offsetHeight : 0) + (subnavEl ? subnavEl.offsetHeight : 0);
  }

  function getTargetId(elem) {
    if (!elem) return '';
    return elem.getAttribute('data-target') || 
           elem.getAttribute('data-section') || 
           (elem.getAttribute('href') || '').replace('#', '');
  }

  function updateActiveTabs(activeId) {
    navLinks.forEach(link => {
      link.classList.toggle('active', getTargetId(link) === activeId);
    });
  }

  // Scroll Olayı Dinleme (Scrollspy)
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollPosition = window.scrollY + getStickyOffset() + 60;
        let currentSectionId = sectionEls.length ? sectionEls[0].id : '';

        for (const el of sectionEls) {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (scrollPosition >= top && scrollPosition < top + el.offsetHeight) {
            currentSectionId = el.id;
            break;
          } else if (scrollPosition >= top) {
            currentSectionId = el.id;
          }
        }

        updateActiveTabs(currentSectionId);
        ticking = false;
      });
      ticking = true;
    }
  });

  // Tıklamayla Yumuşak Kaydırma (Sticky Subnav & Sol Yan Menü)
  function smoothScrollTo(targetId, e) {
    if (e) e.preventDefault();
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      const headerOffset = getStickyOffset() + 15;
      const elementPosition = targetEl.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      updateActiveTabs(targetId);
      if (history.pushState) {
        history.pushState(null, null, '#' + targetId);
      }
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = getTargetId(link);
      if (targetId) smoothScrollTo(targetId, e);
    });
  });
});

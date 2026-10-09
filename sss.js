document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('inp-search');
  const filterPills = document.querySelectorAll('button[data-cat]');
  const countTotal = document.getElementById('count-total');
  const filterLabel = document.getElementById('filter-label');
  const noResults = document.getElementById('no-results');

  let activeCategory = 'all';
  let searchQuery = '';

  // Cache card text to avoid recalculation on each keystroke
  const cardCache = new Map();

  const catLabels = {
    all: 'Tüm Kategoriler',
    uygunluk: 'Uygunluk & Başvuru',
    msa: 'MSA Eğitimi & Sertifika',
    puanlama: 'Puanlama & Jüri',
    hibe: 'Hibe & Destekler'
  };

  function filterCards() {
    const faqCards = document.querySelectorAll('.faq-card');
    let visibleCount = 0;

    faqCards.forEach(card => {
      const cardCat = card.getAttribute('data-cat');

      // Use cached text or cache it now
      if (!cardCache.has(card)) {
        cardCache.set(card, card.textContent.toLocaleLowerCase('tr-TR'));
      }
      const text = cardCache.get(card);

      const matchesCat = activeCategory === 'all' || cardCat === activeCategory;
      const matchesSearch = !searchQuery || text.includes(searchQuery);

      if (matchesCat && matchesSearch) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    if (countTotal) countTotal.textContent = visibleCount;
    if (filterLabel) filterLabel.textContent = catLabels[activeCategory] || 'Kategori';

    if (noResults) {
      if (visibleCount === 0) {
        noResults.classList.add('active');
      } else {
        noResults.classList.remove('active');
      }
    }
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');
      activeCategory = pill.getAttribute('data-cat') || 'all';
      filterCards();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLocaleLowerCase('tr-TR');
      filterCards();
    });
  }

  // Set up accordion and aria-expanded toggle
  document.addEventListener('click', (e) => {
    if (e.target.closest('.faq-question')) {
      const button = e.target.closest('.faq-question');
      const card = button.closest('.faq-card');
      if (card) {
        card.classList.toggle('open');
        const isExpanded = card.classList.contains('open');
        button.setAttribute('aria-expanded', isExpanded);
      }
    }
  });

  // Initialize aria-expanded for initially open cards
  const faqCards = document.querySelectorAll('.faq-card');
  faqCards.forEach(card => {
    const button = card.querySelector('.faq-question');
    if (button) {
      const isOpen = card.classList.contains('open');
      button.setAttribute('aria-expanded', isOpen);
    }
  });

  filterCards();
});

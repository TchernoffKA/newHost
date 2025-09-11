document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Мобильное меню
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if (burger && nav) {
    const toggle = () => {
      const expanded = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('open');
      document.body.style.overflow = expanded ? '' : 'hidden';
    };
    burger.addEventListener('click', toggle);
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      if (window.innerWidth <= 640 && nav.classList.contains('open')) toggle();
    }));
  }

  // Плавный скролл
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', targetId);
      }
    });
  });

  // Активная ссылка при скролле
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
  const byId = id => navLinks.find(a => a.getAttribute('href') === `#${id}`);
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(a => a.classList.remove('active'));
        const link = byId(id);
        if (link) link.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0.01 });
  sections.forEach(s => io.observe(s));

  // CTA форма (демо-режим)
  const form = document.getElementById('ctaForm');
  const note = document.getElementById('ctaNote');
  if (form && note) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        note.style.color = '#ff7a59';
        note.textContent = 'Проверь e‑mail и попробуй снова.';
        return;
      }
      note.style.color = 'var(--secondary)';
      note.textContent = 'Отправляем…';
      await new Promise(r => setTimeout(r, 900));
      note.textContent = 'Готово! Проверь почту, мы прислали инструкцию.';
      form.reset();
    });
  }
});



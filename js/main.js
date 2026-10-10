/* ==========================================================================
   Lumen Dental — интерактив
   Чистый JS без библиотек. Каждый блок — отдельная функция init*,
   поэтому любую можно отключить или переиспользовать.
   ========================================================================== */

import { bind as niceSelect } from './vendor/nice-select2.esm.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Header: фон при скролле ---------- */
function initHeader() {
  const header = $('[data-header]');
  if (!header) return;
  let ticking = false;
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
}

/* ---------- Мобильное меню ---------- */
function initMenu() {
  const burger = $('[data-burger]');
  const nav = $('[data-nav]');
  if (!burger || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    document.body.classList.toggle('is-locked', open);
    // Меню светлое, а шапка над hero — белая: на время меню переключаем шапку в тёмную
    $('[data-header]').classList.toggle('is-menu-open', open);
  };

  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a, button')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); }
  });
  window.matchMedia('(min-width: 64em)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

/* ---------- Слайдеры: нативный scroll-snap + стрелки + drag мышью ---------- */
function initSliders() {
  $$('[data-slider]').forEach((track) => {
    const nav = $(`[data-slider-nav="${track.dataset.slider}"]`);
    const prev = nav && $('[data-slider-prev]', nav);
    const next = nav && $('[data-slider-next]', nav);

    const step = () => {
      const card = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    };

    const updateButtons = () => {
      if (!prev || !next) return;
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
      nav.hidden = max <= 0; // всё влезло — стрелки не нужны
    };

    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    track.addEventListener('scroll', () => requestAnimationFrame(updateButtons), { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();

    // Перетаскивание мышью на десктопе (на тачах работает нативный свайп)
    let startX = 0, startScroll = 0, dragging = false, moved = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true; moved = false;
      startX = e.clientX; startScroll = track.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5 && !moved) {
        moved = true;
        track.style.scrollSnapType = 'none';
        track.style.cursor = 'grabbing';
      }
      if (moved) track.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      track.style.cursor = '';
      if (moved) {
        // Возвращаем snap, чтобы карточка «докатилась» до ближайшей позиции
        const target = Math.round(track.scrollLeft / step()) * step();
        track.style.scrollSnapType = '';
        track.scrollTo({ left: target, behavior: 'smooth' });
      }
    });
    // Если тянули — не считаем это кликом по кнопке внутри карточки
    track.addEventListener('click', (e) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    track.addEventListener('dragstart', (e) => e.preventDefault());
  });
}

/* ---------- До/после: шторка ---------- */
function initCompare() {
  $$('[data-compare]').forEach((box) => {
    const range = $('[data-compare-range]', box);
    const setPos = (value) => {
      const v = Math.min(100, Math.max(0, value));
      box.style.setProperty('--pos', `${v}%`);
      range.value = v;
    };

    // Клавиатура и скринридеры — через нативный input[type=range]
    range.addEventListener('input', () => setPos(+range.value));

    // Мышь и тач — через pointer events. Тянуть можно за любую точку фото,
    // в том числе за кружок: позиция шторки следует за курсором
    let active = false;
    const fromEvent = (e) => {
      const rect = box.getBoundingClientRect();
      setPos(((e.clientX - rect.left) / rect.width) * 100);
    };
    const stop = () => {
      active = false;
      box.classList.remove('is-dragging');
    };
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Без этого браузер запускает нативное перетаскивание картинки или выделение,
      // и pointermove перестаёт приходить — шторка «залипает»
      e.preventDefault();
      active = true;
      box.classList.add('is-dragging');
      box.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    box.addEventListener('pointermove', (e) => { if (active) fromEvent(e); });
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
  });
}

/* ---------- Табы цен (паттерн WAI-ARIA Tabs) ---------- */
function initTabs() {
  $$('[data-tabs]').forEach((root) => {
    const tabs = $$('[role="tab"]', root);

    const select = (tab, focus = true) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        $(`#${t.getAttribute('aria-controls')}`).hidden = !selected;
      });
      if (focus) tab.focus();
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in map)) return;
        e.preventDefault();
        select(tabs[(map[e.key] + tabs.length) % tabs.length]);
      });
    });
  });
}

/* ---------- FAQ-аккордеон ---------- */
function initAccordion() {
  $$('[data-accordion]').forEach((root) => {
    const triggers = $$('.accordion__trigger', root);
    const setOpen = (btn, open) => {
      btn.setAttribute('aria-expanded', String(open));
      $(`#${btn.getAttribute('aria-controls')}`).classList.toggle('is-open', open);
    };
    triggers.forEach((btn) => {
      btn.addEventListener('click', () => {
        const willOpen = btn.getAttribute('aria-expanded') !== 'true';
        triggers.forEach((other) => setOpen(other, false)); // открыт только один
        setOpen(btn, willOpen);
      });
    });
  });
}

/* ---------- Карта: грузим iframe, только когда секция рядом ---------- */
function initMap() {
  const map = $('[data-map]');
  if (!map) return;
  const load = () => {
    const iframe = document.createElement('iframe');
    iframe.src = map.dataset.src;
    iframe.title = 'Карта: Lumen Dental, Москва, ул. Малая Бронная, 28';
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.addEventListener('load', () => $('.map__placeholder', map)?.remove());
    map.append(iframe);
  };
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { load(); io.disconnect(); }
  }, { rootMargin: '400px' });
  io.observe(map);
}

/* ==========================================================================
   ФОРМА ЗАПИСИ
   ========================================================================== */

/* Маска телефона: +7 (999) 123-45-67 */
function formatPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits[0] !== '7') digits = '7' + digits;
  digits = digits.slice(0, 11);

  const d = digits.slice(1);
  let out = '+7';
  if (d.length) out += ' (' + d.slice(0, 3);
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ' ' + d.slice(3, 6);
  if (d.length > 6) out += '-' + d.slice(6, 8);
  if (d.length > 8) out += '-' + d.slice(8, 10);
  return out;
}

function initPhoneMask(input) {
  input.addEventListener('input', (e) => {
    const prevDigits = input.dataset.digits || '';
    let digits = input.value.replace(/\D/g, '');
    // Стёрли скобку или дефис — стираем и цифру перед ним, иначе каретка «застрянет»
    if (e.inputType === 'deleteContentBackward' && digits === prevDigits) digits = digits.slice(0, -1);
    input.value = digits.length <= 1 && e.inputType?.startsWith('delete') ? '' : formatPhone(digits);
    input.dataset.digits = input.value.replace(/\D/g, '');
  });
  input.addEventListener('focus', () => {
    if (input.value) return;
    input.value = '+7 (';
    // Клик ставит каретку туда, куда нажали (в начало пустого поля) уже после focus,
    // поэтому переносим её в конец на следующем кадре
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  });
  input.addEventListener('blur', () => { if (input.value.replace(/\D/g, '').length <= 1) input.value = ''; });
}

/* Склонение: 1 цифру, 2 цифры, 5 цифр */
function plural(n, [one, few, many]) {
  const mod10 = n % 10, mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${n} ${word}`;
}

/* Правила валидации: возвращают текст ошибки или пустую строку */
const validators = {
  name(value) {
    const v = value.trim();
    if (!v) return 'Введите имя, чтобы администратор знал, как к вам обращаться';
    if (v.length < 2) return 'Имя должно быть не короче двух букв';
    if (!/^[A-Za-zА-Яа-яЁё\s'-]+$/.test(v)) return 'Используйте только буквы';
    return '';
  },
  phone(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 1) return 'Введите номер телефона';
    if (digits.length < 11) return `Номер неполный: введите ещё ${plural(11 - digits.length, ['цифру', 'цифры', 'цифр'])}`;
    return '';
  },
  consent(_, input) {
    return input.checked ? '' : 'Отметьте согласие, чтобы мы могли вам перезвонить';
  },
};

function initForm(form) {
  const wrap = form.closest('[data-form-wrap]');
  const success = $('[data-form-success]', wrap);
  const alertBox = $('[data-form-alert]', form);
  const submit = $('[data-submit]', form);
  const fields = $$('input[name="name"], input[name="phone"], input[name="consent"]', form);

  initPhoneMask($('[data-phone-mask]', form));

  // Кастомный выпадающий список вместо нативного select.
  // Нативный select остаётся в DOM (скрыт) и по-прежнему уходит в FormData
  const select = $('[data-service-select]', form);
  if (select) {
    niceSelect(select, { searchable: false, placeholder: 'Выберите услугу' });
    const custom = select.nextElementSibling;
    const label = $(`label[for="${select.id}"]`, form);
    if (custom && label) custom.setAttribute('aria-label', label.textContent.trim());
  }

  const validate = (input) => {
    const message = validators[input.name](input.value, input);
    const box = input.closest('.field, .checkbox-field');
    const errorEl = $('.field__error', box);
    box.classList.toggle('is-invalid', !!message);
    box.classList.toggle('is-valid', !message && input.type !== 'checkbox');
    input.setAttribute('aria-invalid', String(!!message));
    errorEl.textContent = message;
    return !message;
  };

  fields.forEach((input) => {
    // Ошибку показываем после ухода с поля, а не на первом же символе
    input.addEventListener('blur', () => { if (input.value || input.dataset.touched) validate(input); });
    input.addEventListener('input', () => { input.dataset.touched = '1'; if (input.closest('.is-invalid, .is-valid')) validate(input); });
    input.addEventListener('change', () => { if (input.type === 'checkbox') validate(input); });
  });

  const setBusy = (busy) => {
    form.classList.toggle('is-busy', busy);
    submit.disabled = busy;
    submit.classList.toggle('is-loading', busy);
    form.setAttribute('aria-busy', String(busy));
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.hidden = true;

    const results = fields.map(validate);
    if (results.includes(false)) {
      fields[results.indexOf(false)].focus();
      return;
    }

    setBusy(true);
    const data = Object.fromEntries(new FormData(form));

    try {
      await fakeRequest(data);
      const name = data.name.trim().split(' ')[0];
      $('[data-success-text]', success).textContent =
        `${name}, администратор позвонит на номер ${data.phone.replace(/ /g, '\u00a0')} в течение 15 минут, чтобы подтвердить время приёма.`;
      form.hidden = true;
      success.hidden = false;
      success.focus();
    } catch {
      alertBox.hidden = false;
    } finally {
      setBusy(false);
    }
  });

  $('[data-form-reset]', wrap).addEventListener('click', () => resetForm(form));
}

function resetForm(form) {
  const wrap = form.closest('[data-form-wrap]');
  form.reset();
  // Сообщаем nice-select, что значение select сбросилось, — он перерисуется
  $('[data-service-select]', form)?.dispatchEvent(new Event('change'));
  $$('.is-valid, .is-invalid', form).forEach((el) => el.classList.remove('is-valid', 'is-invalid'));
  $$('.field__error', form).forEach((el) => { el.textContent = ''; });
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('[data-touched]', form).forEach((el) => delete el.dataset.touched);
  $('[data-form-alert]', form).hidden = true;
  $('[data-form-success]', wrap).hidden = true;
  form.hidden = false;
}

/* Имитация отправки. Бэкенда нет (GitHub Pages — статика), поэтому:
   — нет сети → ошибка отправки;
   — имя «Ошибка» → тоже ошибка, чтобы показать это состояние на демо. */
function fakeRequest(data) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!navigator.onLine || /ошибка/i.test(data.name)) reject(new Error('Network error'));
      else resolve();
    }, 1400);
  });
}

/* ---------- Модалка записи + клонирование формы ---------- */
function initBooking() {
  const sectionWrap = $('#booking [data-form-wrap]');
  const modal = $('[data-modal]');
  const modalSlot = $('[data-modal-form]');
  if (!sectionWrap || !modal) return;

  // Клонируем форму из секции в модалку, меняя id, чтобы они не дублировались
  const clone = sectionWrap.cloneNode(true);
  $$('[id]', clone).forEach((el) => { el.id = `m-${el.id}`; });
  $$('[for]', clone).forEach((el) => el.setAttribute('for', `m-${el.getAttribute('for')}`));
  $$('[aria-describedby]', clone).forEach((el) => el.setAttribute('aria-describedby', `m-${el.getAttribute('aria-describedby')}`));
  modalSlot.append(clone);

  $$('[data-booking-form]').forEach(initForm);

  const modalForm = $('[data-booking-form]', modal);
  const context = $('[data-form-context]', modal);
  const title = $('#modal-title');

  const open = (trigger) => {
    resetForm(modalForm);
    const { service, doctor } = trigger.dataset;
    if (service) {
      const select = $('[data-service-select]', modalForm);
      select.value = service;
      select.dispatchEvent(new Event('change')); // синхронизируем кастомный список
    }
    context.hidden = !doctor;
    context.textContent = doctor ? `Врач: ${doctor}` : '';
    title.textContent = doctor ? 'Визит к врачу' : service && service !== 'Консультация' ? `Визит: ${service.toLowerCase()}` : 'Бронирование визита';

    modal.showModal();
    document.body.classList.add('is-locked');
    // На тачах не открываем клавиатуру сразу — это раздражает
    if (window.matchMedia('(hover: hover)').matches) $('input[name="name"]', modalForm).focus();
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-booking-open]');
    if (trigger) open(trigger);
  });

  $('[data-modal-close]', modal).addEventListener('click', () => modal.close());
  // Клик по подложке: событие приходит на сам <dialog>, а не на его содержимое
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => document.body.classList.remove('is-locked'));
}

/* ---------- Плавающая кнопка: после hero и пока не видна форма ---------- */
function initFloatCta() {
  const cta = $('[data-float-cta]');
  const hero = $('.hero');
  const hideZones = [$('#booking'), $('.footer')].filter(Boolean);
  if (!cta || !hero) return;

  const state = { pastHero: false, inHideZone: new Set() };
  const render = () => cta.classList.toggle('is-visible', state.pastHero && state.inHideZone.size === 0);

  new IntersectionObserver(([entry]) => {
    state.pastHero = !entry.isIntersecting;
    render();
  }, { rootMargin: '-40% 0px 0px 0px' }).observe(hero);

  const zoneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.isIntersecting ? state.inHideZone.add(entry.target) : state.inHideZone.delete(entry.target);
    });
    render();
  });
  hideZones.forEach((z) => zoneObserver.observe(z));
}

/* ---------- Появление блоков при скролле ----------
   Блок с классом .reveal получает .is-visible, когда хотя бы 15% его в экране,
   и теряет, когда уходит, — анимация повторяется при каждом возвращении.
   При «уменьшить движение» или без IntersectionObserver показываем всё сразу */
function initReveal() {
  const items = $$('.reveal');
  if (!items.length) return;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting));
  }, { threshold: 0.15 });

  items.forEach((el) => observer.observe(el));
}

/* ---------- Карточки услуг на тачах ----------
   Ховера нет, поэтому раскрываем карточку, которая стоит у левого края трека
   (там, куда её доводит scroll-snap). Свайпнула — раскрылась следующая.
   Тап по свёрнутой карточке докручивает её к краю, и она раскрывается */
function initServiceCards() {
  if (!window.matchMedia('(hover: none)').matches) return;
  const track = $('[data-slider="services"]');
  if (!track) return;
  const cards = $$('.service-card', track);

  const update = () => {
    const anchor = track.getBoundingClientRect().left
      + (parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0);
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    let active = cards[cards.length - 1];
    if (!atEnd) {
      let min = Infinity;
      cards.forEach((card) => {
        const d = Math.abs(card.getBoundingClientRect().left - anchor);
        if (d < min) { min = d; active = card; }
      });
    }
    cards.forEach((card) => card.classList.toggle('is-active', card === active));
  };

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(() => { update(); ticking = false; }); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', update);

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (card.classList.contains('is-active')) return;
      e.preventDefault();
      card.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    });
  });

  update();
}

/* ---------- Пауза фоновой анимации hero вне экрана ---------- */
function initHeroPause() {
  const hero = $('.hero');
  if (!hero) return;
  new IntersectionObserver(([entry]) => {
    hero.classList.toggle('is-offscreen', !entry.isIntersecting);
  }).observe(hero);
}

/* ---------- Старт ---------- */
initHeader();
initMenu();
initSliders();
initCompare();
initTabs();
initAccordion();
initMap();
initBooking();
initFloatCta();
initHeroPause();
initReveal();
initServiceCards();
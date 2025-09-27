/**
 * Приложение ToDo для Telegram Mini App и обычного браузера
 * - Хранение задач в LocalStorage и (опционально) в Telegram CloudStorage
 * - Поддержка тем Telegram и тактильного отклика
 * - Редактирование, фильтрация и массовые действия над задачами
 */
class TodoApp {
  constructor() {
    this.tasks = [];
    this.currentFilter = 'all';
    this.editingTaskId = null;
    this.tgUser = null;
    this.storage = new TaskStorage();
    this.projects = [];
    this.tags = [];
    this.projectMap = new Map(); // id -> project
    this.tagMap = new Map(); // id -> tag
    
    this.init();
  }

  init() {
    this.initTelegram();
    this.loadTasks();
    this.bindEvents();
    this.render();
    this.initConnectivity();
    this.bootstrapRemote();
  }

  // Инициализация Telegram WebApp (если доступен)
  initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      
      // Развернуть приложение на всю высоту экрана внутри Telegram
      tg.expand();
      
      // Применить тему Telegram к CSS‑переменным
      this.applyTelegramTheme(tg.themeParams);
      
      // Получить данные пользователя Telegram (если доступны)
      this.tgUser = tg.initDataUnsafe?.user;
      if (this.storage) {
        this.storage.setUser(this.tgUser);
      }
      this.updateUserInfo();
      
      // Настроить основную кнопку Telegram (MainButton)
      tg.MainButton.setText('Добавить задачу');
      tg.MainButton.onClick(() => {
        this.openAddModal();
      });
      
      // Показывать основную кнопку только при фокусе в поле ввода
      const taskInput = document.getElementById('taskInput');
      if (taskInput) {
        taskInput.addEventListener('focus', () => {
          tg.MainButton.show();
        });
        taskInput.addEventListener('blur', () => {
          if (!taskInput.value.trim()) {
            tg.MainButton.hide();
          }
        });
      }
      
      // Обработка системной кнопки «Назад» в Telegram
      tg.BackButton.onClick(() => {
        if (this.editingTaskId) {
          this.cancelEditing();
          tg.BackButton.hide();
        }
      });
      
      // Включить подтверждение закрытия мини‑приложения
      tg.enableClosingConfirmation();
      
      console.log('Telegram WebApp initialized', tg.version);
    } else {
      console.log('Not running in Telegram WebApp');
      // Режим работы в обычном браузере (без Telegram)
      if (this.storage) {
        this.storage.setUser(null);
      }
      this.updateUserInfo();
    }
  }

  /**
   * Применяет цвета темы Telegram к CSS‑переменным документа
   * @param {object} themeParams параметры темы Telegram
   */
  applyTelegramTheme(themeParams) {
    if (!themeParams) return;
    
    const root = document.documentElement;
    
    // Сопоставление ключей темы Telegram с CSS‑переменными
    const themeMap = {
      'bg_color': '--tg-theme-bg-color',
      'text_color': '--tg-theme-text-color',
      'hint_color': '--tg-theme-hint-color',
      'link_color': '--tg-theme-link-color',
      'button_color': '--tg-theme-button-color',
      'button_text_color': '--tg-theme-button-text-color',
      'secondary_bg_color': '--tg-theme-secondary-bg-color'
    };
    
    Object.entries(themeParams).forEach(([key, value]) => {
      const cssVar = themeMap[key];
      if (cssVar && value) {
        root.style.setProperty(cssVar, value);
      }
    });
    
    // Установить фон body в цвет темы Telegram
    document.body.style.backgroundColor = themeParams.bg_color || '#ffffff';
  }

  /**
   * Обновляет отображение информации о пользователе (имя и аватар)
   */
  updateUserInfo() {
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (this.tgUser) {
      const displayName = this.tgUser.first_name + (this.tgUser.last_name ? ` ${this.tgUser.last_name}` : '');
      userNameEl.textContent = displayName;
      
      // В качестве аватара используем первую букву имени
      if (this.tgUser.first_name) {
        userAvatarEl.textContent = this.tgUser.first_name.charAt(0).toUpperCase();
      }
      
      // Загрузить задачи, привязанные к пользователю Telegram
      this.loadUserTasks();
    } else {
      userNameEl.textContent = 'Гость';
      userAvatarEl.textContent = '👤';
    }
  }

  /**
   * Возвращает ключ хранилища для текущего пользователя
   */
  getUserStorageKey() { /* удалено как неиспользуемое */ }

  async bootstrapRemote() {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg?.initData) return;
      // load projects and tags in parallel
      const headers = { 'x-telegram-init-data': tg.initData };
      const [prj, tgs] = await Promise.all([
        fetch('/api/projects', { headers }).then(r => r.ok ? r.json() : []),
        fetch('/api/tags', { headers }).then(r => r.ok ? r.json() : [])
      ]);
      this.projects = Array.isArray(prj) ? prj : [];
      this.tags = Array.isArray(tgs) ? tgs : [];
      this.projectMap = new Map(this.projects.map(p => [String(p.id), p]));
      this.tagMap = new Map(this.tags.map(t => [String(t.id), t]));
    } catch (_) {}
  }

  // Привязка обработчиков событий интерфейса
  bindEvents() {
    // Форма добавления задачи (скрытая)
    const addTaskForm = document.getElementById('addTaskForm');
    if (addTaskForm) {
      addTaskForm.addEventListener('submit', (e) => this.handleAddTask(e));
    }

    // Кнопки фильтров (Все/Активные/Выполненные)
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleFilterChange(e));
    });
    const projectFilter = document.getElementById('projectFilter');
    if (projectFilter) projectFilter.addEventListener('change', () => this.render());
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) tagFilter.addEventListener('change', () => this.render());

    // Кнопка «Очистить выполненные»
    const clearCompletedBtn = document.getElementById('clearCompleted');
    clearCompletedBtn.addEventListener('click', () => this.clearCompleted());

    // Кнопка «Поделиться прогрессом»
    const shareProgressBtn = document.getElementById('shareProgress');
    shareProgressBtn.addEventListener('click', () => this.shareProgress());

    // Делегирование событий в списке задач (клики/клавиатура/blur)
    const taskList = document.getElementById('taskList');
    taskList.addEventListener('click', (e) => this.handleTaskAction(e));
    taskList.addEventListener('keydown', (e) => this.handleTaskKeydown(e));
    taskList.addEventListener('blur', (e) => this.handleTaskBlur(e), true);

    // FAB + Modal
    const openFab = document.getElementById('openAddTaskModal');
    const modal = document.getElementById('addTaskModal');
    const closeBtn = document.getElementById('closeAddTaskModal');
    const cancelBtn = document.getElementById('cancelAddTask');
    const modalForm = document.getElementById('modalAddTaskForm');
    const clearDtBtn = document.getElementById('clearModalDatetime');
    const charCounter = document.getElementById('modalCharCounter');
    const modalText = document.getElementById('modalTaskInput');
    const presetContainer = document.querySelector('.modal__presets');
    const submitBtn = document.getElementById('modalAddSubmit');
    const openDateBtn = document.getElementById('openDatePicker');
    const openTimeBtn = document.getElementById('openTimePicker');
    // FAB открывает модалку даже если часть элементов временно не доступна
    if (openFab) {
      openFab.addEventListener('click', () => this.openAddModal());
    }
    if (modal && closeBtn && cancelBtn) {
      closeBtn.addEventListener('click', () => this.closeAddModal());
      cancelBtn.addEventListener('click', () => this.closeAddModal());
      modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal__backdrop')) this.closeAddModal();
      });
    }
    if (modalForm) {
      modalForm.addEventListener('submit', (e) => this.handleModalAddTask(e));
      // заполняем список проектов
      this.populateProjectsSelect();
    }
      if (clearDtBtn) clearDtBtn.addEventListener('click', () => {
        const dt = document.getElementById('modalTaskDatetime');
        if (dt) dt.value = '';
      });

      if (modalText && charCounter) {
        const updateCounter = () => {
          charCounter.textContent = `${modalText.value.length}/200`;
          if (submitBtn) submitBtn.disabled = modalText.value.trim().length === 0;
        };
        modalText.addEventListener('input', updateCounter);
        updateCounter();
      }

      if (presetContainer) {
        presetContainer.addEventListener('click', (e) => {
          const btn = e.target.closest('.preset');
          if (!btn) return;
          // toggle active preset
          [...presetContainer.querySelectorAll('.preset')].forEach(b => b.classList.remove('preset--active'));
          btn.classList.add('preset--active');
          const dt = document.getElementById('modalTaskDatetime');
          if (!dt) return;
          const now = new Date();
          let target = new Date(now);
          switch (btn.dataset.preset) {
            case 'plus1h':
              target.setHours(target.getHours() + 1);
              break;
            case 'todayEvening':
              target.setHours(19, 0, 0, 0);
              break;
            case 'tomorrowMorning':
              target.setDate(target.getDate() + 1);
              target.setHours(9, 0, 0, 0);
              break;
            case 'weekend': {
              const day = target.getDay();
              const delta = (6 - day + 7) % 7; // суббота
              target.setDate(target.getDate() + (delta || 7));
              target.setHours(11, 0, 0, 0);
              break;
            }
          }
          // Записываем в человекочитаемом формате поля
          dt.value = this.formatFieldDatetime(target);
        });
      }

      // Close on Esc
      // перенесено в openAddModal, чтобы не плодить глобальный слушатель

      // Swipe-to-close
      const dialog = modal.querySelector('.modal__dialog');
      const backdrop = modal.querySelector('.modal__backdrop');
      if (dialog && backdrop) {
        let startY = 0;
        let currentY = 0;
        let dragging = false;
        const threshold = 80;

        const onTouchStart = (ev) => {
          if (ev.touches.length !== 1) return;
          dragging = true;
          startY = ev.touches[0].clientY;
          currentY = startY;
        };
        const onTouchMove = (ev) => {
          if (!dragging) return;
          currentY = ev.touches[0].clientY;
          const delta = Math.max(0, currentY - startY);
          dialog.style.transform = `translate(-50%, ${delta}px)`;
          backdrop.style.opacity = String(Math.max(0, 1 - delta / 200));
        };
        const onTouchEnd = () => {
          if (!dragging) return;
          const delta = Math.max(0, currentY - startY);
          dragging = false;
          if (delta > threshold) {
            this.closeAddModal();
          } else {
            // revert
            dialog.style.transform = '';
            backdrop.style.opacity = '';
          }
        };

        dialog.addEventListener('touchstart', onTouchStart, { passive: true });
        dialog.addEventListener('touchmove', onTouchMove, { passive: true });
        dialog.addEventListener('touchend', onTouchEnd, { passive: true });
      }

      // Date/Time pickers
      if (openDateBtn) openDateBtn.addEventListener('click', () => this.openDatePicker());
      if (openTimeBtn) openTimeBtn.addEventListener('click', () => this.openTimePicker());
    }

  // --- Connectivity & Sync UI ---
  initConnectivity() {
    const statusEl = document.getElementById('appStatus');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const statusSync = document.getElementById('statusSync');
    if (!statusEl || !statusText || !statusDot || !statusSync) return;

    const applyOnline = () => {
      statusEl.classList.remove('header__status--offline');
      statusText.textContent = 'Онлайн';
      statusSync.hidden = true;
    };
    const applyOffline = () => {
      statusEl.classList.add('header__status--offline');
      statusText.textContent = 'Офлайн';
      statusSync.hidden = true;
      this.showNotification('Вы офлайн. Изменения сохранятся локально и будут синхронизированы позже.');
    };
    const applySyncing = () => {
      statusEl.classList.add('header__status--syncing');
      statusSync.hidden = false;
    };
    const clearSyncing = () => {
      statusEl.classList.remove('header__status--syncing');
      statusSync.hidden = true;
    };

    // initial
    if (navigator.onLine) applyOnline(); else applyOffline();

    // network events
    window.addEventListener('online', () => {
      applyOnline();
      // при возврате сети попробуем триггернуть мягкую синхронизацию (если поддерживается)
      this.trySync();
    });
    window.addEventListener('offline', applyOffline);

    // custom sync events from storage
    window.addEventListener('sync:start', applySyncing);
    window.addEventListener('sync:success', () => {
      clearSyncing();
      this.showNotification('Синхронизация завершена');
    });
    window.addEventListener('sync:error', (e) => {
      clearSyncing();
      const msg = e.detail?.message || 'Синхронизация не удалась';
      this.showNotification(msg);
    });
  }

  trySync() {
    // В текущей реализации синхронизация = запись в Telegram CloudStorage при saveTasks, 
    // и чтение из него при loadTasks. Здесь можем рефрешнуть облако.
    if (!navigator.onLine) return;
    try {
      // Пере-инициируем загрузку из облака
      this.storage.loadTasks((cloud) => {
        try {
          if (Array.isArray(cloud)) {
            this.tasks = cloud;
            this.render();
          }
        } catch (e) {
          // Ошибка применения облачных данных обрабатывается локально
        }
      });
    } catch (e) {
      // Ошибка синхронизации обрабатывается локально
    }
  }


  // ---------- Date Picker ----------
  _selectedDate = null; // Date
  openDatePicker() {
    const m = document.getElementById('datePickerModal');
    if (!m) return;
    m.classList.add('modal--open');
    document.body.style.overflow = 'hidden';
    this.renderCalendar(new Date());
    // bind controls
    const close = () => this.closeDatePicker();
    document.getElementById('closeDatePicker')?.addEventListener('click', close, { once: true });
    document.getElementById('cancelDatePicker')?.addEventListener('click', close, { once: true });
    document.getElementById('applyDatePicker')?.addEventListener('click', () => {
      if (!this._selectedDate) return close();
      this.applyDateToField();
      close();
    }, { once: true });
    m.addEventListener('click', (e) => { if (e.target.classList.contains('modal__backdrop')) close(); }, { once: true });
  }
  closeDatePicker() {
    const m = document.getElementById('datePickerModal');
    if (!m) return;
    m.classList.remove('modal--open');
    document.body.style.overflow = '';
  }
  renderCalendar(baseDate) {
    const container = document.getElementById('calendar');
    if (!container) return;
    container.innerHTML = '';
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    // header
    const header = document.createElement('div');
    header.className = 'calendar__header';
    const title = document.createElement('div');
    title.textContent = baseDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const nav = document.createElement('div');
    nav.className = 'calendar__nav';
    const prev = document.createElement('button'); prev.className = 'calendar__btn'; prev.textContent = '‹';
    const next = document.createElement('button'); next.className = 'calendar__btn'; next.textContent = '›';
    nav.append(prev, next); header.append(title, nav); container.append(header);
    prev.addEventListener('click', () => this.renderCalendar(new Date(year, month - 1, 1)));
    next.addEventListener('click', () => this.renderCalendar(new Date(year, month + 1, 1)));
    // weekdays
    const grid = document.createElement('div');
    grid.className = 'calendar__grid';
    const weekdays = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    for (let d = 0; d < 7; d++) {
      const day = new Date(2021, 7, d + 1); // arbitrary week
      const cell = document.createElement('div');
      cell.className = 'calendar__cell calendar__cell--weekday';
      cell.textContent = weekdays.format(day);
      grid.appendChild(cell);
    }
    // days
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    // prev tail
    for (let i = 0; i < startWeekday; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar__cell calendar__cell--muted';
      cell.textContent = String(prevMonthDays - startWeekday + i + 1);
      grid.appendChild(cell);
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('button');
      cell.className = 'calendar__cell calendar__cell--day';
      cell.textContent = String(d);
      const isToday = (year === todayY && month === todayM && d === todayD);
      if (isToday) cell.classList.add('calendar__cell--today');
      const isPast = new Date(year, month, d, 23, 59, 59, 999).getTime() < now.getTime();
      if (isPast) {
        cell.classList.add('calendar__cell--past');
        cell.disabled = true;
      } else {
        cell.addEventListener('click', () => {
          this._selectedDate = new Date(year, month, d);
          // highlight
          grid.querySelectorAll('.calendar__cell--selected').forEach(el => el.classList.remove('calendar__cell--selected'));
          cell.classList.add('calendar__cell--selected');
        });
      }
      grid.appendChild(cell);
    }
    // next lead to complete 6 rows (42 cells + weekdays)
    const totalCells = startWeekday + daysInMonth;
    const add = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= add; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar__cell calendar__cell--muted';
      cell.textContent = String(i);
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }
  applyDateToField() {
    const field = document.getElementById('modalTaskDatetime');
    if (!field || !this._selectedDate) return;
    const now = new Date();
    // Всегда подставляем текущее время при выборе даты
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const candidate = new Date(this._selectedDate.getTime());
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() < now.getTime() - 60 * 1000) {
      this.showNotification('Дата уже в прошлом');
      this.showHapticFeedback('warning');
      return;
    }
    this._selectedDate = candidate;
    field.value = this.formatFieldDatetime(candidate);
  }

  // ---------- Time Picker ----------
  _selectedTime = { h: null, m: null };
  openTimePicker() {
    const m = document.getElementById('timePickerModal');
    if (!m) return;
    m.classList.add('modal--open');
    document.body.style.overflow = 'hidden';
    this.renderTimePicker();
    const close = () => this.closeTimePicker();
    document.getElementById('closeTimePicker')?.addEventListener('click', close, { once: true });
    document.getElementById('cancelTimePicker')?.addEventListener('click', close, { once: true });
    document.getElementById('applyTimePicker')?.addEventListener('click', () => {
      this.applyTimeToField();
      close();
    }, { once: true });
    m.addEventListener('click', (e) => { if (e.target.classList.contains('modal__backdrop')) close(); }, { once: true });
  }
  closeTimePicker() {
    const m = document.getElementById('timePickerModal');
    if (!m) return;
    m.classList.remove('modal--open');
    document.body.style.overflow = '';
  }
  renderTimePicker() {
    const hourWheel = document.getElementById('hourWheel');
    const minuteWheel = document.getElementById('minuteWheel');
    if (!hourWheel || !minuteWheel) return;

    const ITEM_H = 36;
    const buildWheel = (wheel, values) => {
      wheel.innerHTML = '';
      wheel._values = values;
      wheel._segmentLength = values.length;
      wheel._itemHeight = ITEM_H;
      wheel._segmentHeight = ITEM_H * values.length;
      // dynamic paddings so активный элемент всегда по центру
      const pad = Math.max(0, wheel.clientHeight / 2 - ITEM_H / 2);
      wheel.style.paddingTop = `${pad}px`;
      wheel.style.paddingBottom = `${pad}px`;
      const makeItems = () => {
        const frag = document.createDocumentFragment();
        values.forEach((v) => {
          const el = document.createElement('div');
          el.className = 'timepicker__item';
          el.textContent = String(v).padStart(2, '0');
          el.dataset.value = String(v);
          frag.appendChild(el);
        });
        return frag;
      };
      // три сегмента для бесконечной прокрутки
      wheel.appendChild(makeItems());
      wheel.appendChild(makeItems());
      wheel.appendChild(makeItems());
    };

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);
    buildWheel(hourWheel, hours);
    buildWheel(minuteWheel, minutes);

    let snapping = { h: false, m: false };
    const centerToIndex = (wheel, indexInSegment, kind) => {
      const pad = parseFloat(getComputedStyle(wheel).paddingTop) || 0;
      const globalIndex = wheel._segmentLength + indexInSegment; // середина
      const targetTop = pad + globalIndex * wheel._itemHeight - (wheel.clientHeight / 2 - wheel._itemHeight / 2);
      if (kind) snapping[kind] = true;
      // моментальное позиционирование без плавности, чтобы исключить резонанс с нативным инерционным скроллом
      wheel.scrollTop = targetTop;
      // небольшой таймаут для сброса флага, чтобы игнорировать лишние события scroll
      setTimeout(() => { if (kind) snapping[kind] = false; }, 120);
    };

    const updateActive = (wheel) => {
      const pad = parseFloat(getComputedStyle(wheel).paddingTop) || 0;
      const center = wheel.scrollTop + wheel.clientHeight / 2;
      const pos = center - pad;
      let idx = Math.round(pos / wheel._itemHeight);
      idx = ((idx % wheel._segmentLength) + wheel._segmentLength) % wheel._segmentLength;
      // highlight in middle segment
      const items = [...wheel.querySelectorAll('.timepicker__item')];
      items.forEach(el => el.classList.remove('timepicker__item--active'));
      const targetGlobal = wheel._segmentLength + idx;
      if (items[targetGlobal]) items[targetGlobal].classList.add('timepicker__item--active');
      return idx;
    };

    const ensureLoop = (wheel) => {
      const sH = wheel._segmentHeight;
      if (wheel.scrollTop < sH * 0.5) {
        wheel.scrollTop += sH;
      } else if (wheel.scrollTop > sH * 1.5) {
        wheel.scrollTop -= sH;
      }
    };

    let hourDebounce, minuteDebounce;
    hourWheel.addEventListener('scroll', () => {
      if (snapping.h) return;
      ensureLoop(hourWheel);
      const idx = updateActive(hourWheel);
      this._selectedTime.h = hourWheel._values[idx];
      clearTimeout(hourDebounce);
      hourDebounce = setTimeout(() => centerToIndex(hourWheel, idx, 'h'), 140);
    }, { passive: true });
    minuteWheel.addEventListener('scroll', () => {
      if (snapping.m) return;
      ensureLoop(minuteWheel);
      const idx = updateActive(minuteWheel);
      this._selectedTime.m = minuteWheel._values[idx];
      clearTimeout(minuteDebounce);
      minuteDebounce = setTimeout(() => centerToIndex(minuteWheel, idx, 'm'), 140);
    }, { passive: true });

    // init select from field or defaults
    const field = document.getElementById('modalTaskDatetime');
    const existing = this.parseFieldDatetime(field?.value || '');
    const initH = existing ? existing.getHours() : 9;
    const initM = existing ? existing.getMinutes() : 0;
    // place at middle segment and center
    hourWheel.scrollTop = hourWheel._segmentHeight + initH * ITEM_H;
    minuteWheel.scrollTop = minuteWheel._segmentHeight + initM * ITEM_H;
    // force activate and center
    setTimeout(() => {
      const hIdx = updateActive(hourWheel);
      const mIdx = updateActive(minuteWheel);
      centerToIndex(hourWheel, hIdx, 'h');
      centerToIndex(minuteWheel, mIdx, 'm');
      this._selectedTime.h = hourWheel._values[hIdx];
      this._selectedTime.m = minuteWheel._values[mIdx];
    }, 0);
  }
  applyTimeToField() {
    const field = document.getElementById('modalTaskDatetime');
    if (!field) return;
    const base = this.parseFieldDatetime(field.value) || new Date();
    const h = this._selectedTime.h ?? base.getHours();
    const m = this._selectedTime.m ?? base.getMinutes();
    const candidate = new Date(base.getTime());
    candidate.setHours(h, m, 0, 0);
    const now = new Date();
    if (candidate.getTime() < now.getTime() - 60 * 1000) {
      this.showNotification('Дата уже в прошлом');
      this.showHapticFeedback('warning');
      return;
    }
    field.value = this.formatFieldDatetime(candidate);
  }

  // Helpers for field formatting
  formatFieldDatetime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth()+1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  parseFieldDatetime(val) {
    if (!val) return null;
    // ISO-like: 2025-09-18T09:00 or 2025-09-18 09:00
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const iso = val.replace(' ', 'T');
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    }
    // Human format: dd.MM.yyyy HH:mm
    const m = val.match(/(\d{2})\.(\d{2})\.(\d{4})\s(\d{2}):(\d{2})/);
    if (!m) return null;
    const [_, dd, MM, yyyy, hh, mm] = m;
    const d = new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm));
    return isNaN(d.getTime()) ? null : d;
  }

  _handleEscClose = (e) => {
    if (e.key === 'Escape') this.closeAddModal();
  }

  // Управление задачами
  addTask(text, scheduledAtIso, projectId = null) {
    const task = {
      id: Date.now().toString(),
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      scheduledAt: scheduledAtIso || null,
      projectId: projectId || null
    };
    
    this.tasks.unshift(task);
    this.saveTasks();
    // Попробовать отправить на сервер, если есть Telegram initData
    try {
      const tg = window.Telegram?.WebApp;
      if (tg?.initData) {
        fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': tg.initData
          },
          body: JSON.stringify({ title: task.text, due_at: scheduledAtIso, project_id: projectId })
        }).then(async (r) => {
          if (!r.ok) return;
          const created = await r.json();
          // заменить временную задачу серверной версией
          const idx = this.tasks.findIndex(t => t.id === task.id);
          if (idx !== -1) {
            this.tasks[idx] = created;
            this.saveTasks();
            this.render();
          }
        }).catch(() => {});
      }
    } catch (_) {}
    this.render();
    
    // Добавить класс анимации для плавного появления
    setTimeout(() => {
      const taskElement = document.querySelector(`[data-id="${task.id}"]`);
      if (taskElement) {
        taskElement.classList.add('task--entering');
      }
    }, 10);
  }

  updateTask(id, updates) {
    const taskIndex = this.tasks.findIndex(task => task.id === id);
    if (taskIndex !== -1) {
      this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...updates };
      this.saveTasks();
      try {
        const tg = window.Telegram?.WebApp;
        if (tg?.initData) {
          const payload = {};
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'text')) payload.title = updates.text;
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'scheduledAt')) payload.due_at = updates.scheduledAt;
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'completed')) payload.completed = updates.completed;
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'projectId')) payload.project_id = updates.projectId;
          fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-telegram-init-data': tg.initData
            },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }
      } catch (_) {}
      this.render();
    }
  }

  deleteTask(id) {
    const taskElement = document.querySelector(`[data-id="${id}"]`);
    if (taskElement) {
      taskElement.classList.add('task--removing');
      setTimeout(() => {
        this.tasks = this.tasks.filter(task => task.id !== id);
        this.saveTasks();
        try {
          const tg = window.Telegram?.WebApp;
          if (tg?.initData) {
            fetch(`/api/tasks/${id}`, {
              method: 'DELETE',
              headers: { 'x-telegram-init-data': tg.initData }
            }).catch(() => {});
          }
        } catch (_) {}
        this.render();
      }, 300);
    }
  }

  toggleTask(id) {
    const task = this.tasks.find(task => task.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      // серверная синхронизация статуса
      try {
        const tg = window.Telegram?.WebApp;
        if (tg?.initData) {
          fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-telegram-init-data': tg.initData
            },
            body: JSON.stringify({ completed: task.completed })
          }).catch(() => {});
        }
      } catch (_) {}
      this.render();
    }
  }

  clearCompleted() {
    this.tasks = this.tasks.filter(task => !task.completed);
    this.saveTasks();
    this.render();
  }

  // Обработчики событий формы и списка
  handleAddTask(e) {
    e.preventDefault();
    const input = document.getElementById('taskInput');
    const dtInput = document.getElementById('taskDatetime');
    const text = input.value.trim();
    const dtValue = dtInput && dtInput.value ? dtInput.value : '';
    const scheduledAtIso = dtValue ? new Date(dtValue).toISOString() : null;
    
    if (text) {
      this.addTask(text, scheduledAtIso);
      input.value = '';
      if (dtInput) dtInput.value = '';
      
      // Скрыть основную кнопку Telegram после добавления
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.MainButton.hide();
      }
      
      // Показать тактильный отклик об успешном действии
      this.showHapticFeedback('success');
    }
  }

  openAddModal() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    modal.classList.add('modal--open');
    document.getElementById('modalTaskInput')?.focus();
    document.body.style.overflow = 'hidden';
    // Esc для закрытия модалки — регистрируем при открытии
    document.addEventListener('keydown', this._handleEscClose);
    // reset active preset
    const presetContainer = document.querySelector('.modal__presets');
    if (presetContainer) [...presetContainer.querySelectorAll('.preset')].forEach(b => b.classList.remove('preset--active'));
  }

  closeAddModal() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    modal.classList.remove('modal--open');
    document.body.style.overflow = '';
    // cleanup esc
    document.removeEventListener('keydown', this._handleEscClose);
  }

  handleModalAddTask(e) {
    e.preventDefault();
    const input = document.getElementById('modalTaskInput');
    const dtInput = document.getElementById('modalTaskDatetime');
    const projectSelect = document.getElementById('modalProjectSelect');
    const text = input?.value?.trim() || '';
    const dtValue = dtInput && dtInput.value ? dtInput.value : '';
    let scheduledAtIso = null;
    if (dtValue) {
      const candidate = this.parseFieldDatetime(dtValue);
      if (!candidate || isNaN(candidate.getTime())) {
        this.showNotification('Некорректная дата');
        return;
      }
      const now = new Date();
      if (candidate.getTime() < now.getTime() - 60 * 1000) { // позволяем минутную погрешность
        this.showNotification('Дата уже в прошлом');
        return;
      }
      scheduledAtIso = candidate.toISOString();
    }
    if (text) {
      const projectId = projectSelect?.value ? projectSelect.value : null;
      this.addTask(text, scheduledAtIso, projectId);
      if (input) input.value = '';
      if (dtInput) dtInput.value = '';
      if (projectSelect) projectSelect.value = '';
      this.closeAddModal();
      this.showHapticFeedback('success');
    }
  }

  handleFilterChange(e) {
    const filter = e.target.dataset.filter;
    if (filter) {
      this.currentFilter = filter;
      this.updateFilterButtons();
      this.renderTasks();
    }
  }

  handleTaskAction(e) {
    const taskElement = e.target.closest('.task');
    if (!taskElement) return;

    const taskId = taskElement.dataset.id;

    if (e.target.closest('.task__toggle')) {
      this.toggleTask(taskId);
    } else if (e.target.closest('.task__edit-btn')) {
      this.startEditing(taskId);
    } else if (e.target.closest('.task__delete-btn')) {
      this.deleteTask(taskId);
    } else if (e.target.closest('.task__tags-btn')) {
      this.openTagsPopover(taskId, taskElement);
    } else if (e.target.closest('.task__comments-btn')) {
      this.toggleComments(taskId, taskElement);
    }
  }

  handleTaskKeydown(e) {
    if (e.target.classList.contains('task__input')) {
      if (e.key === 'Enter') {
        this.finishEditing(e.target);
      } else if (e.key === 'Escape') {
        this.cancelEditing();
      }
    }
  }

  handleTaskBlur(e) {
    if (e.target.classList.contains('task__input')) {
      this.finishEditing(e.target);
    }
  }

  // Редактирование задачи
  startEditing(taskId) {
    if (this.editingTaskId) {
      this.cancelEditing();
    }

    this.editingTaskId = taskId;
    const taskElement = document.querySelector(`[data-id="${taskId}"]`);
    const textElement = taskElement.querySelector('.task__text');
    const inputElement = taskElement.querySelector('.task__input');

    textElement.style.display = 'none';
    inputElement.style.display = 'block';
    inputElement.value = textElement.textContent;
    inputElement.focus();
    inputElement.select();
    
    // Показать кнопку «Назад» Telegram во время редактирования
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.show();
    }
  }

  finishEditing(inputElement) {
    if (!this.editingTaskId) return;

    const newText = inputElement.value.trim();
    if (newText) {
      this.updateTask(this.editingTaskId, { text: newText });
    }

    this.cancelEditing();
  }

  cancelEditing() {
    if (!this.editingTaskId) return;

    const taskElement = document.querySelector(`[data-id="${this.editingTaskId}"]`);
    const textElement = taskElement.querySelector('.task__text');
    const inputElement = taskElement.querySelector('.task__input');

    textElement.style.display = 'block';
    inputElement.style.display = 'none';
    
    this.editingTaskId = null;
    
    // Скрыть кнопку «Назад» Telegram после завершения редактирования
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.hide();
    }
  }

  // Фильтрация задач
  getFilteredTasks() {
    const projectFilter = document.getElementById('projectFilter');
    const tagFilter = document.getElementById('tagFilter');
    const projectId = projectFilter?.value || '';
    const tagId = tagFilter?.value || '';
    let base = [];
    switch (this.currentFilter) {
      case 'active':
        base = this.tasks.filter(task => !task.completed);
        break;
      case 'completed':
        base = this.tasks.filter(task => task.completed);
        break;
      default:
        base = this.tasks;
    }
    if (projectId) base = base.filter(t => String(t.projectId || '') === projectId);
    if (tagId) base = base.filter(t => Array.isArray(t.tags) && t.tags.some(x => String(x.id) === tagId));
    return base;
  }

  // Отрисовка интерфейса
  render() {
    this.updateCounters();
    this.updateFilterButtons();
    this.populateProjectsSelect();
    this.populateFilters();
    this.renderTasks();
    this.updateBulkActions();
  }

  updateCounters() {
    const allCount = this.tasks.length;
    const activeCount = this.tasks.filter(task => !task.completed).length;
    const completedCount = this.tasks.filter(task => task.completed).length;

    document.getElementById('taskCounter').textContent = 
      allCount === 0 ? '0 задач' :
      allCount === 1 ? '1 задача' :
      allCount < 5 ? `${allCount} задачи` : `${allCount} задач`;

    document.getElementById('allCount').textContent = allCount;
    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('completedCount').textContent = completedCount;
  }

  populateProjectsSelect() {
    const select = document.getElementById('modalProjectSelect');
    if (!select) return;
    // очистить, оставить первый option "Без проекта"
    const first = select.querySelector('option');
    select.innerHTML = '';
    if (first) select.appendChild(first);
    if (!this.projects || this.projects.length === 0) return;
    const frag = document.createDocumentFragment();
    this.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      frag.appendChild(opt);
    });
    select.appendChild(frag);
  }

  populateFilters() {
    const prFilter = document.getElementById('projectFilter');
    const tgFilter = document.getElementById('tagFilter');
    if (prFilter) {
      const first = prFilter.querySelector('option');
      prFilter.innerHTML = '';
      if (first) prFilter.appendChild(first);
      this.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = String(p.id);
        opt.textContent = p.name;
        prFilter.appendChild(opt);
      });
    }
    if (tgFilter) {
      const first = tgFilter.querySelector('option');
      tgFilter.innerHTML = '';
      if (first) tgFilter.appendChild(first);
      this.tags.forEach(t => {
        const opt = document.createElement('option');
        opt.value = String(t.id);
        opt.textContent = t.name;
        tgFilter.appendChild(opt);
      });
    }
  }

  updateFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === this.currentFilter);
    });
  }

  renderTasks() {
    const taskList = document.getElementById('taskList');
    const emptyState = document.getElementById('emptyState');
    const filteredTasks = this.getFilteredTasks();

    // Очистить уже отрисованные элементы задач (не трогая блок пустого состояния)
    const existingTasks = taskList.querySelectorAll('.task');
    existingTasks.forEach(task => task.remove());

    if (filteredTasks.length === 0) {
      emptyState.style.display = 'block';
      this.updateEmptyState();
    } else {
      emptyState.style.display = 'none';
      filteredTasks.forEach(task => {
        const taskElement = this.createTaskElement(task);
        taskList.appendChild(taskElement);
      });
    }
  }

  updateEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const icon = emptyState.querySelector('.empty-state__icon');
    const title = emptyState.querySelector('.empty-state__title');
    const text = emptyState.querySelector('.empty-state__text');

    switch (this.currentFilter) {
      case 'active':
        icon.textContent = '🎉';
        title.textContent = 'Все задачи выполнены!';
        text.textContent = 'Отличная работа! Можете добавить новые задачи или отдохнуть.';
        break;
      case 'completed':
        icon.textContent = '✅';
        title.textContent = 'Нет выполненных задач';
        text.textContent = 'Выполненные задачи будут отображаться здесь.';
        break;
      default:
        icon.textContent = '📝';
        title.textContent = 'Пока нет задач';
        text.textContent = 'Добавьте первую задачу, чтобы начать планировать свой день';
    }
  }

  createTaskElement(task) {
    const template = document.getElementById('taskTemplate');
    const taskElement = template.content.cloneNode(true);
    const article = taskElement.querySelector('.task');

    article.dataset.id = task.id;
    article.classList.toggle('task--completed', task.completed);
    
    const textElement = article.querySelector('.task__text');
    textElement.textContent = task.text;

    // scheduledAt rendering
    const scheduledEl = article.querySelector('.task__scheduled');
    if (scheduledEl) {
      if (task.scheduledAt) {
        const date = new Date(task.scheduledAt);
        const formatted = date.toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        scheduledEl.textContent = formatted;
        scheduledEl.dataset.datetime = task.scheduledAt;
        scheduledEl.style.display = 'inline';
      } else {
        scheduledEl.textContent = '';
        scheduledEl.dataset.datetime = '';
        scheduledEl.style.display = 'none';
      }
    }

    // project rendering
    const projectEl = article.querySelector('.task__project');
    if (projectEl) {
      const pr = task.projectId ? this.projectMap.get(String(task.projectId)) : null;
      if (pr) {
        projectEl.textContent = `#${pr.name}`;
        projectEl.dataset.projectId = String(task.projectId);
        projectEl.style.display = 'inline';
      } else {
        projectEl.textContent = '';
        projectEl.dataset.projectId = '';
        projectEl.style.display = 'none';
      }
    }

    // tags rendering placeholder (will be filled on open popover)
    const labelsEl = article.querySelector('.task__labels');
    if (labelsEl && task.tags && Array.isArray(task.tags)) {
      labelsEl.innerHTML = '';
      task.tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'task__label';
        el.textContent = tag.name;
        labelsEl.appendChild(el);
      });
    }

    return taskElement;
  }

  // ----- Tags popover -----
  async openTagsPopover(taskId, taskElement) {
    try {
      const tg = window.Telegram?.WebApp;
      const headers = tg?.initData ? { 'x-telegram-init-data': tg.initData, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      const [current, all] = await Promise.all([
        fetch(`/api/tasks/${taskId}/tags`, { headers }).then(r => r.ok ? r.json() : []),
        this.tags?.length ? Promise.resolve(this.tags) : fetch('/api/tags', { headers }).then(r => r.ok ? r.json() : [])
      ]);
      if (!this.tags?.length) {
        this.tags = Array.isArray(all) ? all : [];
        this.tagMap = new Map(this.tags.map(t => [String(t.id), t]));
      }
      const currentIds = new Set((current || []).map(t => String(t.id)));
      const choices = this.tags.map(t => ({ id: String(t.id), name: t.name, selected: currentIds.has(String(t.id)) }));
      // Simple inline popover using prompt (Telegram Alert unavailable for multi-select)
      const list = choices.map(c => `${c.selected ? '[x]' : '[ ]'} ${c.name}`).join('\n');
      const toToggle = prompt(`Теги (введи номера через запятую для переключения)\n${choices.map((c,i)=>`${i+1}. ${c.name}${c.selected?' ✓':''}`).join('\n')}`);
      if (!toToggle) return;
      const idxs = toToggle.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n>=1 && n<=choices.length);
      if (!idxs.length) return;
      const headersJson = headers;
      await Promise.all(idxs.map(i => {
        const tag = choices[i-1];
        if (tag.selected) {
          return fetch(`/api/tasks/${taskId}/tags/${tag.id}`, { method: 'DELETE', headers: headersJson });
        }
        return fetch(`/api/tasks/${taskId}/tags`, { method: 'POST', headers: headersJson, body: JSON.stringify({ tag_id: tag.id }) });
      }));
      // refresh labels
      const labelsEl = taskElement.querySelector('.task__labels');
      if (labelsEl) {
        const updated = await fetch(`/api/tasks/${taskId}/tags`, { headers }).then(r => r.ok ? r.json() : []);
        labelsEl.innerHTML = '';
        updated.forEach(tag => {
          const el = document.createElement('span');
          el.className = 'task__label';
          el.textContent = tag.name;
          labelsEl.appendChild(el);
        });
      }
    } catch (_) {}
  }

  // ----- Comments -----
  async toggleComments(taskId, taskElement) {
    const box = taskElement.querySelector('.task__comments');
    if (!box) return;
    const hidden = box.hasAttribute('hidden');
    if (hidden) {
      await this.loadCommentsInto(taskId, box);
      box.removeAttribute('hidden');
      const form = box.querySelector('.task__comments-form');
      if (form && !form._bound) {
        form.addEventListener('submit', (e) => this.submitComment(e, taskId, box));
        form._bound = true;
      }
    } else {
      box.setAttribute('hidden', '');
    }
  }

  async loadCommentsInto(taskId, box) {
    try {
      const tg = window.Telegram?.WebApp;
      const headers = tg?.initData ? { 'x-telegram-init-data': tg.initData } : {};
      const comments = await fetch(`/api/tasks/${taskId}/comments`, { headers }).then(r => r.ok ? r.json() : []);
      const list = box.querySelector('.task__comments-list');
      if (!list) return;
      list.innerHTML = '';
      comments.forEach(c => {
        const item = document.createElement('div');
        item.className = 'task__comment';
        item.textContent = c.content;
        list.appendChild(item);
      });
    } catch (_) {}
  }

  async submitComment(e, taskId, box) {
    e.preventDefault();
    try {
      const input = box.querySelector('.task__comments-input');
      const content = input?.value?.trim();
      if (!content) return;
      const tg = window.Telegram?.WebApp;
      const headers = { 'Content-Type': 'application/json' };
      if (tg?.initData) headers['x-telegram-init-data'] = tg.initData;
      await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content })
      });
      input.value = '';
      await this.loadCommentsInto(taskId, box);
    } catch (_) {}
  }

  updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const hasCompletedTasks = this.tasks.some(task => task.completed);
    
    bulkActions.style.display = hasCompletedTasks ? 'block' : 'none';
  }

  // Методы, специфичные для Telegram
  shareProgress() {
    const totalTasks = this.tasks.length;
    const completedTasks = this.tasks.filter(task => task.completed).length;
    const activePercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    let message = `📝 Мой прогресс в ToDo:\n`;
    message += `✅ Выполнено: ${completedTasks} из ${totalTasks} задач (${activePercentage}%)\n`;
    
    if (activePercentage === 100) {
      message += `🎉 Все задачи выполнены!`;
    } else if (activePercentage >= 80) {
      message += `🔥 Отличная продуктивность!`;
    } else if (activePercentage >= 50) {
      message += `💪 На правильном пути!`;
    } else {
      message += `🚀 Продолжаю работать над целями!`;
    }
    
    if (window.Telegram?.WebApp) {
      // Попытаться поделиться через Telegram (deeplink)
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=&text=${encodeURIComponent(message)}`);
    } else {
      // Альтернатива для обычного веба
      if (navigator.share) {
        navigator.share({
          title: 'Мой прогресс в ToDo',
          text: message
        });
      } else {
        // Скопировать текст в буфер обмена
        navigator.clipboard.writeText(message).then(() => {
          this.showNotification('Прогресс скопирован в буфер обмена');
        });
      }
    }
    
    this.showHapticFeedback('success');
  }

  showHapticFeedback(type = 'light') {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      switch (type) {
        case 'success':
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          break;
        case 'error':
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
          break;
        case 'warning':
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
          break;
        default:
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      }
    }
  }

  // Показ уведомлений пользователю (через Telegram Alert или стандартный alert)
  showNotification(message) {
    // Пытаемся показать системное уведомление Telegram, если поддерживается
    try {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch (_) {}

    // Фолбэк: собственный тост
    const container = document.getElementById('toastContainer');
    if (container) {
      const el = document.createElement('div');
      el.className = 'toast toast--warning toast--show';
      el.role = 'status';
      el.textContent = message;
      container.appendChild(el);
      setTimeout(() => {
        el.classList.remove('toast--show');
        setTimeout(() => el.remove(), 200);
      }, 2500);
      return;
    }

    // Последний резерв
    try { alert(message); } catch (_) {}
  }

  // Хранение задач: делегируем в TaskStorage (учитывает пользователя)
  saveTasks() {
    try {
      this.storage.saveTasks(this.tasks);
    } catch (error) {
      console.error('Failed to save tasks:', error);
    }
  }

  loadTasks() {
    this.loadUserTasks();
  }

  async loadUserTasks() {
    try {
      const localTasks = await this.storage.loadTasks((cloudTasks) => {
        try {
          this.tasks = Array.isArray(cloudTasks) ? cloudTasks : [];
          this.render();
        } catch (e) {
          console.error('Failed to apply cloud tasks:', e);
        }
      });
      this.tasks = Array.isArray(localTasks) ? localTasks : [];
      this.render();
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.tasks = [];
    }
  }
}

// Инициализировать приложение после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  new TodoApp();
});


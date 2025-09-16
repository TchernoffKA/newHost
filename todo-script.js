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
    
    this.init();
  }

  init() {
    this.initTelegram();
    this.loadTasks();
    this.bindEvents();
    this.render();
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
        document.getElementById('taskInput').focus();
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
  getUserStorageKey() {
    if (this.tgUser) {
      return `todo-tasks-${this.tgUser.id}`;
    }
    return 'todo-tasks';
  }

  // Привязка обработчиков событий интерфейса
  bindEvents() {
    // Форма добавления задачи
    const addTaskForm = document.getElementById('addTaskForm');
    addTaskForm.addEventListener('submit', (e) => this.handleAddTask(e));

    // Кнопки фильтров (Все/Активные/Выполненные)
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleFilterChange(e));
    });

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
  }

  // Управление задачами
  addTask(text) {
    const task = {
      id: Date.now().toString(),
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    this.tasks.unshift(task);
    this.saveTasks();
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
        this.render();
      }, 300);
    }
  }

  toggleTask(id) {
    const task = this.tasks.find(task => task.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
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
    const text = input.value.trim();
    
    if (text) {
      this.addTask(text);
      input.value = '';
      
      // Скрыть основную кнопку Telegram после добавления
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.MainButton.hide();
      }
      
      // Показать тактильный отклик об успешном действии
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
    switch (this.currentFilter) {
      case 'active':
        return this.tasks.filter(task => !task.completed);
      case 'completed':
        return this.tasks.filter(task => task.completed);
      default:
        return this.tasks;
    }
  }

  // Отрисовка интерфейса
  render() {
    this.updateCounters();
    this.updateFilterButtons();
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

    return taskElement;
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
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(message);
    } else {
      alert(message);
    }
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

  loadUserTasks() {
    try {
      const localTasks = this.storage.loadTasks((cloudTasks) => {
        try {
          this.tasks = Array.isArray(cloudTasks) ? cloudTasks : [];
          this.render();
        } catch (e) {
          console.error('Failed to apply cloud tasks:', e);
        }
      });
      this.tasks = Array.isArray(localTasks) ? localTasks : [];
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


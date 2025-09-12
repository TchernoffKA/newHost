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

  // Telegram WebApp initialization
  initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      
      // Expand the app to full height
      tg.expand();
      
      // Apply Telegram theme
      this.applyTelegramTheme(tg.themeParams);
      
      // Get user info
      this.tgUser = tg.initDataUnsafe?.user;
      if (this.storage) {
        this.storage.setUser(this.tgUser);
      }
      this.updateUserInfo();
      
      // Setup main button
      tg.MainButton.setText('Добавить задачу');
      tg.MainButton.onClick(() => {
        document.getElementById('taskInput').focus();
      });
      
      // Show main button only when input is focused
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
      
      // Handle back button
      tg.BackButton.onClick(() => {
        if (this.editingTaskId) {
          this.cancelEditing();
          tg.BackButton.hide();
        }
      });
      
      // Enable closing confirmation
      tg.enableClosingConfirmation();
      
      console.log('Telegram WebApp initialized', tg.version);
    } else {
      console.log('Not running in Telegram WebApp');
      // Fallback for web browser
      if (this.storage) {
        this.storage.setUser(null);
      }
      this.updateUserInfo();
    }
  }

  applyTelegramTheme(themeParams) {
    if (!themeParams) return;
    
    const root = document.documentElement;
    
    // Map Telegram theme to CSS variables
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
    
    // Set body background to match Telegram
    document.body.style.backgroundColor = themeParams.bg_color || '#ffffff';
  }

  updateUserInfo() {
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (this.tgUser) {
      const displayName = this.tgUser.first_name + (this.tgUser.last_name ? ` ${this.tgUser.last_name}` : '');
      userNameEl.textContent = displayName;
      
      // Use first letter of first name as avatar
      if (this.tgUser.first_name) {
        userAvatarEl.textContent = this.tgUser.first_name.charAt(0).toUpperCase();
      }
      
      // Load user-specific tasks
      this.loadUserTasks();
    } else {
      userNameEl.textContent = 'Гость';
      userAvatarEl.textContent = '👤';
    }
  }

  getUserStorageKey() {
    if (this.tgUser) {
      return `todo-tasks-${this.tgUser.id}`;
    }
    return 'todo-tasks';
  }

  // Event bindings
  bindEvents() {
    // Add task form
    const addTaskForm = document.getElementById('addTaskForm');
    addTaskForm.addEventListener('submit', (e) => this.handleAddTask(e));

    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleFilterChange(e));
    });

    // Clear completed button
    const clearCompletedBtn = document.getElementById('clearCompleted');
    clearCompletedBtn.addEventListener('click', () => this.clearCompleted());

    // Share progress button
    const shareProgressBtn = document.getElementById('shareProgress');
    shareProgressBtn.addEventListener('click', () => this.shareProgress());

    // Task list event delegation
    const taskList = document.getElementById('taskList');
    taskList.addEventListener('click', (e) => this.handleTaskAction(e));
    taskList.addEventListener('keydown', (e) => this.handleTaskKeydown(e));
    taskList.addEventListener('blur', (e) => this.handleTaskBlur(e), true);
  }

  // Task management
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
    
    // Add animation class
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

  // Event handlers
  handleAddTask(e) {
    e.preventDefault();
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    
    if (text) {
      this.addTask(text);
      input.value = '';
      
      // Hide Telegram main button
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.MainButton.hide();
      }
      
      // Show haptic feedback
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

  // Editing functionality
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
    
    // Show Telegram back button during editing
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
    
    // Hide Telegram back button
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.hide();
    }
  }

  // Filtering
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

  // Rendering
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

    // Clear existing tasks (except empty state)
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

  // Telegram-specific methods
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
      // Try to share via Telegram
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=&text=${encodeURIComponent(message)}`);
    } else {
      // Fallback for web
      if (navigator.share) {
        navigator.share({
          title: 'Мой прогресс в ToDo',
          text: message
        });
      } else {
        // Copy to clipboard
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

  showNotification(message) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(message);
    } else {
      alert(message);
    }
  }

  // Local storage with user-specific keys (delegated to TaskStorage)
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TodoApp();
});

// Service Worker registration (if available)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Will be implemented in next iteration
      console.log('Service Worker support detected');
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  });
}

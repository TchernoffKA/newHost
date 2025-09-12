// Simple storage module for user-scoped tasks with optional Telegram Cloud fallback
// Exposes TaskStorage on window for non-module usage

(function () {
  class TaskStorage {
    constructor() {
      this.telegramUser = null;
    }

    setUser(telegramUser) {
      this.telegramUser = telegramUser || null;
    }

    getStorageKey() {
      if (this.telegramUser?.id) {
        return `todo-tasks-${this.telegramUser.id}`;
      }
      return 'todo-tasks';
    }

    saveTasks(tasks) {
      try {
        const key = this.getStorageKey();
        localStorage.setItem(key, JSON.stringify(tasks || []));

        // Save to Telegram Cloud Storage if available
        if (window.Telegram?.WebApp?.CloudStorage) {
          try {
            window.Telegram.WebApp.CloudStorage.setItem('tasks', JSON.stringify(tasks || []));
          } catch (e) {
            console.warn('Telegram CloudStorage setItem failed:', e);
          }
        }
      } catch (error) {
        console.error('TaskStorage.saveTasks failed:', error);
      }
    }

    /**
     * Loads tasks from LocalStorage synchronously and then tries to fetch
     * tasks from Telegram Cloud Storage asynchronously. If cloud tasks are
     * available, calls onCloudUpdate(cloudTasks).
     * @param {(tasks: any[]) => void} [onCloudUpdate]
     * @returns {any[]} local tasks (parsed) or []
     */
    loadTasks(onCloudUpdate) {
      let localTasks = [];
      try {
        const key = this.getStorageKey();
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            localTasks = JSON.parse(stored) || [];
          } catch (e) {
            console.warn('Failed to parse local tasks, resetting to []:', e);
            localTasks = [];
          }
        }
      } catch (error) {
        console.error('TaskStorage.loadTasks (local) failed:', error);
        localTasks = [];
      }

      // Try Telegram Cloud asynchronously
      try {
        if (window.Telegram?.WebApp?.CloudStorage) {
          window.Telegram.WebApp.CloudStorage.getItem('tasks', (error, value) => {
            if (!error && value) {
              try {
                const cloudTasks = JSON.parse(value);
                if (Array.isArray(cloudTasks) && typeof onCloudUpdate === 'function') {
                  onCloudUpdate(cloudTasks);
                }
              } catch (e) {
                console.error('TaskStorage.loadTasks cloud parse failed:', e);
              }
            }
          });
        }
      } catch (e) {
        console.warn('TaskStorage.loadTasks cloud fetch failed:', e);
      }

      return localTasks;
    }
  }

  window.TaskStorage = TaskStorage;
})();



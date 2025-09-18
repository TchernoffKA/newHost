// Простой модуль хранения задач с привязкой к пользователю и опциональной синхронизацией через Telegram CloudStorage
// Экспортирует TaskStorage в window для использования без модульной системы

(function () {
  class TaskStorage {
    constructor() {
      this.telegramUser = null;
    }

    // Устанавливает текущего пользователя Telegram (или null для гостя)
    setUser(telegramUser) {
      this.telegramUser = telegramUser || null;
    }

    // Возвращает ключ LocalStorage, уникальный для пользователя (если он задан)
    getStorageKey() {
      if (this.telegramUser?.id) {
        return `todo-tasks-${this.telegramUser.id}`;
      }
      return 'todo-tasks';
    }

    // Сохраняет задачи в LocalStorage и пытается продублировать в Telegram CloudStorage (если доступен)
    saveTasks(tasks) {
      try {
        const key = this.getStorageKey();
        localStorage.setItem(key, JSON.stringify(tasks || []));

        // Сохранить в Telegram CloudStorage, если API доступен
        if (window.Telegram?.WebApp?.CloudStorage) {
          try {
            window.Telegram.WebApp.CloudStorage.setItem('tasks', JSON.stringify(tasks || []));
          } catch (e) {
            console.warn('Не удалось сохранить в Telegram CloudStorage:', e);
          }
        }
      } catch (error) {
        console.error('TaskStorage.saveTasks: ошибка сохранения:', error);
      }
    }

    /**
     * Загружает задачи из LocalStorage синхронно и, при наличии, пытается
     * получить задачи из Telegram CloudStorage асинхронно. Если облачные
     * данные получены, вызывает onCloudUpdate(cloudTasks).
     * @param {(tasks: any[]) => void} [onCloudUpdate] колбэк при получении данных из облака
     * @returns {any[]} локальные задачи (распарсенные) или []
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
            console.warn('Не удалось распарсить локальные задачи, сбрасываю в []:', e);
            localTasks = [];
          }
        }
      } catch (error) {
        console.error('TaskStorage.loadTasks (local): ошибка чтения:', error);
        localTasks = [];
      }

      // Попытаться получить данные из Telegram CloudStorage асинхронно
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
                console.error('TaskStorage.loadTasks: ошибка парсинга облачных данных:', e);
              }
            }
          });
        }
      } catch (e) {
        console.warn('TaskStorage.loadTasks: не удалось получить данные из облака:', e);
      }

      return localTasks;
    }
  }

  window.TaskStorage = TaskStorage;
})();



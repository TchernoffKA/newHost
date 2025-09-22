-- База и настройки
CREATE DATABASE IF NOT EXISTS todo_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE todo_app;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Пользователи (с глобальными ролями)
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  telegram_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(64) NULL,
  first_name VARCHAR(64) NULL,
  last_name  VARCHAR(64) NULL,
  avatar_url VARCHAR(512) NULL,
  email VARCHAR(191) NULL,
  system_role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_users_telegram_id (telegram_id),
  UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Проекты (списки)
CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL, -- владелец
  name VARCHAR(191) NOT NULL,
  color CHAR(7) NULL, -- #RRGGBB
  position INT UNSIGNED NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_projects_user_name (user_id, name),
  KEY idx_projects_user (user_id),
  CONSTRAINT fk_projects_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Участники проектов и роли доступа
CREATE TABLE IF NOT EXISTS project_members (
  project_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner','admin','editor','viewer') NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_project_members_user (user_id),
  KEY idx_project_members_role (role),
  CONSTRAINT fk_pm_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pm_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Триггер: при создании проекта добавляет владельца в участники
DROP TRIGGER IF EXISTS trg_projects_after_insert_add_owner;
DELIMITER $$
CREATE TRIGGER trg_projects_after_insert_add_owner
AFTER INSERT ON projects
FOR EACH ROW
BEGIN
  INSERT INTO project_members (project_id, user_id, role, joined_at)
  VALUES (NEW.id, NEW.user_id, 'owner', CURRENT_TIMESTAMP);
END$$
DELIMITER ;

-- При смене владельца поддерживаем роль owner
DROP TRIGGER IF EXISTS trg_projects_after_update_sync_owner;
DELIMITER $$
CREATE TRIGGER trg_projects_after_update_sync_owner
AFTER UPDATE ON projects
FOR EACH ROW
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    -- Понижаем роль старого владельца, если он есть среди участников
    UPDATE project_members
      SET role = 'editor'
      WHERE project_id = NEW.id AND user_id = OLD.user_id AND role = 'owner';

    -- Назначаем владельцем нового пользователя (создаём участника при необходимости)
    INSERT INTO project_members (project_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.user_id, 'owner', CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE role = VALUES(role);
  END IF;
END$$
DELIMITER ;

-- Задачи
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL, -- создатель задачи
  project_id BIGINT UNSIGNED NULL,  -- может быть персональная задача без проекта
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('active','completed','archived') NOT NULL DEFAULT 'active',
  priority TINYINT UNSIGNED NOT NULL DEFAULT 3,
  due_at DATETIME NULL,
  completed_at DATETIME NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_user_status (user_id, status),
  KEY idx_tasks_user_due (user_id, due_at),
  KEY idx_tasks_project (project_id),
  CONSTRAINT fk_tasks_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Назначенные исполнители задач (многие-ко-многим)
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id),
  KEY idx_task_assignees_user (user_id),
  CONSTRAINT fk_ta_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ta_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Триггер: запрещает назначать пользователя не-участника проекта
DROP TRIGGER IF EXISTS trg_task_assignees_before_insert_check_membership;
DELIMITER $$
CREATE TRIGGER trg_task_assignees_before_insert_check_membership
BEFORE INSERT ON task_assignees
FOR EACH ROW
BEGIN
  DECLARE v_project_id BIGINT UNSIGNED;
  SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  -- Если задача не в проекте — назначение допустимо всем (персональная задача)
  IF v_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = v_project_id AND user_id = NEW.user_id
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User is not a member of the project for this task';
    END IF;
  END IF;
END$$
DELIMITER ;

-- Теги
CREATE TABLE IF NOT EXISTS tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  color CHAR(7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_tags_user_name (user_id, name),
  KEY idx_tags_user (user_id),
  CONSTRAINT fk_tags_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Связь Задача—Тег
CREATE TABLE IF NOT EXISTS task_tags (
  task_id BIGINT UNSIGNED NOT NULL,
  tag_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  KEY idx_task_tags_tag (tag_id),
  CONSTRAINT fk_task_tags_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_task_tags_tag
    FOREIGN KEY (tag_id)  REFERENCES tags(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Напоминания
CREATE TABLE IF NOT EXISTS reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  remind_at DATETIME NOT NULL,
  channel ENUM('push','email','telegram') NOT NULL DEFAULT 'telegram',
  is_sent TINYINT(1) NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reminders_task_time (task_id, remind_at),
  CONSTRAINT fk_reminders_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Приглашения в проект (email/telegram/пользователь)
CREATE TABLE IF NOT EXISTS project_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  inviter_user_id BIGINT UNSIGNED NOT NULL,
  invitee_user_id BIGINT UNSIGNED NULL,
  invitee_email VARCHAR(191) NULL,
  invitee_telegram_id BIGINT UNSIGNED NULL,
  role ENUM('admin','editor','viewer') NOT NULL,
  token CHAR(64) NOT NULL,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NULL,
  accepted_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_project_inv_token (token),
  KEY idx_project_inv_project (project_id),
  KEY idx_project_inv_status (status),
  CONSTRAINT fk_pi_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pi_inviter
    FOREIGN KEY (inviter_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pi_invitee_user
    FOREIGN KEY (invitee_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Триггер: при принятии приглашения добавляет участника проекта с указанной ролью
DROP TRIGGER IF EXISTS trg_project_invitations_after_update_accept;
DELIMITER $$
CREATE TRIGGER trg_project_invitations_after_update_accept
AFTER UPDATE ON project_invitations
FOR EACH ROW
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    IF NEW.invitee_user_id IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id, role, joined_at)
      VALUES (NEW.project_id, NEW.invitee_user_id, NEW.role, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE role = VALUES(role);
    END IF;
  END IF;
END$$
DELIMITER ;

-- Триггер: при создании задачи в проекте проверяет, что создатель — участник проекта
DROP TRIGGER IF EXISTS trg_tasks_before_insert_creator_member;
DELIMITER $$
CREATE TRIGGER trg_tasks_before_insert_creator_member
BEFORE INSERT ON tasks
FOR EACH ROW
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = NEW.project_id AND user_id = NEW.user_id
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Task creator must be a member of the project';
    END IF;
  END IF;
END$$
DELIMITER ;

-- Комментарии к задачам
CREATE TABLE IF NOT EXISTS task_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  parent_comment_id BIGINT UNSIGNED NULL,
  content TEXT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_comments_task_created (task_id, created_at),
  KEY idx_task_comments_parent (parent_comment_id),
  FULLTEXT KEY ftx_task_comments_content (content),
  CONSTRAINT fk_tc_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tc_author
    FOREIGN KEY (author_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tc_parent
    FOREIGN KEY (parent_comment_id) REFERENCES task_comments(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Валидация комментариев на INSERT
DROP TRIGGER IF EXISTS trg_task_comments_before_insert_validate;
DELIMITER $$
CREATE TRIGGER trg_task_comments_before_insert_validate
BEFORE INSERT ON task_comments
FOR EACH ROW
BEGIN
  DECLARE v_project_id BIGINT UNSIGNED;
  DECLARE v_parent_task_id BIGINT UNSIGNED;

  -- Проверка членства проекта
  SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  IF v_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = v_project_id AND user_id = NEW.author_user_id
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Comment author must be a member of the project';
    END IF;
  END IF;

  -- Проверка соответствия родительского комментария той же задаче
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT task_id INTO v_parent_task_id
    FROM task_comments
    WHERE id = NEW.parent_comment_id;

    IF v_parent_task_id IS NULL OR v_parent_task_id <> NEW.task_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Parent comment must belong to the same task';
    END IF;
  END IF;
END$$
DELIMITER ;

-- Валидация комментариев на UPDATE
DROP TRIGGER IF EXISTS trg_task_comments_before_update_validate;
DELIMITER $$
CREATE TRIGGER trg_task_comments_before_update_validate
BEFORE UPDATE ON task_comments
FOR EACH ROW
BEGIN
  DECLARE v_parent_task_id BIGINT UNSIGNED;

  IF NEW.task_id <> OLD.task_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Changing task_id for comments is not allowed';
  END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT task_id INTO v_parent_task_id
    FROM task_comments
    WHERE id = NEW.parent_comment_id;

    IF v_parent_task_id IS NULL OR v_parent_task_id <> NEW.task_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Parent comment must belong to the same task';
    END IF;
  END IF;
END$$
DELIMITER ;



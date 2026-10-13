-- =============================================================
-- 内信 IntraChat 数据库结构（MySQL 8.0+ / MariaDB 10.5+）
-- 说明：服务端首次启动时会自动建库建表，本文件仅供 DBA 手动初始化或审阅。
-- 手动导入：mysql -u root -p < database/schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS intranet_im
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE intranet_im;

-- 用户表：status 流转 pending -> approved / rejected；approved <-> disabled
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL COMMENT '登录名，唯一',
  password_hash VARCHAR(128) NOT NULL COMMENT 'bcrypt 哈希',
  display_name  VARCHAR(64)  NOT NULL COMMENT '显示名',
  role          VARCHAR(16)  NOT NULL DEFAULT 'member' COMMENT 'admin | member',
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending | approved | rejected | disabled',
  reject_reason VARCHAR(255) DEFAULT NULL,
  avatar        BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '头像文件ID，关联 files.id',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   TIMESTAMP    NULL DEFAULT NULL,
  reviewed_by   BIGINT UNSIGNED DEFAULT NULL,
  UNIQUE KEY uk_username (username),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话表：direct（私聊）以 direct_key 去重；group（群聊）有名称
CREATE TABLE IF NOT EXISTS conversations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type        VARCHAR(16)  NOT NULL COMMENT 'direct | group',
  name        VARCHAR(128) DEFAULT NULL COMMENT '群聊名称',
  direct_key  VARCHAR(40)  DEFAULT NULL COMMENT '私聊去重键：小id:大id',
  creator_id  BIGINT UNSIGNED DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_direct_key (direct_key),
  KEY idx_creator (creator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话成员表：last_read_at 用于未读数与已读回执
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_member_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息表：type = text | image | file；文件消息关联 files 表
CREATE TABLE IF NOT EXISTS messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id       BIGINT UNSIGNED NOT NULL,
  type            VARCHAR(16) NOT NULL DEFAULT 'text' COMMENT 'text | image | file',
  content         TEXT NOT NULL,
  file_id         BIGINT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_conv (conversation_id, id),
  KEY idx_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文件表：本地磁盘存储的元数据
CREATE TABLE IF NOT EXISTS files (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uploader_id   BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(128) NOT NULL COMMENT '磁盘上的随机文件名',
  mime          VARCHAR(128) NOT NULL,
  size          BIGINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stored (stored_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

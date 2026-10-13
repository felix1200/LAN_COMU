// ABOUTME: MySQL 连接池与启动初始化（自动建库、建表、种子管理员）
// ABOUTME: 兼容 MySQL 8.0+ 与 MariaDB 10.5+

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { config } from './config';

let pool: mysql.Pool;

const TABLE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    display_name  VARCHAR(64)  NOT NULL,
    role          VARCHAR(16)  NOT NULL DEFAULT 'member',
    status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
    reject_reason VARCHAR(255) DEFAULT NULL,
    avatar        BIGINT UNSIGNED NULL DEFAULT NULL,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at   TIMESTAMP    NULL DEFAULT NULL,
    reviewed_by   BIGINT UNSIGNED DEFAULT NULL,
    UNIQUE KEY uk_username (username),
    KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type        VARCHAR(16)  NOT NULL,
    name        VARCHAR(128) DEFAULT NULL,
    direct_key  VARCHAR(40)  DEFAULT NULL,
    creator_id  BIGINT UNSIGNED DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_direct_key (direct_key),
    KEY idx_creator (creator_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (conversation_id, user_id),
    KEY idx_member_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS messages (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id       BIGINT UNSIGNED NOT NULL,
    type            VARCHAR(16) NOT NULL DEFAULT 'text',
    content         TEXT NOT NULL,
    file_id         BIGINT UNSIGNED DEFAULT NULL,
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_conv (conversation_id, id),
    KEY idx_file (file_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS files (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uploader_id   BIGINT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name   VARCHAR(128) NOT NULL,
    mime          VARCHAR(128) NOT NULL,
    size          BIGINT UNSIGNED NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stored (stored_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export async function initDatabase(): Promise<void> {
  // 1) 先以服务端级连接建库（此时业务库可能还不存在）
  const serverConn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
  });
  await serverConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await serverConn.end();

  // 2) 建立业务连接池
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // 3) 建表
  for (const stmt of TABLE_STATEMENTS) {
    await pool.query(stmt);
  }

  // 轻量迁移：为已存在的老库补充缺失列（MySQL 8.0.29+/MariaDB 支持 IF NOT EXISTS）
  await ensureColumn('users', 'avatar', 'BIGINT UNSIGNED NULL DEFAULT NULL');
  await ensureColumn('users', 'must_change_password', "TINYINT(1) NOT NULL DEFAULT '0'");

  // 4) 种子管理员：仅当库中不存在任何管理员时创建；预置管理员首次登录需强制改密
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'",
  );
  const adminCount = Number(rows[0]?.cnt ?? 0);
  if (adminCount === 0) {
    const hash = await bcrypt.hash(config.admin.initialPassword, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash, display_name, role, status, must_change_password) VALUES (?, ?, ?, 'admin', 'approved', 1)",
      [config.admin.username, hash, config.admin.displayName],
    );
    console.log(`[db] 已创建初始管理员账号：${config.admin.username}（首次登录需强制修改密码）`);
  }

  console.log(`[db] MySQL 就绪：${config.db.host}:${config.db.port}/${config.db.database}`);

  // 兼容 MySQL(<8.0.29 无 IF NOT EXISTS) 与 MariaDB 的列迁移辅助
  async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    } catch {
      const [cols] = await pool.query<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [config.db.database, table, column],
      );
      if (Number(cols[0]?.cnt ?? 0) === 0) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  }
}

export function getPool(): mysql.Pool {
  if (!pool) {
    throw new Error('数据库尚未初始化');
  }
  return pool;
}

/** 查询多行，rows 调用方自行断言为具体类型 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

/** 查询单行，无结果返回 null */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export interface ExecuteResult {
  insertId: number;
  affectedRows: number;
}

/** 执行写操作 */
export async function execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
  const [result] = await getPool().query(sql, params);
  const header = result as mysql.ResultSetHeader;
  return { insertId: Number(header.insertId), affectedRows: header.affectedRows };
}

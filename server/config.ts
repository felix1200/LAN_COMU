// ABOUTME: 全局配置：从环境变量 / .env 读取，提供默认值
// ABOUTME: 部署到内网 Windows 服务器时通过 .env 覆盖

import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // 生产模式判定：NODE_ENV=production（自建部署 start 脚本设置）或沙箱 PROD 环境
  isDev: process.env.NODE_ENV !== 'production' && process.env.COZE_PROJECT_ENV !== 'PROD',
  port: int(process.env.PORT, 5000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'intranet_im',
  },
  jwtSecret: process.env.JWT_SECRET || 'intranet-im-insecure-dev-secret',
  // 需求基线：登录会话永久保持（不设过期）；账号被禁用时由请求态校验即时拦截
  tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS ?? 0) || 0, // 0 = 永不超时
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 100), // 需求基线：单文件上限 100MB
  login: {
    maxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5), // 需求基线：连续 5 次失败
    lockMinutes: int(process.env.LOGIN_LOCK_MINUTES, 30), // 锁 30 分钟
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123456',
    displayName: process.env.ADMIN_DISPLAY_NAME || '系统管理员',
  },
} as const;

export function warnInsecureDefaults(): void {
  if (!process.env.JWT_SECRET) {
    console.warn('[config] 警告：未设置 JWT_SECRET，正在使用内置开发密钥，生产环境请在 .env 中配置。');
  }
  if (!process.env.ADMIN_INITIAL_PASSWORD) {
    console.warn(`[config] 初始管理员账号：${config.admin.username} / ${config.admin.initialPassword}（首次启动时创建，请尽快登录修改密码）`);
  }
}

// ABOUTME: JWT 签发/校验与鉴权中间件；每次请求回源数据库校验账号状态

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { queryOne } from './db';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarId: number | null;
  /** 预置管理员首次登录强制改密：为 true 时禁止进入业务界面，须先修改密码 */
  mustChangePassword: boolean;
}

// 登录失败锁定（进程内，单实例部署适用）：连续失败 N 次后锁定 M 分钟
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function loginLockRemaining(username: string): number {
  const rec = loginAttempts.get(username);
  if (!rec || !(rec.lockedUntil > Date.now())) {
    return 0;
  }
  return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
}

export function recordLoginFailure(username: string): boolean {
  const rec = loginAttempts.get(username) ?? { count: 0, lockedUntil: 0 };
  const maxAttempts = config.login.maxAttempts;
  rec.count += 1;
  if (rec.count >= maxAttempts) {
    rec.lockedUntil = Date.now() + config.login.lockMinutes * 60 * 1000;
    rec.count = 0;
  }
  loginAttempts.set(username, rec);
  return rec.lockedUntil > 0;
}

export function resetLoginFailures(username: string): void {
  loginAttempts.delete(username);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: number;
  username: string;
  role: string;
}

export function signToken(user: { id: number; username: string; role: string }): string {
  // 需求基线：永久保持登录，不设置过期时间（账号禁用由请求态校验拦截）
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, config.jwtSecret);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'number') {
      return null;
    }
    return { sub: decoded.sub, username: String(decoded.username ?? ''), role: String(decoded.role ?? '') };
  } catch {
    return null;
  }
}

interface DbUserStatusRow {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  status: string;
  avatarId: number | null;
  mustChangePassword: boolean;
}

/** 加载已通过审核的用户；未通过/被禁用/不存在返回 null */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const row = await queryOne<DbUserStatusRow>(
    'SELECT id, username, display_name AS displayName, role, status, avatar AS avatarId, must_change_password AS mustChangePassword FROM users WHERE id = ?',
    [userId],
  );
  if (!row || row.status !== 'approved') {
    return null;
  }
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    avatarId: row.avatarId != null ? Number(row.avatarId) : null,
    mustChangePassword: !!row.mustChangePassword,
  };
}

export const authRequired: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      res.status(401).json({ error: '未登录或登录已过期' });
      return;
    }
    const user = await loadAuthUser(payload.sub);
    if (!user) {
      res.status(401).json({ error: '账号不存在或未通过审核' });
      return;
    }
    req.user = user;
    next();
  })().catch(next);
};

export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  next();
}

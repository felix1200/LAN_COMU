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
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: config.tokenTtlSeconds,
  });
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
}

/** 加载已通过审核的用户；未通过/被禁用/不存在返回 null */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const row = await queryOne<DbUserStatusRow>(
    'SELECT id, username, display_name AS displayName, role, status FROM users WHERE id = ?',
    [userId],
  );
  if (!row || row.status !== 'approved') {
    return null;
  }
  return { id: Number(row.id), username: row.username, displayName: row.displayName, role: row.role };
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

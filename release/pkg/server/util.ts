// ABOUTME: 服务端通用工具：异步路由包装、HTTP 错误、参数校验

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 带 status 的业务错误，全局错误中间件按 status 返回 */
export class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 包装 async 路由，未捕获异常进入 Express 错误中间件 */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function requireString(value: unknown, field: string, max = 255): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} 不能为空`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} 不能为空`);
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} 长度不能超过 ${max} 字`);
  }
  return trimmed;
}

export function requireId(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `${field} 不合法`);
  }
  return n;
}

export function requireIdArray(value: unknown, field: string, maxItems = 200): number[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${field} 必须是数组`);
  }
  const ids = [...new Set(value.map((v) => Number(v)))];
  if (ids.length === 0 || ids.length > maxItems || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new HttpError(400, `${field} 不合法`);
  }
  return ids;
}

export function toISO(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// ABOUTME: 管理员路由：注册审核、账号管理（禁用/启用/重置密码/删除=禁用）、数据概览

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { adminRequired, authRequired } from '../auth';
import { execute, query, queryOne } from '../db';
import { forceDisconnect, onlineUserIds, sendToUser } from '../hub';
import { ah, HttpError, requireId } from '../util';

const router = Router();

router.use(authRequired, adminRequired);

type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';
const STATUSES: UserStatus[] = ['pending', 'approved', 'rejected', 'disabled'];

interface AdminUserRow {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  status: UserStatus;
  avatarId: number | null;
  rejectReason: string | null;
  createdAt: Date | string;
  reviewedAt: Date | string | null;
  reviewerName: string | null;
}

function toISOOrNull(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

const USER_COLUMNS = `u.id, u.username, u.display_name AS displayName, u.role, u.status,
  u.avatar AS avatarId, u.reject_reason AS rejectReason, u.created_at AS createdAt,
  u.reviewed_at AS reviewedAt, r.display_name AS reviewerName`;

// 用户列表（按状态/关键字过滤）
router.get('/users', ah(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  const params: unknown[] = [];
  let sql = `SELECT ${USER_COLUMNS}
    FROM users u
    LEFT JOIN users r ON r.id = u.reviewed_by
    WHERE 1 = 1`;
  if (status && (STATUSES as string[]).includes(status)) {
    sql += ' AND u.status = ?';
    params.push(status);
  }
  if (keyword) {
    sql += ' AND (u.username LIKE ? OR u.display_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY u.id DESC LIMIT 500';
  const rows = await query<AdminUserRow>(sql, params);
  res.json({
    users: rows.map((r) => ({
      id: Number(r.id),
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      status: r.status,
      avatarId: r.avatarId != null ? Number(r.avatarId) : null,
      rejectReason: r.rejectReason,
      createdAt: toISOOrNull(r.createdAt),
      reviewedAt: toISOOrNull(r.reviewedAt),
      reviewerName: r.reviewerName,
    })),
  });
}));

async function loadManagedUser(userId: number): Promise<AdminUserRow> {
  const user = await queryOne<AdminUserRow>(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users r ON r.id = u.reviewed_by WHERE u.id = ?`,
    [userId],
  );
  if (!user) {
    throw new HttpError(404, '用户不存在');
  }
  return user;
}

async function setStatus(userId: number, status: UserStatus, reviewerId: number, reason: string | null): Promise<void> {
  await execute('UPDATE users SET status = ?, reject_reason = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?', [
    status,
    reason,
    reviewerId,
    userId,
  ]);
}

/** 禁用并强制下线（删除账号=标记禁用，保留历史聊天记录） */
async function disableUser(userId: number, actorId: number): Promise<void> {
  const user = await loadManagedUser(userId);
  if (userId === actorId) {
    throw new HttpError(400, '不能禁用自己的账号');
  }
  if (user.role === 'admin') {
    throw new HttpError(400, '不能禁用管理员账号');
  }
  if (user.status !== 'approved') {
    throw new HttpError(400, '仅已启用的账号可以禁用');
  }
  await setStatus(userId, 'disabled', actorId, null);
  sendToUser(userId, { type: 'account:disabled', payload: null });
  forceDisconnect(userId);
}

// 审核通过
router.post('/users/:id/approve', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const user = await loadManagedUser(userId);
  if (!['pending', 'rejected', 'disabled'].includes(user.status)) {
    throw new HttpError(400, '该用户无需审核');
  }
  await setStatus(userId, 'approved', req.user!.id, null);
  sendToUser(userId, { type: 'account:approved', payload: null });
  res.json({ ok: true });
}));

// 审核驳回（仅限待审核用户）
router.post('/users/:id/reject', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 255) : '';
  const user = await loadManagedUser(userId);
  if (user.status !== 'pending') {
    throw new HttpError(400, '仅待审核用户可以驳回');
  }
  await setStatus(userId, 'rejected', req.user!.id, reason || null);
  res.json({ ok: true });
}));

// 禁用账号（并强制下线）
router.post('/users/:id/disable', ah(async (req, res) => {
  await disableUser(requireId(req.params.id, '用户'), req.user!.id);
  res.json({ ok: true });
}));

// 删除账号 = 标记禁用（保留历史聊天记录）
router.delete('/users/:id', ah(async (req, res) => {
  await disableUser(requireId(req.params.id, '用户'), req.user!.id);
  res.json({ ok: true });
}));

// 恢复账号
router.post('/users/:id/enable', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const user = await loadManagedUser(userId);
  if (user.status !== 'disabled') {
    throw new HttpError(400, '仅已禁用的账号可以恢复');
  }
  await setStatus(userId, 'approved', req.user!.id, null);
  res.json({ ok: true });
}));

// 重置密码
router.post('/users/:id/reset-password', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 6 || password.length > 72) {
    throw new HttpError(400, '密码长度需为 6-72 位');
  }
  await loadManagedUser(userId);
  const hash = await bcrypt.hash(password, 10);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  forceDisconnect(userId);
  res.json({ ok: true });
}));

// 数据概览（最小运营指标，不涉及会话干预）
router.get('/stats', ah(async (_req, res) => {
  const byStatus = await query<{ status: UserStatus; cnt: number }>(
    'SELECT status, COUNT(*) AS cnt FROM users GROUP BY status',
  );
  const statusMap: Record<string, number> = {};
  for (const row of byStatus) {
    statusMap[row.status] = Number(row.cnt);
  }
  const msgTotal = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM messages');
  const msgToday = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM messages WHERE created_at >= CURDATE()',
  );
  const fileStats = await queryOne<{ cnt: number; bytes: number | string }>(
    'SELECT COUNT(*) AS cnt, COALESCE(SUM(size), 0) AS bytes FROM files',
  );
  const groupCount = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM conversations WHERE type = 'group'",
  );
  res.json({
    stats: {
      users: {
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
        pending: statusMap.pending ?? 0,
        approved: statusMap.approved ?? 0,
        rejected: statusMap.rejected ?? 0,
        disabled: statusMap.disabled ?? 0,
      },
      conversations: { group: Number(groupCount?.cnt ?? 0) },
      messages: { total: Number(msgTotal?.cnt ?? 0), today: Number(msgToday?.cnt ?? 0) },
      files: { count: Number(fileStats?.cnt ?? 0), bytes: Number(fileStats?.bytes ?? 0) },
      online: onlineUserIds().length,
    },
  });
}));

export default router;
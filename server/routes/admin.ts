// ABOUTME: 管理员路由：注册审核、用户管理（禁用/重置密码/删除）、群组管理、运营统计

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { adminRequired, authRequired } from '../auth';
import { execute, query, queryOne } from '../db';
import { forceDisconnect, onlineUserIds, sendToUser } from '../hub';
import { deleteConversation } from '../services/conversations';
import { ah, HttpError, requireId, requireString } from '../util';

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

// 用户列表（按状态/关键字过滤）
router.get('/users', ah(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  const params: unknown[] = [];
  let sql = `
    SELECT u.id, u.username, u.display_name AS displayName, u.role, u.status,
           u.reject_reason AS rejectReason, u.created_at AS createdAt,
           u.reviewed_at AS reviewedAt, r.display_name AS reviewerName
    FROM users u
    LEFT JOIN users r ON r.id = u.reviewed_by
    WHERE 1 = 1
  `;
  if (status && STATUSES.includes(status as UserStatus)) {
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
      rejectReason: r.rejectReason,
      createdAt: toISOOrNull(r.createdAt),
      reviewedAt: toISOOrNull(r.reviewedAt),
      reviewerName: r.reviewerName,
    })),
  });
}));

async function loadManagedUser(userId: number): Promise<AdminUserRow> {
  const user = await queryOne<AdminUserRow>(
    `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.status,
            u.reject_reason AS rejectReason, u.created_at AS createdAt,
            u.reviewed_at AS reviewedAt, NULL AS reviewerName
     FROM users u WHERE u.id = ?`,
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

// 审核通过
router.post('/users/:id/approve', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const user = await loadManagedUser(userId);
  if (user.status !== 'pending' && user.status !== 'rejected' && user.status !== 'disabled') {
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
  const userId = requireId(req.params.id, '用户');
  const user = await loadManagedUser(userId);
  if (userId === req.user!.id) {
    throw new HttpError(400, '不能禁用自己的账号');
  }
  if (user.role === 'admin') {
    throw new HttpError(400, '不能禁用管理员账号');
  }
  if (user.status !== 'approved') {
    throw new HttpError(400, '仅已启用的账号可以禁用');
  }
  await setStatus(userId, 'disabled', req.user!.id, null);
  sendToUser(userId, { type: 'account:disabled', payload: null });
  forceDisconnect(userId);
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
  if (password.length < 8 || password.length > 72) {
    throw new HttpError(400, '密码长度需为 8-72 位');
  }
  await loadManagedUser(userId);
  const hash = await bcrypt.hash(password, 10);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  forceDisconnect(userId);
  res.json({ ok: true });
}));

// 删除用户（仅限未通过审核的账号，避免产生孤儿数据）
router.delete('/users/:id', ah(async (req, res) => {
  const userId = requireId(req.params.id, '用户');
  const user = await loadManagedUser(userId);
  if (user.role === 'admin') {
    throw new HttpError(400, '不能删除管理员账号');
  }
  if (user.status !== 'pending' && user.status !== 'rejected') {
    throw new HttpError(400, '仅待审核或已驳回的账号可以删除，已启用账号请使用禁用');
  }
  await execute('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ ok: true });
}));

// 群聊列表（全站）
router.get('/groups', ah(async (_req, res) => {
  const rows = await query<{
    id: number;
    name: string;
    creatorName: string | null;
    memberCount: number;
    messageCount: number;
    createdAt: Date | string;
  }>(
    `SELECT c.id, c.name,
            u.display_name AS creatorName,
            (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS memberCount,
            (SELECT COUNT(*) FROM messages msg WHERE msg.conversation_id = c.id) AS messageCount,
            c.created_at AS createdAt
     FROM conversations c
     LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.type = 'group'
     ORDER BY c.id DESC
     LIMIT 500`,
  );
  res.json({
    groups: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      creatorName: r.creatorName ?? '未知',
      memberCount: Number(r.memberCount),
      messageCount: Number(r.messageCount),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  });
}));

// 解散群聊
router.delete('/groups/:id', ah(async (req, res) => {
  const conversationId = requireId(req.params.id, '群聊');
  const conv = await queryOne<{ id: number; type: string }>('SELECT id, type FROM conversations WHERE id = ?', [conversationId]);
  if (!conv || conv.type !== 'group') {
    throw new HttpError(404, '群聊不存在');
  }
  await deleteConversation(conversationId);
  res.json({ ok: true });
}));

// 运营概览
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
  const directCount = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM conversations WHERE type = 'direct'",
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
      conversations: { group: Number(groupCount?.cnt ?? 0), direct: Number(directCount?.cnt ?? 0) },
      messages: { total: Number(msgTotal?.cnt ?? 0), today: Number(msgToday?.cnt ?? 0) },
      files: { count: Number(fileStats?.cnt ?? 0), bytes: Number(fileStats?.bytes ?? 0) },
      online: onlineUserIds().length,
    },
  });
}));

export default router;

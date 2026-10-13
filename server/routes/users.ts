// ABOUTME: 通讯录路由：查询已通过审核的用户列表

import { Router } from 'express';
import { authRequired } from '../auth';
import { query } from '../db';
import { ah } from '../util';

const router = Router();

interface ContactRow {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
}

// 用户列表（通讯录），支持关键字过滤
router.get('/users', authRequired, ah(async (req, res) => {
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  const params: unknown[] = [];
  let sql = "SELECT id, username, display_name AS displayName, role FROM users WHERE status = 'approved'";
  if (keyword) {
    sql += ' AND (username LIKE ? OR display_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY display_name ASC, id ASC LIMIT 500';
  const rows = await query<ContactRow>(sql, params);
  res.json({
    users: rows.map((r) => ({
      id: Number(r.id),
      username: r.username,
      displayName: r.displayName,
      role: r.role,
    })),
  });
}));

export default router;

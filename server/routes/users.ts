// ABOUTME: 通讯录与个人资料路由：用户列表、头像上传

import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { authRequired } from '../auth';
import { config } from '../config';
import { execute, query, queryOne } from '../db';
import { ah, HttpError } from '../util';

const router = Router();

interface ContactRow {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarId: number | null;
}

// 用户列表（通讯录），支持用户名/真实姓名模糊匹配
router.get('/users', authRequired, ah(async (req, res) => {
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  const params: unknown[] = [];
  let sql = "SELECT id, username, display_name AS displayName, role, avatar AS avatarId FROM users WHERE status = 'approved'";
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
      avatarId: r.avatarId != null ? Number(r.avatarId) : null,
    })),
  });
}));

// 头像上传：≤2MB，jpg/png/webp；保存到本地磁盘，users.avatar 记录文件 ID
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 16).replace(/[^\w.]/g, '');
      cb(null, `avatar-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype;
    if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
      cb(null, true);
    } else {
      cb(new HttpError(400, '仅支持 jpg / png / webp 格式'));
    }
  },
});

router.post('/users/me/avatar', authRequired, (req, res) => {
  avatarUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string } | undefined)?.code;
      const isHttp = err instanceof HttpError;
      res
        .status(isHttp ? err.status : code === 'LIMIT_FILE_SIZE' ? 400 : 500)
        .json({ error: isHttp ? err.message : code === 'LIMIT_FILE_SIZE' ? '头像不能超过 2MB' : '头像上传失败' });
      return;
    }
    void (async () => {
      try {
        const file = (req as Express.Request & { file?: Express.Multer.File }).file;
        if (!file) {
          throw new HttpError(400, '请选择头像文件');
        }
        // 还原中文文件名
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const { insertId } = await execute(
          'INSERT INTO files (uploader_id, original_name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?)',
          [req.user!.id, originalName, file.filename, file.mimetype, file.size],
        );
        await execute('UPDATE users SET avatar = ? WHERE id = ?', [insertId, req.user!.id]);
        res.json({ avatarId: insertId });
      } catch (e) {
        // 失败时清理已落盘的临时文件
        const f = (req as Express.Request & { file?: Express.Multer.File }).file;
        if (f && f.path && fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
        const status = e instanceof HttpError ? e.status : 500;
        res.status(status).json({ error: e instanceof HttpError ? e.message : '头像上传失败' });
      }
    })();
  });
});

/** 移除头像：置空 users.avatar，并尽力清理文件记录与磁盘文件 */
router.delete('/users/me/avatar', authRequired, ah(async (req, res) => {
  const row = await queryOne<{ fid: number | null; stored: string | null }>(
    'SELECT avatar AS fid FROM users WHERE id = ?',
    [req.user!.id],
  );
  await execute('UPDATE users SET avatar = NULL WHERE id = ?', [req.user!.id]);
  if (row?.fid) {
    const fileRow = await queryOne<{ stored_name: string }>('SELECT stored_name FROM files WHERE id = ?', [row.fid]);
    try {
      await execute('DELETE FROM files WHERE id = ?', [row.fid]);
    } catch {
      // 忽略：文件行残留不影响功能
    }
    if (fileRow?.stored_name) {
      try {
        const p = path.join(config.uploadDir, fileRow.stored_name);
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
      } catch {
        // 忽略磁盘清理失败
      }
    }
  }
  res.json({ ok: true });
}));

/** 获取单个用户公开信息（含头像），供个人资料查看 */
router.get('/users/:id', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '参数错误');
  const row = await queryOne<ContactRow & { createdAt: string; status: string }>(
    `SELECT id, username, display_name AS displayName, role, avatar AS avatarId, created_at AS createdAt, status
     FROM users WHERE id = ?`,
    [id],
  );
  if (!row) throw new HttpError(404, '用户不存在');
  res.json({
    user: {
      id: Number(row.id),
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      avatarId: row.avatarId != null ? Number(row.avatarId) : null,
    },
  });
}));

export default router;
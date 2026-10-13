// ABOUTME: 文件路由：本地上传（multer 落盘）与鉴权下载/预览

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { authRequired } from '../auth';
import { config } from '../config';
import { execute, queryOne } from '../db';
import { ah, HttpError, requireId } from '../util';

const router = Router();

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 16).replace(/[^\w.-]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

/** 包装 multer，把超限等错误转成统一 JSON */
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, `文件大小超过限制（${config.maxUploadMb}MB）`));
        return;
      }
      next(err instanceof Error ? err : new Error('文件上传失败'));
      return;
    }
    next();
  });
}

/** multer 以 latin1 解析文件名，还原 UTF-8 中文名 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8').trim();
  return (decoded || name).slice(0, 255);
}

interface FileRow {
  id: number;
  uploader_id: number;
  original_name: string;
  stored_name: string;
  mime: string;
  size: number;
}

// 上传文件
router.post('/files/upload', authRequired, uploadSingle, ah(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, '未接收到文件');
  }
  const originalName = decodeOriginalName(req.file.originalname);
  const mime = req.file.mimetype || 'application/octet-stream';
  const { insertId } = await execute(
    'INSERT INTO files (uploader_id, original_name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?)',
    [req.user!.id, originalName, req.file.filename, mime, req.file.size],
  );
  res.status(201).json({
    file: { id: insertId, name: originalName, size: req.file.size, mime },
  });
}));

/** 下载权限：上传者本人 / 管理员 / 与文件同会话的成员 / 任意用户的头像 */
async function canAccessFile(userId: number, role: string, file: FileRow): Promise<boolean> {
  if (Number(file.uploader_id) === userId || role === 'admin') {
    return true;
  }
  const avatarRow = await queryOne<{ ok: number }>('SELECT 1 AS ok FROM users WHERE avatar = ?', [file.id]);
  if (avatarRow) {
    return true; // 头像对全体已审核用户可见
  }
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.file_id = ? LIMIT 1`,
    [userId, file.id],
  );
  return row !== null;
}

// 下载。头像（身份标识）以 image inline 返回以便展示；聊天中的文件一律 attachment 仅下载（需求基线：不做在线预览）
router.get('/files/:id', authRequired, ah(async (req, res) => {
  const fileId = requireId(req.params.id, '文件');
  const file = await queryOne<FileRow>('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) {
    throw new HttpError(404, '文件不存在');
  }
  if (!(await canAccessFile(req.user!.id, req.user!.role, file))) {
    throw new HttpError(403, '无权访问该文件');
  }
  const filePath = path.join(config.uploadDir, file.stored_name);
  if (!filePath.startsWith(config.uploadDir) || !fs.existsSync(filePath)) {
    throw new HttpError(404, '文件已丢失，请联系管理员');
  }

  const isAvatar = (await queryOne<{ ok: number }>('SELECT 1 AS ok FROM users WHERE avatar = ?', [file.id])) !== null;
  const isImage = file.mime.startsWith('image/');
  const inline = isAvatar && isImage;
  res.setHeader('Content-Type', inline ? file.mime : 'application/octet-stream');
  res.setHeader('Content-Length', String(file.size));
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
  );
  fs.createReadStream(filePath).pipe(res);
}));

export default router;

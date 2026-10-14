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

// 上传文件（单次）
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

// ---------- 分片上传（应对大文件在弱网/代理下的连接中断）----------
const chunksBase = path.join(config.uploadDir, '.chunks');
fs.mkdirSync(chunksBase, { recursive: true });

/** Windows 上杀软实时扫描/文件锁可能导致瞬时 EBUSY/EPERM/ENOENT，做有限重试 */
function retryFs<T>(label: string, fn: () => T, attempts = 5): T {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      const retriable = code === 'EBUSY' || code === 'EPERM' || code === 'ENOENT' || code === 'EACCES' || code === 'ENOTEMPTY';
      // 最后一次、或非可重试错误立即抛出
      if (i === attempts - 1 || !retriable) {
        break;
      }
      // 同步退避：20ms, 40ms, 80ms, 160ms
      const wait = 20 * 2 ** i;
      const end = Date.now() + wait;
      while (Date.now() < end) {
        // 忙等极短时间，避免在请求上下文中引入异步复杂度
      }
    }
  }
  void label;
  throw lastErr instanceof Error ? lastErr : new Error(`${label} 失败`);
}

/** 原子写：先写临时文件再 rename，避免读到半截分片（Windows 杀软扫描更稳） */
function atomicWrite(target: string, data: Buffer): void {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  retryFs('分片写入', () => {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  });
}

/** chunk 走内存，写入后立即落到 .chunks/<uploadId>_<index>.part */
const chunkStorage = multer.memoryStorage();
const chunkMultipart = multer({ storage: chunkStorage, limits: { fileSize: 20 * 1024 * 1024 } });

function uploadChunkSingle(req: Request, res: Response, next: NextFunction): void {
  chunkMultipart.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, '单次分片超过 20MB'));
        return;
      }
      next(err instanceof Error ? err : new Error('分片上传失败'));
      return;
    }
    next();
  });
}

/** 校验并解析分片元数据 */
function assertUploadMeta<T extends Record<string, unknown>>(
  body: T,
): { uploadId: string; chunkCount: number; totalSize: number } {
  const uploadId = String(body.uploadId ?? '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId)) {
    throw new HttpError(400, '上传 ID 非法');
  }
  const chunkCount = Number(body.chunkCount);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 512) {
    throw new HttpError(400, '分片数量非法');
  }
  const totalSize = Number(body.totalSize);
  if (!Number.isInteger(totalSize) || totalSize < 1) {
    throw new HttpError(400, '文件大小非法');
  }
  if (totalSize > config.maxUploadMb * 1024 * 1024) {
    throw new HttpError(413, `文件大小超过限制（${config.maxUploadMb}MB）`);
  }
  return { uploadId, chunkCount, totalSize };
}

// 上传单个分片
router.post('/files/upload/chunk', authRequired, uploadChunkSingle, ah(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, '未接收到分片');
  }
  const uploadId = String(req.body?.uploadId ?? '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId)) {
    throw new HttpError(400, '上传 ID 非法');
  }
  const chunkIndex = Number(req.body?.chunkIndex);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 512) {
    throw new HttpError(400, '分片序号非法');
  }
  const f = req.file as Express.Multer.File;
  try {
    atomicWrite(path.join(chunksBase, `${uploadId}_${chunkIndex}.part`), f.buffer);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // 写盘失败多为目录权限/磁盘满/杀软占用，给出可操作的明确错误而非笼统失败
    if (code === 'EACCES' || code === 'EPERM') {
      throw new HttpError(500, `服务器无写入权限：${config.uploadDir}，请检查目录权限或杀软拦截`);
    }
    if (code === 'ENOSPC') {
      throw new HttpError(507, '服务器磁盘空间不足');
    }
    throw new HttpError(500, '分片写入失败，请重试或联系管理员');
  }
  console.log(`[upload] received chunk ${chunkIndex} uploadId=${uploadId} bytes=${f.buffer.length}`);
  res.json({ ok: true, received: f.buffer.length });
}));

// 已完成合并的 uploadId -> 文件 DTO（用于客户端响应丢失后安全重试，1 小时过期）
const finalizedUploads = new Map<string, { file: { id: number; name: string; size: number; mime: string }; at: number }>();
const FINALIZE_TTL_MS = 60 * 60 * 1000;

function rememberFinalized(uploadId: string, file: { id: number; name: string; size: number; mime: string }): void {
  finalizedUploads.set(uploadId, { file, at: Date.now() });
  if (finalizedUploads.size > 1000) {
    const now = Date.now();
    for (const [k, v] of finalizedUploads) {
      if (now - v.at > FINALIZE_TTL_MS) {
        finalizedUploads.delete(k);
      }
    }
  }
}

// 分片全部到齐后合并落盘
router.post('/files/upload/finalize', authRequired, ah(async (req, res) => {
  const meta = assertUploadMeta(req.body ?? {});
  const originalName = String(req.body?.originalName ?? '').trim().slice(0, 255) || '未命名文件';
  const mime = String(req.body?.mime ?? '') || 'application/octet-stream';

  // 幂等：该 uploadId 已成功合并（上次响应可能丢失），直接返回原结果
  const done = finalizedUploads.get(meta.uploadId);
  if (done && Date.now() - done.at < FINALIZE_TTL_MS) {
    res.status(200).json({ file: done.file, deduplicated: true });
    return;
  }

  const ext = path.extname(originalName).slice(0, 16).replace(/[^\w.-]/g, '');
  const stored = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const finalPath = path.join(config.uploadDir, stored);

  const chunkPaths: string[] = [];
  try {
    for (let i = 0; i < meta.chunkCount; i += 1) {
      const p = path.join(chunksBase, `${meta.uploadId}_${i}.part`);
      if (!retryFs('分片读取', () => fs.existsSync(p))) {
        throw new HttpError(400, `分片缺失（${i}），请重新上传`);
      }
      chunkPaths.push(p);
    }
    // 先校验总大小，再顺序合并；读分片同样对文件锁重试
    let size = 0;
    const buffers: Buffer[] = [];
    for (const p of chunkPaths) {
      const buf = retryFs('分片读取', () => fs.readFileSync(p));
      size += buf.length;
      if (size > meta.totalSize) {
        throw new HttpError(413, `文件大小超过限制（${config.maxUploadMb}MB）`);
      }
      buffers.push(buf);
    }
    if (size !== meta.totalSize) {
      throw new HttpError(400, `文件大小校验失败（期望 ${meta.totalSize}，实得 ${size}），请重新上传`);
    }
    // 原子落盘：先写临时文件，关闭后再 rename 为最终名，规避杀软对"正在写的文件"加锁
    const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
    retryFs('文件落盘', () => {
      const fd = fs.openSync(tmpPath, 'w');
      try {
        for (const buf of buffers) {
          fs.writeSync(fd, buf);
        }
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, finalPath);
    });

    let fileId: number;
    try {
      const { insertId } = await execute(
        'INSERT INTO files (uploader_id, original_name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?)',
        [req.user!.id, originalName, stored, mime, size],
      );
      fileId = insertId;
    } catch (dbErr) {
      // DB 写失败时清理孤儿文件，避免残留
      fs.rmSync(finalPath, { force: true });
      throw dbErr;
    }
    const fileDto = { id: fileId, name: originalName, size, mime };
    rememberFinalized(meta.uploadId, fileDto);
    console.log(`[upload] finalize ok uploadId=${meta.uploadId} fileId=${fileId} chunks=${meta.chunkCount} size=${size} name=${originalName}`);
    res.status(201).json({ file: fileDto });
  } finally {
    for (const p of chunkPaths) {
      try {
        fs.rmSync(p, { force: true });
      } catch {
        // 清理失败不影响响应
      }
    }
  }
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

  // 带 ?inline=1 且为图片时，允许以内联（image 流）返回，供聊天图片缩略图预览使用（鉴权已在上方校验）
  const wantInline = req.query.inline === '1' || req.query.inline === 'true';
  const isAvatar = (await queryOne<{ ok: number }>('SELECT 1 AS ok FROM users WHERE avatar = ?', [file.id])) !== null;
  const isImage = file.mime.startsWith('image/');
  const inline = isImage && (isAvatar || wantInline);
  res.setHeader('Content-Type', inline ? file.mime : 'application/octet-stream');
  res.setHeader('Content-Length', String(file.size));
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
  );
  fs.createReadStream(filePath).pipe(res);
}));

export default router;

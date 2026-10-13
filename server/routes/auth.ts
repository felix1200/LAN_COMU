// ABOUTME: 认证路由：注册（待审核）、登录（状态校验）、当前用户、修改密码

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authRequired, signToken } from '../auth';
import { execute, queryOne } from '../db';
import { ah, HttpError, requireString } from '../util';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const BCRYPT_MAX_PASSWORD_LEN = 72;

interface UserAuthRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  reject_reason: string | null;
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new HttpError(400, '密码长度至少 8 位');
  }
  if (password.length > BCRYPT_MAX_PASSWORD_LEN) {
    throw new HttpError(400, `密码长度不能超过 ${BCRYPT_MAX_PASSWORD_LEN} 位`);
  }
}

// 注册：创建 pending 用户，等待管理员审核
router.post('/auth/register', ah(async (req, res) => {
  const username = requireString(req.body?.username, '用户名', 32);
  const displayName = requireString(req.body?.displayName, '姓名', 64);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, '用户名需为 3-32 位字母、数字或下划线');
  }
  validatePassword(password);

  const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    throw new HttpError(409, '该用户名已被注册');
  }

  const hash = await bcrypt.hash(password, 10);
  await execute('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', [
    username,
    hash,
    displayName,
  ]);
  res.status(201).json({ message: '注册申请已提交，管理员审核通过后即可登录' });
}));

// 登录：校验 bcrypt 哈希与账号审核状态
router.post('/auth/login', ah(async (req, res) => {
  const username = requireString(req.body?.username, '用户名', 64);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = await queryOne<UserAuthRow>('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    throw new HttpError(401, '用户名或密码错误');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new HttpError(401, '用户名或密码错误');
  }
  if (user.status === 'pending') {
    throw new HttpError(403, '账号正在等待管理员审核，请稍后再试');
  }
  if (user.status === 'rejected') {
    throw new HttpError(403, `账号审核未通过${user.reject_reason ? `：${user.reject_reason}` : ''}`);
  }
  if (user.status === 'disabled') {
    throw new HttpError(403, '账号已被禁用，请联系管理员');
  }

  const token = signToken({ id: Number(user.id), username: user.username, role: user.role });
  res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
  });
}));

// 当前登录用户
router.get('/auth/me', authRequired, ah(async (req, res) => {
  res.json({ user: req.user });
}));

// 修改密码
router.put('/auth/password', authRequired, ah(async (req, res) => {
  const oldPassword = typeof req.body?.oldPassword === 'string' ? req.body.oldPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  validatePassword(newPassword);

  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user!.id]);
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  const ok = await bcrypt.compare(oldPassword, row.password_hash);
  if (!ok) {
    throw new HttpError(400, '原密码不正确');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user!.id]);
  res.json({ message: '密码已更新' });
}));

export default router;

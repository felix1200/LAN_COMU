// ABOUTME: 认证路由：注册（待审核）、登录（状态校验）、当前用户、修改密码

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authRequired, loginLockRemaining, recordLoginFailure, resetLoginFailures, signToken } from '../auth';
import { execute, queryOne } from '../db';
import { ah, HttpError, requireString } from '../util';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/; // 需求基线：3-20 位，字母/数字/下划线，唯一
const BCRYPT_MAX_PASSWORD_LEN = 72;

interface UserAuthRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  reject_reason: string | null;
  avatar: number | null;
  must_change_password: number;
}

function validatePassword(password: string): void {
  // 需求基线：至少 6 位，不强制复杂度
  if (password.length < 6) {
    throw new HttpError(400, '密码长度至少 6 位');
  }
  if (password.length > BCRYPT_MAX_PASSWORD_LEN) {
    throw new HttpError(400, `密码长度不能超过 ${BCRYPT_MAX_PASSWORD_LEN} 位`);
  }
}

// 注册：创建 pending 用户，等待管理员审核（仅普通用户，管理员由后台预置）
router.post('/auth/register', ah(async (req, res) => {
  const username = requireString(req.body?.username, '用户名', 20);
  const displayName = requireString(req.body?.displayName, '姓名', 64);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, '用户名需为 3-20 位字母、数字或下划线');
  }
  if (!displayName.trim()) {
    throw new HttpError(400, '请填写真实姓名');
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

// 登录：失败锁定 → 校验 bcrypt 哈希 → 账号审核状态
router.post('/auth/login', ah(async (req, res) => {
  const username = requireString(req.body?.username, '用户名', 64);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const lockSeconds = loginLockRemaining(username);
  if (lockSeconds > 0) {
    const minutes = Math.ceil(lockSeconds / 60);
    throw new HttpError(429, `密码连续错误次数过多，账号已锁定，请约 ${minutes} 分钟后重试`);
  }

  const user = await queryOne<UserAuthRow>('SELECT * FROM users WHERE username = ?', [username]);
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) {
    recordLoginFailure(username);
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

  resetLoginFailures(username);
  const token = signToken({ id: Number(user.id), username: user.username, role: user.role });
  res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      avatarId: user.avatar != null ? Number(user.avatar) : null,
      mustChangePassword: user.must_change_password === 1,
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
  await execute('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
    hash,
    req.user!.id,
  ]);
  res.json({ message: '密码已更新' });
}));

export default router;

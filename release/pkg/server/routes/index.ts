// ABOUTME: API 路由汇总入口

import { Router } from 'express';
import adminRouter from './admin';
import authRouter from './auth';
import conversationsRouter from './conversations';
import filesRouter from './files';
import usersRouter from './users';

const router = Router();

// 健康检查（无需鉴权）
router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/api', authRouter);
router.use('/api', usersRouter);
router.use('/api', conversationsRouter);
router.use('/api', filesRouter);
router.use('/api/admin', adminRouter);

export default router;

// ABOUTME: Vite integration for Express server
// ABOUTME: Handles dev middleware and production static file serving

import type { Application, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from './config';

// 注意：vite 仅在开发模式按需引入（import()）。生产环境绝不触碰 vite，
// 因此生产部署无需携带 vite/esbuild 等含原生二进制的依赖。

const isDev = config.isDev;

/**
 * 集成 Vite 开发服务器（中间件模式）
 */
export async function setupViteMiddleware(app: Application) {
  // 按需加载 vite 与其配置，避免在生产 bundle 顶层 require('vite')
  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import('vite'),
    import('../vite.config'),
  ]);

  const vite = await createViteServer({
    ...viteConfig,
    // 配置已在此处内联展开，禁止 Vite 再次加载 vite.config.ts，避免插件重复注册导致双重转换
    configFile: false,
    server: {
      ...viteConfig.server,
      middlewareMode: true,
    },
    appType: 'spa',
  });

  // 使用 Vite middleware
  app.use(vite.middlewares);

  console.log('🚀 Vite dev server initialized');
}

/**
 * 设置生产环境静态文件服务
 */
/**
 * 定位前端构建产物 dist/ 目录。
 * 不依赖 process.cwd()（用户从任意目录启动都可能跑偏），
 * 基于当前模块实际位置依次尝试常见相对路径。
 */
export function resolveDistPath(): string {
  const candidates = [
    // 基于 bundle 所在目录（dist-server/ 的上级 = 项目根/dist）
    path.resolve(__dirname, '..', 'dist'),
    // 兜底：基于启动时工作目录
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), 'dist-server', '..', 'dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0];
}

export function setupStaticServer(app: Application) {
  const distPath = resolveDistPath();

  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    console.error('❌ dist/index.html not found. 请确认 dist 目录已随程序一同拷贝。');
    console.error(`   尝试过的路径：`);
    console.error(`     - ${path.resolve(__dirname, '..', 'dist')}`);
    console.error(`     - ${path.resolve(process.cwd(), 'dist')}`);
    process.exit(1);
  }

  // 1. 服务静态文件（如果存在对应文件则直接返回）
  app.use(express.static(distPath));

  // 2. SPA fallback - 所有未处理的请求返回 index.html
  // 到达这里的请求说明：
  //   - 不是 API 请求（已被前面注册的路由处理）
  //   - 不是静态文件（express.static 未找到对应文件）
  //   - 需要返回 index.html 让前端路由处理
  app.use((req: Request, res: Response) => {
    // 未知 API 路径返回 JSON 404，不落到前端路由，便于诊断
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log('📦 Serving static files from dist/');
}

/**
 * 根据环境设置 Vite
 */
export async function setupVite(app: Application) {
  if (isDev) {
    await setupViteMiddleware(app);
  } else {
    setupStaticServer(app);
  }
}

// ABOUTME: Express server with Vite integration
// ABOUTME: Handles API routes and serves frontend in dev/prod modes

// 必须最先执行：无论从哪个工作目录启动，都先把 cwd 锁定到包根（修复 system32 启动问题）
import './ensure-cwd';
import { createServer, type Server } from 'http';
import express from 'express';
import { config, warnInsecureDefaults } from './config';
import { initDatabase } from './db';
import router from './routes/index';
import { setupVite } from './vite';
import { handleUpgrade, setupWsEndpoints } from './ws';

const isDev = config.isDev;
const port = config.port;
const hostname = process.env.HOSTNAME || 'localhost';
const app = express();
// 使用 http.createServer 包装 Express app，以便支持 WebSocket 等协议升级
const server = createServer(app);

async function startServer(): Promise<Server> {
  warnInsecureDefaults();
  // 初始化 MySQL：自动建库建表、种子管理员
  await initDatabase();
  // 请求日志：开发环境记录所有请求；生产环境仅记录 API 请求（便于定位上传等接口问题）
  if (isDev) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.url} - ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  } else {
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) {
        next();
        return;
      }
      const start = Date.now();
      res.on('finish', () => {
        console.log(`[api] ${req.method} ${req.url} - ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  // 添加请求体解析
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 注册 API 路由
  app.use(router);

  // 集成 Vite（开发模式）或静态文件服务（生产模式）
  await setupVite(app);

  // 注册 WebSocket 端点（/ws/*）并接管 upgrade
  setupWsEndpoints();
  server.on('upgrade', handleUpgrade);

  // 全局错误处理（必须声明 4 个参数，Express 才会识别为错误中间件）
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = 'status' in err ? (err as { status?: number }).status ?? 500 : 500;
    // 一律记录：4xx 也是排查上传/鉴权问题的重要线索；5xx 记录完整堆栈
    if (status >= 500) {
      console.error(`[error] ${req.method} ${req.url} -> ${status}:`, err.stack || err);
    } else {
      console.warn(`[warn] ${req.method} ${req.url} -> ${status}: ${err.message}`);
    }
    res.status(status).json({
      error: err.message || 'Internal server error',
    });
  });

  server.once('error', err => {
    console.error('Server error:', err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`\n✨ Server running at http://${hostname}:${port}`);
    console.log(`📝 Environment: ${isDev ? 'development' : 'production'}\n`);
  });

  return server;
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

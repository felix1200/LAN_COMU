// ABOUTME: 生产环境下把进程工作目录强制锁定到「包根」（dist-server 的上一级）。
// ABOUTME: 必须在读取 .env / 定位 dist、uploads 等任何相对路径前执行（在 server.ts 首个 import）。
// ABOUTME: 这样即使从 C:\Windows\system32、NSSM、任务计划等任意工作目录启动，路径也不会跑偏。

import path from 'path';

// 编译后该模块位于 dist-server/ 内，包根即其上一级；开发态位于 server/，上一级也是项目根。
const appRoot = path.resolve(__dirname, '..');

try {
  if (process.cwd() !== appRoot) {
    process.chdir(appRoot);
  }
} catch {
  // 极端情况下切换失败也不阻断：后续路径均已基于 __dirname 解析，这里仅尽力而为
}

export const APP_ROOT = appRoot;

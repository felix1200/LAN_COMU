# 项目上下文

企业内网即时通讯系统「内信 IntraChat」：React SPA + Express + WebSocket + MySQL + 本地磁盘文件存储，脱离公有云自建运行（目标部署环境：Windows 服务器）。设计规范见 `DESIGN.md`，部署说明见 `README.md`。

## 技术栈

- **前端**：React 19, Vite 7, TypeScript, Tailwind CSS 3, react-router-dom 7, lucide-react
- **后端**：Express 4, ws 8（WebSocket，无 socket.io）, mysql2, bcrypt, jsonwebtoken, multer
- **数据库**：MySQL 8 / MariaDB 10.4+（启动时自动建库建表，见 `server/db.ts` 与 `database/schema.sql`）
- **构建**：开发 `tsx watch`；生产 `vite build` + `tsup`（CJS 单文件 bundle，`--shims` 必需）

## 目录结构

```
├── server/                # 后端（TS，前后端同端口 5000）
│   ├── server.ts          # 入口：初始化 DB → 路由 → Vite/静态服务 → WS upgrade → 错误处理
│   ├── config.ts          # .env 配置加载；isDev = NODE_ENV!==production && COZE_PROJECT_ENV!==PROD
│   ├── db.ts              # mysql2 连接池；query/queryOne/execute 助手；种子管理员
│   ├── auth.ts            # JWT 签发/校验；authRequired/adminRequired；Express.Request.user 扩展
│   ├── hub.ts             # userId→sockets 注册表；sendToUser/sendToConversation/broadcastAll
│   ├── util.ts            # ah（async 路由包装）与 HttpError
│   ├── services/          # messages.ts / conversations.ts（DTO 组装，REST 与 WS 复用）
│   ├── routes/            # auth / users / conversations(含消息与已读) / files / admin / index
│   └── ws/                # registry.ts（端点注册+upgrade 分发，独立模块避免循环依赖）
│                          # chat.ts（/ws/chat：鉴权、在线状态、消息收发、已读、typing、心跳）
│                          # index.ts（setupWsEndpoints 编排）
├── src/                   # 前端 SPA
│   ├── main.tsx / App.tsx # 入口与路由守卫（/login /register /chat /admin）
│   ├── api/               # client.ts（fetch 封装、401 广播、文件 blob 下载）与 types.ts（DTO）
│   ├── store/auth.tsx     # 登录态（localStorage token + /api/auth/me 恢复）
│   ├── store/chat.tsx     # 聊天中枢：WS 连接、会话/消息/未读/在线/typing/已读、乐观发送
│   ├── lib/               # ws.ts（断线重连+心跳）、format.ts、toast.ts
│   ├── pages/             # LoginPage / RegisterPage / ChatPage / AdminPage
│   └── components/chat/   # Rail / ConversationList / ContactsPanel / ChatWindow / MessageItem /
│                          # Composer / CreateGroupModal / GroupInfoPanel / ChangePasswordModal
├── database/schema.sql    # 与 db.ts 一致的建表语句（供手动导入）
├── scripts/               # dev/build/start（.sh+.ps1 双套）、api-smoke.sh、ws-smoke.mjs
└── uploads/               # 聊天文件存储（运行时创建，勿入库）
```

## 需求基线合规要点（改动时勿破坏）

- **账号规则**：用户名 `^[a-zA-Z0-9_]{3,20}$`；密码仅要求 ≥6 位（≤72），不强制复杂度；注册三字段（用户名/密码/姓名），需管理员审核；登录失败连续 5 次锁 30 分钟（内存 Map，返回 429 + `lockedRemaining`）。
- **会话**：JWT 永久有效（`signToken` 不设 expiresIn），登录态恢复时仍经 `loadAuthUser` 校验状态。
- **消息**：仅 `text` / `file` 两种类型，无 image 类型、聊天文件不做在线预览（仅下载）；文字 ≤2000 字；私聊单条已读、群聊 X/Y 已读（用成员 `lastReadAt` 比对消息时间）。
- **搜索**：`GET /api/conversations/search?q=&limit=&before=`（注意参数名 `q`）检索本用户参与会话的历史文字消息；用户搜索见 `GET /api/users?keyword=`。
- **头像**：`POST /users/me/avatar`（multer 字段名 `file`，≤2MB，jpg/png/webp）+ `DELETE /users/me/avatar`；`users.avatar` 存 files.id；头像经 `GET /api/files/:id?inline=1` 内联展示。
- **文件**：≤100MB；下载需上传者本人或会话成员，前端一律 `fetch`+`blob`（禁裸 `<a download>`）。
- **管理员**：仅「注册审核」+「用户管理」两个面板；**无**群聊管理/统计/硬删除；删除账号 = `disable`（标记禁用、保留历史聊天记录），已删除用户不可重新删除。

## 包管理规范

**仅允许使用 pnpm**，严禁 npm/yarn。常用：`pnpm add <pkg>` / `pnpm add -D <pkg>` / `pnpm install`。

## 构建与运行

- 开发：`bash scripts/dev.sh`（或 `pnpm dev`）→ tsx watch，5000 端口，Vite 中间件 + HMR
- 生产：`bash scripts/build.sh` → `dist/` + `dist-server/server.js`；`bash scripts/start.sh` 启动（自动 `NODE_ENV=production`）
- Windows：对应 `scripts/*.ps1`
- 检查：`pnpm validate`（tsc + eslint + stylelint）
- 冒烟：`bash scripts/api-smoke.sh`（REST 全链路）与 `node scripts/ws-smoke.mjs`（WS 端到端），需服务已启动

## 架构要点（改动前必读）

1. **单端口**：HTTP/API/静态页/WebSocket 全部共用 `PORT`（默认 5000）；WS 端点仅挂 `/ws/*`，由 `server/ws/registry.ts` 按路径分发 upgrade，其余 upgrade 请求直接销毁（保护 Vite HMR）。
2. **WS 协议**：帧格式 `{ type, payload }`；客户端连接 `ws://host/ws/chat?token=<JWT>`；服务端鉴权完成后下发 `ready` 帧（客户端必须等 ready 再发消息）；30s 心跳。
3. **REST 与 WS 共用领域逻辑**：消息创建/已读等都在 `server/services/`，REST 仅是 WS 的降级通道；两边写数据后都通过 `hub.ts` 推送。
4. **会话 DTO 按视角生成**：`services/conversations.ts` 的 DTO 依请求用户计算标题/未读（私聊标题=对方姓名），给不同成员推送时需分别生成。
5. **文件鉴权**：下载要求上传者本人，或文件所在会话的成员；前端一律 `fetch`+`blob` 下载/预览（禁止裸 `<a download>`）。
6. **生产模式判定**：`config.isDev` 同时看 `NODE_ENV` 与 `COZE_PROJECT_ENV`（沙箱部署注入 PROD；Windows 部署由 start 脚本注入 NODE_ENV=production），新增环境相关逻辑勿只判断其一。
7. **tsup 打包**：`--external vite --shims` 缺一不可（vite 仅开发期使用；plugin-react 的 `import.meta.url` 需 shims 垫片才能在 CJS 运行）。

## 编码规范

- TypeScript strict：禁止隐式 `any` / `as any`；函数参数、返回值、事件对象、Express `req/res`、`catch` 均需类型或收窄；清理未使用的变量与导入。
- 样式只用 Tailwind 工具类 + `tailwind.config.js` 中注册的设计令牌（paper/ink/signal/amber 等），视觉规范遵循 `DESIGN.md`（调度室意象，禁止科技蓝/蓝紫渐变/大圆角/重阴影）。
- 时间戳/数字使用 `font-mono`；UI 文案为简体中文。
- 数据库时间统一 `TIMESTAMP(3)`；消息按自增 `id` 排序分页（`before=<id>&limit=`）。
- 异步 Express 处理器必须套 `ah()`；业务错误抛 `HttpError(status, message)`（错误中间件依赖 4 参数签名，勿删第 4 参）。

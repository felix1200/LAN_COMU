# 内信 IntraChat · 企业内网即时通讯系统

面向公司内网的自建 IM：注册审核、私聊/群聊、WebSocket 实时推送、文件传输、管理员后台。
**完全自包含**：Node.js + MySQL + 本地磁盘，不依赖任何公有云服务，可离线运行于内网 Windows 服务器。

## 功能清单

| 模块 | 功能 |
| --- | --- |
| 账号体系 | 用户注册 → 管理员审核（通过/驳回附原因）→ 登录；禁用/恢复；管理员重置密码；bcrypt 加密存储 |
| 私聊 | 通讯录发起单聊、在线状态、已读回执、正在输入提示 |
| 群聊 | 建群、邀请/移除成员、重命名、退群、群主标识 |
| 实时推送 | WebSocket（`/ws/chat`）消息秒达、在线状态广播、断线自动重连、心跳保活 |
| 文件传输 | 聊天内发送文件（≤100MB，大文件分片直传），仅鉴权下载、不做在线预览，本地磁盘存储 |
| 个人资料 | 上传/更换/移除头像（≤2MB，jpg/png/webp） |
| 管理后台 | 仅注册审核 + 用户管理（禁用/恢复/重置密码/删除=标记禁用并保留历史） |

## 技术栈

- **前端**：React 19 + Vite 7 + TypeScript + Tailwind CSS（SPA）
- **后端**：Node.js + Express 4 + `ws`（WebSocket）
- **数据库**：MySQL 8（兼容 MariaDB 10.4+），`mysql2` 驱动，启动时自动建库建表
- **认证**：JWT（`jsonwebtoken`）+ `bcrypt` 密码哈希
- **文件**：`multer` 本旁磁盘存储（默认 `./uploads`）

## 目录结构

```
├── server/                 # 后端（TypeScript，开发期 tsx 运行，生产期 tsup 打包）
│   ├── server.ts           # 入口：HTTP + WS 单端口
│   ├── config.ts           # 环境变量配置（.env）
│   ├── db.ts               # MySQL 连接池 + 自动建库建表 + 种子管理员
│   ├── auth.ts             # JWT 签发/校验、鉴权中间件
│   ├── hub.ts              # 在线状态与推送注册表
│   ├── services/           # 消息、会话领域逻辑
│   ├── routes/             # REST API（auth/users/conversations/files/admin）
│   └── ws/                 # WebSocket 端点（/ws/chat）与 upgrade 分发
├── src/                    # 前端 React SPA
│   ├── pages/              # 登录 / 注册 / 聊天 / 管理后台
│   ├── components/chat/    # 聊天界面组件
│   ├── store/              # 认证与聊天状态（WS 客户端）
│   └── api/                # API 客户端与类型
├── database/schema.sql     # 建表语句（与 db.ts 自动初始化一致，可手动导入）
├── scripts/                # 构建/启动脚本（.sh 与 Windows .ps1 双套）
│   ├── api-smoke.sh        # REST 接口冒烟
│   └── ws-smoke.mjs        # WebSocket 端到端冒烟
├── .env.example            # 配置模板
└── uploads/                # 文件存储目录（运行时自动创建）
```

## 开发环境（本机调试）

```bash
pnpm install
cp .env.example .env        # 按实际修改数据库连接
pnpm dev                    # http://localhost:5000（Express + Vite 中间件 + WS 同端口）
```

## Windows 内网服务器部署（生产）

### 1. 环境准备

1. **Node.js 20+**（建议 LTS）：<https://nodejs.org> 安装后执行：
   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
   或 `npm i -g pnpm`。
2. **MySQL 8**（或 MariaDB 10.4+）：安装后创建一个数据库账号（也可直接用 root）：
   ```sql
   CREATE USER 'im_app'@'localhost' IDENTIFIED BY '设置一个强密码';
   GRANT ALL PRIVILEGES ON `intranet\_im`.* TO 'im_app'@'localhost';
   FLUSH PRIVILEGES;
   ```
   > 应用启动时会自动执行 `CREATE DATABASE IF NOT EXISTS intranet_im` 并建表、种子管理员；
   > 若账号无建库权限，请手动创建数据库并导入 `database/schema.sql`。

### 2. 配置

复制 `.env.example` 为 `.env`，按实际情况修改：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `5000` |
| `DB_HOST` / `DB_PORT` | MySQL 地址/端口 | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 数据库账号/密码/库名 | - / - / `intranet_im` |
| `JWT_SECRET` | JWT 签名密钥，**生产必改为长随机串** | 内置开发值（启动会告警） |
| `TOKEN_TTL_SECONDS` | 登录态有效期（秒），`0` = 永久保持（默认） | `0`（永不超时） |
| `UPLOAD_DIR` | 文件存储目录（相对项目根或绝对路径） | `uploads` |
| `MAX_UPLOAD_MB` | 单文件大小上限（MB） | `100` |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | 连续登录失败锁定次数 / 锁定分钟 | `5` / `30` |
| `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` | 首次启动种子管理员账号/初始密码 | `admin` / `Admin@123456` |

> 种子管理员仅在数据库中不存在任何 admin 时创建，且 `must_change_password=1`，**首次登录会被强制要求修改密码**后才能进入系统。
> 数据库与全部表会在首次启动时自动创建（`CREATE DATABASE IF NOT EXISTS`），无需手动导入；若使用无建库权限的账号，请先手动建库并可选导入 `database/schema.sql`。

### 3. 构建与启动

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File scripts/build.ps1   # 产出 dist/ 与 dist-server/server.js
powershell -ExecutionPolicy Bypass -File scripts/start.ps1   # NODE_ENV=production 启动
```

浏览器访问 `http://服务器内网IP:5000`。需在 Windows 防火墙放行该端口（入站规则 → TCP 5000）。

### 4. 常驻运行（二选一）

**pm2（推荐，跨平台）**：
```powershell
npm i -g pm2 pm2-windows-startup
pm2-startup install
pm2 start dist-server/server.js --name intranet-im --time
pm2 save
```

**NSSM（注册为 Windows 服务）**：
```powershell
nssm install IntraChatIM "C:\Program Files\nodejs\node.exe" "C:\apps\intranet-im\dist-server\server.js"
nssm set IntraChatIM AppDirectory "C:\apps\intranet-im"
nssm set IntraChatIM AppEnvironmentExtra NODE_ENV=production PORT=5000
nssm start IntraChatIM
```

### 5. 反向代理（可选）

经 IIS(ARR) / Nginx 代理时，必须放行 WebSocket 升级头，Nginx 示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;   # WS 必需
    proxy_set_header Connection "upgrade";    # WS 必需
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;                 # 长连接（WS 心跳）不被代理提前断开
    client_max_body_size 100m;                # 单分片 ≤20MB，按上限放宽即可
}
```

### 6. 数据备份

- 数据库：`mysqldump -u im_app -p intranet_im > backup.sql`
- 文件：直接备份 `uploads/` 目录

## 验证与冒烟

```bash
bash scripts/api-smoke.sh     # REST 全链路：注册→审核→登录→私聊/群聊→文件→管理后台→权限负例
node scripts/ws-smoke.mjs     # WS 端到端：双端连接 + 实时投递
pnpm validate                 # tsc + eslint + stylelint
```

## 安全说明

- 密码使用 bcrypt（cost 10）哈希存储，永不落明文
- 全部 API（除注册/登录/健康检查）均需 JWT；文件下载按会话成员关系鉴权
- 管理接口强制 `admin` 角色；禁用账号即刻强制下线
- 生产部署务必修改：`JWT_SECRET`、`ADMIN_INITIAL_PASSWORD`、数据库账号密码
- 如跨楼层/跨楼宇访问，建议按上节加 HTTPS 反向代理

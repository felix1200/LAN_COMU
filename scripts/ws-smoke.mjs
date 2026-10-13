// ABOUTME: 端到端冒烟脚本：注册→管理员审核→登录→建立 WS 连接→实时消息投递验证（node scripts/ws-smoke.mjs）
import WebSocket from 'ws';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5000';
const WS_BASE = BASE.replace(/^http/, 'ws');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123456';

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function get(path, token) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function waitReady(ws) {
  // 握手完成 ≠ 服务端就绪（服务端需异步校验 token、挂载监听、注册在线状态），等待 ready 帧
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待服务端 ready 帧超时')), 8000);
    const onMessage = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ready') {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve();
        }
      } catch {
        // 忽略非 JSON 帧
      }
    };
    ws.on('message', onMessage);
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const ts = Date.now().toString(36);
  const u1 = `wsu1${ts}`;
  const u2 = `wsu2${ts}`;
  const password = 'smokepass123';

  // 1. 注册两个用户
  await post('/api/auth/register', { username: u1, password, displayName: '冒烟用户一' });
  await post('/api/auth/register', { username: u2, password, displayName: '冒烟用户二' });

  // 2. 未审核登录应被拒绝
  const pendingLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u1, password }),
  });
  if (pendingLogin.ok) {
    throw new Error('待审核用户竟然登录成功，审核闸口失效');
  }

  // 3. 管理员审核通过
  const admin = await post('/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  const pending = await get('/api/admin/users?status=pending', admin.token);
  for (const u of pending.users) {
    if (u.username === u1 || u.username === u2) {
      await post(`/api/admin/users/${u.id}/approve`, {}, admin.token);
    }
  }

  // 4. 双方登录并建立私聊
  const a = await post('/api/auth/login', { username: u1, password });
  const b = await post('/api/auth/login', { username: u2, password });
  const conv = (await post('/api/conversations/direct', { userId: b.user.id }, a.token)).conversation;

  // 5. WS 双端连接，A 发消息，B 应实时收到
  const received = [];
  const wsA = new WebSocket(`${WS_BASE}/ws/chat?token=${a.token}`);
  const wsB = new WebSocket(`${WS_BASE}/ws/chat?token=${b.token}`);
  wsB.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message:new') {
      received.push(msg.payload.message);
    }
  });
  await Promise.all([waitReady(wsA), waitReady(wsB)]);

  const content = `WS 冒烟测试消息 ${ts}`;
  wsA.send(
    JSON.stringify({
      type: 'message:send',
      payload: { conversationId: conv.id, msgType: 'text', content, clientId: 'smoke-1' },
    }),
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('8 秒内未收到 message:new 推送')), 8000);
    const poll = setInterval(() => {
      if (received.some((m) => m.content === content)) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });

  console.log('WS_SMOKE_OK 注册-审核-登录-WS实时投递 全链路正常');
  wsA.close();
  wsB.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('WS_SMOKE_FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});

// ABOUTME: /ws/chat 实时通讯端点：鉴权连接、在线状态、消息收发、已读与输入状态

import { WebSocket } from 'ws';
import { loadAuthUser, verifyToken, type AuthUser } from '../auth';
import {
  addSocket,
  broadcastAll,
  onlineUserIds,
  removeSocket,
  sendToConversation,
} from '../hub';
import { HttpError } from '../util';
import { createMessage, isMember, markRead, type MessageType } from '../services/messages';
import { createEndpoint, type WsMessage } from './registry';

const MESSAGE_TYPES: MessageType[] = ['text', 'file'];

interface SendPayload {
  conversationId?: number;
  msgType?: MessageType;
  content?: string;
  fileId?: number;
  clientId?: string;
}

interface ReadPayload {
  conversationId?: number;
}

function send(ws: WebSocket, msg: WsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handleClientMessage(user: AuthUser, ws: WebSocket, msg: WsMessage): Promise<void> {
  switch (msg.type) {
    case 'ping':
      send(ws, { type: 'pong', payload: null });
      return;

    case 'message:send': {
      const payload = (msg.payload ?? {}) as SendPayload;
      const conversationId = Number(payload.conversationId);
      const msgType = payload.msgType ?? 'text';
      const clientId = typeof payload.clientId === 'string' ? payload.clientId : undefined;
      try {
        if (!Number.isInteger(conversationId) || conversationId <= 0) {
          throw new HttpError(400, '会话参数错误');
        }
        if (!MESSAGE_TYPES.includes(msgType)) {
          throw new HttpError(400, '消息类型不支持');
        }
        const message = await createMessage(user, conversationId, msgType, String(payload.content ?? ''), payload.fileId ?? null);
        // 全量推给会话成员（含发送者其他端）；发送端用 ack 做乐观更新替换
        await sendToConversation(conversationId, { type: 'message:new', payload: { message } });
        send(ws, { type: 'message:ack', payload: { clientId, message } });
      } catch (err) {
        const text = err instanceof Error ? err.message : '发送失败';
        send(ws, { type: 'error', payload: { message: text, clientId } });
      }
      return;
    }

    case 'message:read': {
      const payload = (msg.payload ?? {}) as ReadPayload;
      const conversationId = Number(payload.conversationId);
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return;
      }
      if (!(await isMember(conversationId, user.id))) {
        return;
      }
      await markRead(conversationId, user.id);
      await sendToConversation(conversationId, {
        type: 'read:update',
        payload: { conversationId, userId: user.id },
      });
      return;
    }

    case 'typing': {
      const payload = (msg.payload ?? {}) as ReadPayload;
      const conversationId = Number(payload.conversationId);
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return;
      }
      if (!(await isMember(conversationId, user.id))) {
        return;
      }
      await sendToConversation(
        conversationId,
        { type: 'typing', payload: { conversationId, userId: user.id, displayName: user.displayName } },
        user.id,
      );
      return;
    }

    default:
      send(ws, { type: 'error', payload: { message: `未知消息类型：${msg.type}` } });
  }
}

/** 发送鉴权失败并关闭连接 */
function rejectUnauthorized(ws: WebSocket, reason = 'unauthorized'): void {
  send(ws, { type: 'error', payload: { message: '鉴权失败' } });
  try {
    ws.close(4001, reason);
  } catch {
    // 忽略
  }
}

export function setupChatEndpoint(): void {
  const wss = createEndpoint('/ws/chat');

  wss.on('connection', (ws: WebSocket) => {
    // 连接级鉴权改为「首帧鉴权」：token 通过首条 { type: 'auth' } 消息携带，
    // 不依赖 query string —— 部署代理（内网/预览域名）可能剥掉 upgrade 请求的查询参数，
    // 导致 ?token= 丢失后服务端一律鉴权失败（浏览器端也无法为 WS 设置自定义请求头）。
    let user: AuthUser | null = null;
    let alive = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const authTimer = setTimeout(() => {
      if (!user) {
        send(ws, { type: 'error', payload: { message: '鉴权超时' } });
        try {
          ws.close(4001, 'auth timeout');
        } catch {
          // 忽略
        }
      }
    }, 8000);

    ws.on('message', (raw: Buffer) => {
      void (async () => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(raw.toString()) as WsMessage;
        } catch {
          send(ws, { type: 'error', payload: { message: '消息格式错误' } });
          return;
        }

        // —— 尚未鉴权：仅接受 auth 帧（ping 心跳不打断）——
        if (!user) {
          if (msg.type === 'auth') {
            const token = String(((msg.payload ?? {}) as { token?: unknown }).token ?? '');
            const payload = token ? verifyToken(token) : null;
            const authed = payload ? await loadAuthUser(payload.sub) : null;
            if (!authed) {
              rejectUnauthorized(ws);
              return;
            }
            user = authed;
            clearTimeout(authTimer);

            // 上线
            const becameOnline = addSocket(user.id, ws);
            if (becameOnline) {
              broadcastAll({ type: 'presence', payload: { userId: user.id, online: true } });
            }
            send(ws, {
              type: 'ready',
              payload: { userId: user.id, onlineUserIds: onlineUserIds() },
            });

            // 心跳：30s 无响应则断开
            heartbeat = setInterval(() => {
              if (!alive) {
                ws.terminate();
                return;
              }
              alive = false;
              ws.ping();
            }, 30000);
            ws.on('pong', () => {
              alive = true;
            });
            return;
          }
          if (msg.type === 'ping') {
            send(ws, { type: 'pong', payload: null });
          } else {
            send(ws, { type: 'error', payload: { message: '连接尚未鉴权' } });
          }
          return;
        }

        // —— 已鉴权：业务分发 ——
        try {
          await handleClientMessage(user, ws, msg);
        } catch (err) {
          console.error('[ws] 处理消息异常：', err);
          send(ws, { type: 'error', payload: { message: '服务器内部错误' } });
        }
      })();
    });

    // 下线
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (user) {
        const becameOffline = removeSocket(user.id, ws);
        if (becameOffline) {
          broadcastAll({ type: 'presence', payload: { userId: user.id, online: false } });
        }
      }
    });

    ws.on('error', () => {
      // 异常统一交给 close 处理
    });
  });
}

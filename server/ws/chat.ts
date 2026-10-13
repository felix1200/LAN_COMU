// ABOUTME: /ws/chat 实时通讯端点：鉴权连接、在线状态、消息收发、已读与输入状态

import type { IncomingMessage } from 'http';
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

const MESSAGE_TYPES: MessageType[] = ['text', 'image', 'file'];

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

export function setupChatEndpoint(): void {
  const wss = createEndpoint('/ws/chat');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void (async () => {
      // 1) 连接级鉴权：token 走 query 参数
      const url = new URL(req.url ?? '/', 'http://localhost');
      const token = url.searchParams.get('token') ?? '';
      const payload = token ? verifyToken(token) : null;
      const user = payload ? await loadAuthUser(payload.sub) : null;
      if (!user) {
        send(ws, { type: 'error', payload: { message: '鉴权失败' } });
        ws.close(4001, 'unauthorized');
        return;
      }

      // 2) 上线
      const becameOnline = addSocket(user.id, ws);
      if (becameOnline) {
        broadcastAll({ type: 'presence', payload: { userId: user.id, online: true } });
      }
      send(ws, { type: 'ready', payload: { userId: user.id, onlineUserIds: onlineUserIds() } });

      // 3) 心跳：30s 无响应则断开
      let alive = true;
      const heartbeat = setInterval(() => {
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

      // 4) 业务消息
      ws.on('message', (raw: Buffer) => {
        void (async () => {
          let msg: WsMessage;
          try {
            msg = JSON.parse(raw.toString()) as WsMessage;
          } catch {
            send(ws, { type: 'error', payload: { message: '消息格式错误' } });
            return;
          }
          try {
            await handleClientMessage(user, ws, msg);
          } catch (err) {
            console.error('[ws] 处理消息异常：', err);
            send(ws, { type: 'error', payload: { message: '服务器内部错误' } });
          }
        })();
      });

      // 5) 下线
      ws.on('close', () => {
        clearInterval(heartbeat);
        const becameOffline = removeSocket(user.id, ws);
        if (becameOffline) {
          broadcastAll({ type: 'presence', payload: { userId: user.id, online: false } });
        }
      });

      ws.on('error', () => {
        // 异常统一交给 close 处理
      });
    })().catch((err) => {
      console.error('[ws] 连接初始化失败：', err);
      try {
        ws.close(1011, 'internal error');
      } catch {
        // 忽略
      }
    });
  });
}

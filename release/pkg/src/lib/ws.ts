// ABOUTME: 浏览器端 WebSocket 客户端：自动重连、心跳、JSON 协议

import { getToken } from '../api/client';
import type { WsMessage } from '../api/types';

export interface WsConnection {
  send: (msg: WsMessage) => void;
  close: () => void;
  isOpen: () => boolean;
}

interface WsOptions {
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  heartbeatMs?: number;
}

export function createChatConnection(opts: WsOptions): WsConnection {
  const { onMessage, onOpen, onClose, reconnect = true, heartbeatMs = 30000 } = opts;
  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  function connect(): void {
    const token = getToken();
    if (!token) {
      return;
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // token 走首条 auth 帧，不放进 URL：代理可能剥掉 upgrade 的查询参数导致鉴权失败
    ws = new WebSocket(`${protocol}//${location.host}/ws/chat`);

    ws.onopen = () => {
      // 首帧鉴权
      ws?.send(JSON.stringify({ type: 'auth', payload: { token } }));
      heartbeatTimer = setInterval(() => {
        ws?.send(JSON.stringify({ type: 'ping', payload: null }));
      }, heartbeatMs);
      onOpen?.();
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data) as WsMessage;
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        return;
      }
      onMessage(msg);
    };

    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      onClose?.();
      if (reconnect && !closed) {
        setTimeout(connect, 1500);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return {
    send: (msg: WsMessage) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close: () => {
      closed = true;
      clearInterval(heartbeatTimer);
      ws?.close();
    },
    isOpen: () => ws !== null && ws.readyState === WebSocket.OPEN,
  };
}

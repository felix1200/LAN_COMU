// ABOUTME: WS 端点注册表与 HTTP upgrade 分发；独立成模块以避免端点与编排层循环依赖

import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

const endpoints = new Map<string, WebSocketServer>();

export function createEndpoint(path: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  endpoints.set(path, wss);
  return wss;
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  let pathname: string;
  try {
    pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
  } catch {
    socket.destroy();
    return;
  }
  const wss = endpoints.get(pathname);
  if (wss) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
}

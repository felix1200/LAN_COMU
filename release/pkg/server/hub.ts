// ABOUTME: 在线状态与推送中枢：维护 userId -> WebSocket 集合，供 REST 与 WS 共用
// ABOUTME: 内网规模下按收件人逐连接推送，无需房间表

import type { WebSocket } from 'ws';
import { query } from './db';

export interface WsOutbound<T = unknown> {
  type: string;
  payload: T;
}

const userSockets = new Map<number, Set<WebSocket>>();

/** 登记连接；返回该用户是否由此变为在线（首个连接） */
export function addSocket(userId: number, ws: WebSocket): boolean {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  const becameOnline = set.size === 0;
  set.add(ws);
  return becameOnline;
}

/** 移除连接；返回该用户是否由此变为离线（最后一个连接断开） */
export function removeSocket(userId: number, ws: WebSocket): boolean {
  const set = userSockets.get(userId);
  if (!set) {
    return false;
  }
  set.delete(ws);
  if (set.size === 0) {
    userSockets.delete(userId);
    return true;
  }
  return false;
}

export function onlineUserIds(): number[] {
  return [...userSockets.keys()];
}

export function isOnline(userId: number): boolean {
  return userSockets.has(userId);
}

/** 推送给某用户的所有在线连接 */
export function sendToUser<T>(userId: number, msg: WsOutbound<T>): void {
  const set = userSockets.get(userId);
  if (!set) {
    return;
  }
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

/** 推送给全站在线用户 */
export function broadcastAll<T>(msg: WsOutbound<T>): void {
  for (const userId of userSockets.keys()) {
    sendToUser(userId, msg);
  }
}

/** 推送给某会话的全部成员（可排除某人，例如操作发起者） */
export async function sendToConversation<T>(conversationId: number, msg: WsOutbound<T>, excludeUserId?: number): Promise<void> {
  const members = await query<{ user_id: number }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
    [conversationId],
  );
  for (const member of members) {
    const memberId = Number(member.user_id);
    if (excludeUserId !== undefined && memberId === excludeUserId) {
      continue;
    }
    sendToUser(memberId, msg);
  }
}

/** 强制断开某用户的全部连接（账号被禁用时调用） */
export function forceDisconnect(userId: number): void {
  const set = userSockets.get(userId);
  if (!set) {
    return;
  }
  for (const ws of set) {
    try {
      ws.close(4003, 'account disabled');
    } catch {
      // 忽略关闭异常
    }
  }
}

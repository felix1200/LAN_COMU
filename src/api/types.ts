// ABOUTME: 与后端对齐的数据结构定义

export type Role = 'admin' | 'member';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';
export type MessageType = 'text' | 'file';
export type ConversationType = 'direct' | 'group';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  avatarId?: number | null;
  /** 预置管理员首次登录需强制改密；为 true 时前端必须引导修改密码后才能进入业务界面 */
  mustChangePassword?: boolean;
}

export interface FileRef {
  id: number;
  name: string;
  size: number;
  mime: string;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  type: MessageType;
  content: string;
  file: FileRef | null;
  createdAt: string;
}

export interface OtherUser {
  id: number;
  username: string;
  displayName: string;
  avatarId?: number | null;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  name: string | null;
  title: string;
  creatorId: number | null;
  memberCount: number;
  unreadCount: number;
  otherUser: OtherUser | null;
  lastMessage: Message | null;
  createdAt: string;
}

export interface Member {
  id: number;
  username: string;
  displayName: string;
  avatarId: number | null;
  isCreator: boolean;
  joinedAt: string;
  lastReadAt: string;
}

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  avatarId: number | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
}

export interface MessageSearchHit {
  conversationId: number;
  conversationTitle: string;
  message: Message;
}

export interface MessageSearchResult {
  results: MessageSearchHit[];
  hasMore: boolean;
}

export interface AdminStats {
  users: { total: number; pending: number; approved: number; rejected: number; disabled: number };
  conversations: { group: number };
  messages: { total: number; today: number };
  files: { count: number; bytes: number };
  online: number;
}

// ---- WebSocket 协议 ----

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

export interface WsReadyPayload {
  userId: number;
  onlineUserIds: number[];
}

export interface WsPresencePayload {
  userId: number;
  online: boolean;
}

export interface WsConversationPayload {
  conversation: Conversation;
}

export interface WsMessagePayload {
  message: Message;
}

export interface WsAckPayload {
  clientId?: string;
  message: Message;
}

export interface WsReadPayload {
  conversationId: number;
  userId: number;
}

export interface WsTypingPayload {
  conversationId: number;
  userId: number;
  displayName: string;
}

export interface WsErrorPayload {
  message: string;
  clientId?: string;
}

export interface WsRemovedPayload {
  conversationId: number;
}

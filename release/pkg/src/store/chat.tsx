// ABOUTME: 聊天状态中枢：WS 连接管理、会话/消息状态、乐观发送、未读与在线状态

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken } from '../api/client';
import type {
  Conversation,
  FileRef,
  Member,
  Message,
  MessageType,
  User,
  WsAckPayload,
  WsConversationPayload,
  WsErrorPayload,
  WsMessage,
  WsMessagePayload,
  WsPresencePayload,
  WsReadPayload,
  WsReadyPayload,
  WsRemovedPayload,
  WsTypingPayload,
} from '../api/types';
import { createChatConnection, type WsConnection } from '../lib/ws';
import { toast } from '../lib/toast';
import { useAuth } from './auth';

export type WsStatus = 'connecting' | 'online' | 'offline';

export interface UiMessage extends Message {
  clientId?: string;
  pending?: boolean;
  failed?: boolean;
}

interface ConversationMessages {
  messages: UiMessage[];
  hasMore: boolean;
  loaded: boolean;
}

interface TypingEntry {
  userId: number;
  displayName: string;
  expiresAt: number;
}

interface ChatContextValue {
  wsStatus: WsStatus;
  conversations: Conversation[];
  contacts: User[];
  onlineIds: Set<number>;
  totalUnread: number;
  activeId: number | null;
  activeConversation: Conversation | null;
  messages: UiMessage[];
  hasMore: boolean;
  loadingMessages: boolean;
  sending: boolean;
  typingEntries: TypingEntry[];
  peerReadAt: string | null;
  /** 当前会话成员（含各自 lastReadAt/avatarId），用于群聊 X/Y 已读统计 */
  activeMembers: Member[];
  openConversation: (id: number) => Promise<void>;
  clearActive: () => void;
  loadMore: () => Promise<void>;
  sendMessage: (msgType: MessageType, content: string, file?: FileRef | null) => void;
  sendTyping: () => void;
  startDirect: (userId: number) => Promise<void>;
  createGroup: (name: string, memberIds: number[]) => Promise<number>;
  refreshConversations: () => Promise<void>;
  refreshContacts: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const PAGE_SIZE = 30;

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : Date.parse(a.createdAt);
    const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : Date.parse(b.createdAt);
    return tb - ta;
  });
}

function genClientId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<number, ConversationMessages>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingByConv, setTypingByConv] = useState<Record<number, TypingEntry[]>>({});
  const [peerReadByConv, setPeerReadByConv] = useState<Record<number, string>>({});
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);

  const wsRef = useRef<WsConnection | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const myIdRef = useRef<number>(0);
  const lastTypingSentRef = useRef(0);

  myIdRef.current = user?.id ?? 0;

  const setActive = useCallback((id: number | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  // ---- 数据加载 ----

  const refreshConversations = useCallback(async () => {
    const res = await api<{ conversations: Conversation[] }>('/api/conversations');
    setConversations(sortConversations(res.conversations));
  }, []);

  const refreshContacts = useCallback(async () => {
    const res = await api<{ users: User[] }>('/api/users');
    setContacts(res.users);
  }, []);

  /** 刷新当前会话成员（含 lastReadAt），群聊用于 X/Y 已读统计 */
  const refreshActiveMembers = useCallback(async (conversationId: number) => {
    const res = await api<{ members: Member[] }>(`/api/conversations/${conversationId}/members`);
    setActiveMembers(res.members);
  }, []);

  const markRead = useCallback((conversationId: number) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
    void api(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {
      // 已读失败不影响使用
    });
  }, []);

  // ---- WS 事件处理 ----

  const upsertConversation = useCallback((conv: Conversation) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conv.id);
      const normalized =
        conv.id === activeIdRef.current ? { ...conv, unreadCount: 0 } : conv;
      const next = exists
        ? prev.map((c) => (c.id === conv.id ? normalized : c))
        : [normalized, ...prev];
      return sortConversations(next);
    });
  }, []);

  const appendMessage = useCallback((message: UiMessage) => {
    const cid = message.conversationId;
    setMessagesByConv((prev) => {
      const entry = prev[cid];
      if (!entry || !entry.loaded) {
        return prev;
      }
      if (entry.messages.some((m) => m.id === message.id)) {
        return prev;
      }
      return { ...prev, [cid]: { ...entry, messages: [...entry.messages, message] } };
    });
  }, []);

  const handleIncomingMessage = useCallback(
    (message: Message) => {
      const cid = message.conversationId;
      const isActive = cid === activeIdRef.current;
      const fromMe = message.senderId === myIdRef.current;

      appendMessage(message);
      setConversations((prev) => {
        const target = prev.find((c) => c.id === cid);
        if (!target) {
          // 本地还没有该会话（例如刚被拉进新群），全量刷新
          void refreshConversations();
          return prev;
        }
        const updated: Conversation = {
          ...target,
          lastMessage: message,
          unreadCount: !isActive && !fromMe ? target.unreadCount + 1 : target.unreadCount,
        };
        return sortConversations([updated, ...prev.filter((c) => c.id !== cid)]);
      });

      if (isActive && !fromMe) {
        markRead(cid);
      }
    },
    [appendMessage, markRead, refreshConversations],
  );

  const handleAck = useCallback((payload: WsAckPayload) => {
    const { clientId, message } = payload;
    if (!clientId) {
      return;
    }
    const cid = message.conversationId;
    setMessagesByConv((prev) => {
      const entry = prev[cid];
      if (!entry) {
        return prev;
      }
      const hasReal = entry.messages.some((m) => m.id === message.id);
      return {
        ...prev,
        [cid]: {
          ...entry,
          messages: entry.messages
            .filter((m) => !(hasReal && m.clientId === clientId))
            .map((m) => (m.clientId === clientId ? { ...message } : m)),
        },
      };
    });
    setSending(false);
  }, []);

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case 'ready': {
          const payload = msg.payload as WsReadyPayload;
          setWsStatus('online');
          setOnlineIds(new Set(payload.onlineUserIds.map(Number)));
          void refreshConversations();
          break;
        }
        case 'presence': {
          const payload = msg.payload as WsPresencePayload;
          setOnlineIds((prev) => {
            const next = new Set(prev);
            if (payload.online) {
              next.add(Number(payload.userId));
            } else {
              next.delete(Number(payload.userId));
            }
            return next;
          });
          break;
        }
        case 'conversation:new':
        case 'conversation:updated': {
          const payload = msg.payload as WsConversationPayload;
          upsertConversation(payload.conversation);
          break;
        }
        case 'conversation:removed': {
          const payload = msg.payload as WsRemovedPayload;
          setConversations((prev) => prev.filter((c) => c.id !== payload.conversationId));
          setMessagesByConv((prev) => {
            const next = { ...prev };
            delete next[payload.conversationId];
            return next;
          });
          if (activeIdRef.current === payload.conversationId) {
            setActive(null);
          }
          break;
        }
        case 'message:new': {
          const payload = msg.payload as WsMessagePayload;
          handleIncomingMessage(payload.message);
          break;
        }
        case 'message:ack': {
          handleAck(msg.payload as WsAckPayload);
          break;
        }
        case 'read:update': {
          const payload = msg.payload as WsReadPayload;
          if (payload.userId === myIdRef.current) {
            break;
          }
          if (activeIdRef.current === payload.conversationId) {
            // 群聊 read:update 需刷新成员已读位置；私聊直接更新已读时间
            const active = conversations.find((c) => c.id === payload.conversationId);
            if (active?.type === 'group') {
              void refreshActiveMembers(payload.conversationId).catch(() => undefined);
            } else {
              setPeerReadByConv((prev) => ({
                ...prev,
                [payload.conversationId]: new Date().toISOString(),
              }));
            }
          }
          break;
        }
        case 'typing': {
          const payload = msg.payload as WsTypingPayload;
          const entry: TypingEntry = {
            userId: payload.userId,
            displayName: payload.displayName,
            expiresAt: Date.now() + 3500,
          };
          setTypingByConv((prev) => {
            const list = (prev[payload.conversationId] ?? []).filter((e) => e.userId !== entry.userId);
            return { ...prev, [payload.conversationId]: [...list, entry] };
          });
          setTimeout(() => {
            setTypingByConv((prev) => {
              const list = (prev[payload.conversationId] ?? []).filter((e) => e.expiresAt > Date.now());
              return { ...prev, [payload.conversationId]: list };
            });
          }, 3600);
          break;
        }
        case 'account:disabled': {
          toast('账号已被管理员禁用', 'error');
          logout();
          break;
        }
        case 'error': {
          const payload = msg.payload as WsErrorPayload;
          toast(payload.message, 'error');
          if (payload.clientId) {
            const clientId = payload.clientId;
            setMessagesByConv((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(next)) {
                const cid = Number(key);
                next[cid] = {
                  ...next[cid],
                  messages: next[cid].messages.map((m) =>
                    m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
                  ),
                };
              }
              return next;
            });
          }
          setSending(false);
          break;
        }
        default:
          break;
      }
    },
    [handleAck, handleIncomingMessage, logout, refreshActiveMembers, refreshConversations, setActive, upsertConversation],
  );

  // ---- 连接生命周期 ----

  useEffect(() => {
    if (!user || !getToken()) {
      return;
    }
    setWsStatus('connecting');
    const conn = createChatConnection({
      onMessage: handleWsMessage,
      onClose: () => setWsStatus((prev) => (prev === 'online' ? 'offline' : 'connecting')),
    });
    wsRef.current = conn;

    void refreshConversations().catch(() => undefined);
    void refreshContacts().catch(() => undefined);

    return () => {
      conn.close();
      wsRef.current = null;
    };
  }, [user, handleWsMessage, refreshConversations, refreshContacts]);

  // ---- 对外动作 ----

  const openConversation = useCallback(
    async (id: number) => {
      setActive(id);
      setActiveMembers([]);
      const target = conversations.find((c) => c.id === id);
      if (target?.type === 'group') {
        void refreshActiveMembers(id).catch(() => undefined);
      }
      setMessagesByConv((prev) => {
        if (prev[id]?.loaded) {
          return prev;
        }
        return { ...prev, [id]: { messages: [], hasMore: false, loaded: false } };
      });

      const entry = messagesByConv[id];
      if (!entry?.loaded) {
        setLoadingMessages(true);
        try {
          const res = await api<{ messages: Message[]; hasMore: boolean }>(
            `/api/conversations/${id}/messages?limit=${PAGE_SIZE}`,
          );
          setMessagesByConv((prev) => ({
            ...prev,
            [id]: { messages: res.messages, hasMore: res.hasMore, loaded: true },
          }));
        } catch (err) {
          toast(err instanceof Error ? err.message : '消息加载失败', 'error');
        } finally {
          setLoadingMessages(false);
        }
      }
      markRead(id);
    },
    [markRead, messagesByConv, refreshActiveMembers, setActive],
  );

  const clearActive = useCallback(() => {
    setActive(null);
    setActiveMembers([]);
  }, [setActive]);

  const loadMore = useCallback(async () => {
    const cid = activeIdRef.current;
    if (!cid) {
      return;
    }
    const entry = messagesByConv[cid];
    if (!entry?.loaded || !entry.hasMore || entry.messages.length === 0) {
      return;
    }
    const before = entry.messages[0].id;
    const res = await api<{ messages: Message[]; hasMore: boolean }>(
      `/api/conversations/${cid}/messages?limit=${PAGE_SIZE}&before=${before}`,
    );
    setMessagesByConv((prev) => {
      const current = prev[cid];
      if (!current) {
        return prev;
      }
      return {
        ...prev,
        [cid]: { messages: [...res.messages, ...current.messages], hasMore: res.hasMore, loaded: true },
      };
    });
  }, [messagesByConv]);

  const sendMessage = useCallback(
    (msgType: MessageType, content: string, file?: FileRef | null) => {
      const cid = activeIdRef.current;
      const me = myIdRef.current;
      if (!cid || !me) {
        return;
      }
      const trimmed = content.trim();
      if (msgType === 'text' && !trimmed) {
        return;
      }
      const clientId = genClientId();
      const optimistic: UiMessage = {
        id: -Date.now(),
        conversationId: cid,
        senderId: me,
        senderName: user?.displayName ?? '',
        type: msgType,
        content: trimmed,
        file: file ?? null,
        createdAt: new Date().toISOString(),
        clientId,
        pending: true,
      };
      setSending(true);
      appendMessage(optimistic);
      setConversations((prev) => {
        const target = prev.find((c) => c.id === cid);
        if (!target) {
          return prev;
        }
        return sortConversations([
          { ...target, lastMessage: optimistic },
          ...prev.filter((c) => c.id !== cid),
        ]);
      });

      if (wsRef.current?.isOpen()) {
        wsRef.current.send({
          type: 'message:send',
          payload: { conversationId: cid, msgType, content: trimmed, fileId: file?.id ?? null, clientId },
        });
      } else {
        // WS 断开时降级走 REST
        void api<{ message: Message }>(`/api/conversations/${cid}/messages`, {
          method: 'POST',
          body: { type: msgType, content: trimmed, fileId: file?.id ?? null },
        })
          .then((res) => handleAck({ clientId, message: res.message }))
          .catch((err: unknown) => {
            toast(err instanceof Error ? err.message : '发送失败', 'error');
            setSending(false);
          });
      }
      // 发送即已读
      markRead(cid);
    },
    [appendMessage, handleAck, markRead, user],
  );

  const sendTyping = useCallback(() => {
    const cid = activeIdRef.current;
    const now = Date.now();
    if (!cid || now - lastTypingSentRef.current < 2000) {
      return;
    }
    lastTypingSentRef.current = now;
    wsRef.current?.send({ type: 'typing', payload: { conversationId: cid } });
  }, []);

  const startDirect = useCallback(
    async (userId: number) => {
      const res = await api<{ conversation: Conversation }>('/api/conversations/direct', {
        method: 'POST',
        body: { userId },
      });
      upsertConversation(res.conversation);
      await openConversation(res.conversation.id);
    },
    [openConversation, upsertConversation],
  );

  const createGroup = useCallback(
    async (name: string, memberIds: number[]) => {
      const res = await api<{ conversation: Conversation }>('/api/conversations/group', {
        method: 'POST',
        body: { name, memberIds },
      });
      upsertConversation(res.conversation);
      await openConversation(res.conversation.id);
      return res.conversation.id;
    },
    [openConversation, upsertConversation],
  );

  // ---- 派生状态 ----

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const activeEntry = activeId !== null ? messagesByConv[activeId] : undefined;
  const now = Date.now();
  const typingEntries = (activeId !== null ? typingByConv[activeId] ?? [] : []).filter(
    (e) => e.expiresAt > now && e.userId !== myIdRef.current,
  );
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const value: ChatContextValue = {
    wsStatus,
    conversations,
    contacts,
    onlineIds,
    totalUnread,
    activeId,
    activeConversation,
    messages: activeEntry?.messages ?? [],
    hasMore: activeEntry?.hasMore ?? false,
    loadingMessages,
    sending,
    typingEntries,
    peerReadAt: activeId !== null ? peerReadByConv[activeId] ?? null : null,
    activeMembers,
    openConversation,
    clearActive,
    loadMore,
    sendMessage,
    sendTyping,
    startDirect,
    createGroup,
    refreshConversations,
    refreshContacts,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat 必须在 ChatProvider 内使用');
  }
  return ctx;
}

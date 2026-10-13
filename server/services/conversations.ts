// ABOUTME: 会话领域服务：会话列表 DTO（含未读数、最后一条消息、私聊对方信息）、成员管理

import { execute, query, queryOne } from '../db';
import { sendToConversation, sendToUser } from '../hub';
import { HttpError, toISO } from '../util';
import { MESSAGE_SELECT, rowToMessage, type MessageDTO, type MessageRow } from './messages';

export interface OtherUser {
  id: number;
  username: string;
  displayName: string;
}

export interface ConversationDTO {
  id: number;
  type: 'direct' | 'group';
  name: string | null;
  title: string;
  creatorId: number | null;
  memberCount: number;
  unreadCount: number;
  otherUser: OtherUser | null;
  lastMessage: MessageDTO | null;
  createdAt: string;
}

export interface MemberDTO {
  id: number;
  username: string;
  displayName: string;
  isCreator: boolean;
  joinedAt: string;
  lastReadAt: string;
}

interface ConvRow {
  id: number;
  type: 'direct' | 'group';
  name: string | null;
  creatorId: number | null;
  createdAt: Date | string;
  memberCount: number;
  unreadCount: number;
  lastMessageId: number | null;
}

interface OtherRow {
  conversationId: number;
  id: number;
  username: string;
  displayName: string;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

/** 构建某用户视角的会话 DTO 列表；conversationId 限定时只取单个会话 */
async function buildConversations(userId: number, conversationId?: number): Promise<ConversationDTO[]> {
  const params: unknown[] = [userId, userId];
  let sql = `
    SELECT c.id, c.type, c.name,
           c.creator_id AS creatorId,
           c.created_at AS createdAt,
           (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS memberCount,
           (SELECT COUNT(*) FROM messages msg
             WHERE msg.conversation_id = c.id AND msg.sender_id <> ? AND msg.created_at > m.last_read_at) AS unreadCount,
           (SELECT MAX(msg.id) FROM messages msg WHERE msg.conversation_id = c.id) AS lastMessageId
    FROM conversations c
    JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
  `;
  if (conversationId !== undefined) {
    sql += ' WHERE c.id = ?';
    params.push(conversationId);
  }
  const convs = await query<ConvRow>(sql, params);
  if (convs.length === 0) {
    return [];
  }

  // 最后一条消息（批量）
  const lastIds = convs.map((c) => c.lastMessageId).filter((v): v is number => v !== null).map(Number);
  const lastRows = lastIds.length
    ? await query<MessageRow>(`${MESSAGE_SELECT} WHERE m.id IN (${placeholders(lastIds.length)})`, lastIds)
    : [];
  const lastMap = new Map<number, MessageDTO>();
  for (const row of lastRows) {
    lastMap.set(Number(row.conversationId), rowToMessage(row));
  }

  // 私聊对方信息（批量）
  const directIds = convs.filter((c) => c.type === 'direct').map((c) => Number(c.id));
  const otherRows = directIds.length
    ? await query<OtherRow>(
        `SELECT cm.conversation_id AS conversationId, u.id, u.username, u.display_name AS displayName
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.conversation_id IN (${placeholders(directIds.length)}) AND cm.user_id <> ?`,
        [...directIds, userId],
      )
    : [];
  const otherMap = new Map<number, OtherUser>();
  for (const row of otherRows) {
    otherMap.set(Number(row.conversationId), {
      id: Number(row.id),
      username: row.username,
      displayName: row.displayName,
    });
  }

  const list: ConversationDTO[] = convs.map((c) => {
    const id = Number(c.id);
    const other = c.type === 'direct' ? otherMap.get(id) ?? null : null;
    return {
      id,
      type: c.type,
      name: c.name,
      title: c.type === 'group' ? c.name ?? '未命名群聊' : other?.displayName ?? '未知用户',
      creatorId: c.creatorId !== null ? Number(c.creatorId) : null,
      memberCount: Number(c.memberCount),
      unreadCount: Number(c.unreadCount),
      otherUser: other,
      lastMessage: lastMap.get(id) ?? null,
      createdAt: toISO(c.createdAt),
    };
  });

  list.sort((a, b) => {
    const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : Date.parse(a.createdAt);
    const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : Date.parse(b.createdAt);
    return tb - ta;
  });
  return list;
}

export async function listConversationsFor(userId: number): Promise<ConversationDTO[]> {
  return buildConversations(userId);
}

export async function getConversationFor(conversationId: number, userId: number): Promise<ConversationDTO> {
  const list = await buildConversations(userId, conversationId);
  if (list.length === 0) {
    throw new HttpError(404, '会话不存在或你不在会话中');
  }
  return list[0];
}

export async function listMembers(conversationId: number): Promise<MemberDTO[]> {
  const rows = await query<{
    id: number;
    username: string;
    displayName: string;
    isCreator: number;
    joinedAt: Date | string;
    lastReadAt: Date | string;
  }>(
    `SELECT u.id, u.username, u.display_name AS displayName,
            (c.creator_id = u.id) AS isCreator,
            cm.joined_at AS joinedAt,
            cm.last_read_at AS lastReadAt
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = ?
     ORDER BY isCreator DESC, cm.joined_at ASC`,
    [conversationId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    username: r.username,
    displayName: r.displayName,
    isCreator: Number(r.isCreator) === 1,
    joinedAt: toISO(r.joinedAt),
    lastReadAt: toISO(r.lastReadAt),
  }));
}

/** 向各成员推送其个人视角的会话 DTO（新建会话/成员变化时调用） */
export async function pushConversationToMembers(conversationId: number, memberIds: number[], event: 'conversation:new' | 'conversation:updated'): Promise<void> {
  for (const memberId of memberIds) {
    try {
      const dto = await getConversationFor(conversationId, memberId);
      sendToUser(memberId, { type: event, payload: { conversation: dto } });
    } catch {
      // 成员可能已被移出，忽略
    }
  }
}

export function directKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

interface ConvBasicRow {
  id: number;
  type: 'direct' | 'group';
  creator_id: number | null;
}

export async function getConversationBasic(conversationId: number): Promise<ConvBasicRow | null> {
  const row = await queryOne<ConvBasicRow>('SELECT id, type, creator_id FROM conversations WHERE id = ?', [conversationId]);
  return row;
}

/** 解散/删除会话：清理成员与消息，并通知原成员 */
export async function deleteConversation(conversationId: number): Promise<number[]> {
  const members = await query<{ user_id: number }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
    [conversationId],
  );
  const memberIds = members.map((m) => Number(m.user_id));
  await execute('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  await execute('DELETE FROM conversation_members WHERE conversation_id = ?', [conversationId]);
  await execute('DELETE FROM conversations WHERE id = ?', [conversationId]);
  for (const memberId of memberIds) {
    sendToUser(memberId, { type: 'conversation:removed', payload: { conversationId } });
  }
  return memberIds;
}

/** 会话成员变化后广播刷新 */
export async function notifyMembersChanged(conversationId: number): Promise<void> {
  const members = await query<{ user_id: number }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
    [conversationId],
  );
  const ids = members.map((m) => Number(m.user_id));
  await pushConversationToMembers(conversationId, ids, 'conversation:updated');
  await sendToConversation(conversationId, { type: 'members:changed', payload: { conversationId } });
}

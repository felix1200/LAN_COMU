// ABOUTME: 消息领域服务：消息 DTO 组装、发送（REST 与 WS 共用）、分页查询

import type { AuthUser } from '../auth';
import { execute, query, queryOne } from '../db';
import { HttpError, toISO } from '../util';

export type MessageType = 'text' | 'file'; // 需求基线：消息仅文字 / 文件

export interface FileRef {
  id: number;
  name: string;
  size: number;
  mime: string;
}

export interface MessageDTO {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  type: MessageType;
  content: string;
  file: FileRef | null;
  createdAt: string;
}

export interface MessageRow {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  type: MessageType;
  content: string;
  createdAt: Date | string;
  fileId: number | null;
  fileName: string | null;
  fileSize: number | null;
  fileMime: string | null;
}

export const MESSAGE_SELECT = `
  SELECT m.id,
         m.conversation_id AS conversationId,
         m.sender_id       AS senderId,
         u.display_name    AS senderName,
         m.type,
         m.content,
         m.created_at      AS createdAt,
         f.id              AS fileId,
         f.original_name   AS fileName,
         f.size            AS fileSize,
         f.mime            AS fileMime
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  LEFT JOIN files f ON f.id = m.file_id
`;

export function rowToMessage(row: MessageRow): MessageDTO {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversationId),
    senderId: Number(row.senderId),
    senderName: row.senderName,
    type: row.type,
    content: row.content,
    createdAt: toISO(row.createdAt),
    file: row.fileId
      ? {
          id: Number(row.fileId),
          name: row.fileName ?? '附件',
          size: Number(row.fileSize ?? 0),
          mime: row.fileMime ?? 'application/octet-stream',
        }
      : null,
  };
}

export async function isMember(conversationId: number, userId: number): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId],
  );
  return row !== null;
}

/** 创建一条消息（校验成员身份与文件归属），返回完整 DTO */
export async function createMessage(
  sender: AuthUser,
  conversationId: number,
  type: MessageType,
  content: string,
  fileId?: number | null,
): Promise<MessageDTO> {
  if (!(await isMember(conversationId, sender.id))) {
    throw new HttpError(403, '你不在该会话中');
  }
  const trimmed = (content ?? '').trim();
  if (type === 'text' && !trimmed) {
    throw new HttpError(400, '消息内容不能为空');
  }
  // 需求基线：文字消息 ≤ 2000 字
  if (trimmed.length > 2000) {
    throw new HttpError(400, '消息内容过长（最多 2000 字）');
  }

  let fileRef: number | null = null;
  if (type === 'file') {
    if (!fileId) {
      throw new HttpError(400, '缺少附件');
    }
    const file = await queryOne<{ id: number; uploader_id: number }>(
      'SELECT id, uploader_id FROM files WHERE id = ?',
      [fileId],
    );
    if (!file) {
      throw new HttpError(400, '附件不存在');
    }
    if (Number(file.uploader_id) !== sender.id) {
      throw new HttpError(403, '只能发送自己上传的附件');
    }
    fileRef = Number(file.id);
  }

  const { insertId } = await execute(
    'INSERT INTO messages (conversation_id, sender_id, type, content, file_id) VALUES (?, ?, ?, ?, ?)',
    [conversationId, sender.id, type, trimmed, fileRef],
  );
  const row = await queryOne<MessageRow>(`${MESSAGE_SELECT} WHERE m.id = ?`, [insertId]);
  if (!row) {
    throw new HttpError(500, '消息写入失败');
  }
  return rowToMessage(row);
}

/** 分页拉取消息（按 id 倒序向前翻），返回正序数组 */
export async function listMessages(conversationId: number, beforeId: number | null, limit: number): Promise<MessageDTO[]> {
  const params: unknown[] = [conversationId];
  let sql = `${MESSAGE_SELECT} WHERE m.conversation_id = ?`;
  if (beforeId) {
    sql += ' AND m.id < ?';
    params.push(beforeId);
  }
  sql += ' ORDER BY m.id DESC LIMIT ?';
  params.push(limit);
  const rows = await query<MessageRow>(sql, params);
  return rows.map(rowToMessage).reverse();
}

/** 更新已读位置 */
export async function markRead(conversationId: number, userId: number): Promise<void> {
  await execute(
    'UPDATE conversation_members SET last_read_at = NOW(3) WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId],
  );
}

export interface MessageSearchHit extends MessageDTO {
  conversationTitle: string;
}

/** 全部历史会话文字检索（仅本用户参与的会话），按时间倒序分页 */
export async function searchMessages(
  userId: number,
  keyword: string,
  limit: number,
  beforeId?: number,
): Promise<{ results: MessageSearchHit[]; hasMore: boolean }> {
  const escaped = keyword.replace(/[\\%_]/g, '\\$&');
  const like = `%${escaped}%`;
  const params: (string | number)[] = [userId, like];
  let cursor = '';
  if (beforeId) {
    cursor = 'AND m.id < ?';
    params.push(beforeId);
  }
  const sql = `
    ${MESSAGE_SELECT}
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
    WHERE m.type = 'text' AND m.content LIKE ?
    ${cursor}
    ORDER BY m.id DESC
    LIMIT ?
  `;
  params.push(limit + 1);
  const rows = await query<MessageRow>(sql, params);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const results: MessageSearchHit[] = [];
  for (const row of page) {
    results.push({ ...rowToMessage(row), conversationTitle: '' });
  }
  if (results.length === 0) {
    return { results: [], hasMore: false };
  }

  // 补充会话展示标题（群=群名；私聊=对方真实姓名）
  const convIds = [...new Set(results.map((r) => r.conversationId))];
  const titles = await query<{ conversationId: number; title: string }>(
    `SELECT c.id AS conversationId,
            CASE
              WHEN c.type = 'group' THEN COALESCE(c.name, '群聊')
              ELSE (SELECT u.display_name FROM conversation_members me
                    JOIN users u ON u.id = me.user_id
                    WHERE me.conversation_id = c.id AND me.user_id <> ? LIMIT 1)
            END AS title
     FROM conversations c
     WHERE c.id IN (${convIds.map(() => '?').join(',')})`,
    [userId, ...convIds],
  );
  const titleMap = new Map(titles.map((t) => [Number(t.conversationId), t.title]));
  for (const r of results) {
    r.conversationTitle = titleMap.get(r.conversationId) ?? '会话';
  }
  return { results, hasMore };
}
